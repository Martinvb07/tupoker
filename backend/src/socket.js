import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { COOKIE, userFromToken } from './auth.js';
import { Group, User } from './models.js';
import { getTable, save, markOnline, viewFor, GameError } from './game/manager.js';
import * as engine from './game/engine.js';
import { setIO, broadcast, roomOf } from './hub.js';
import { cleanSettings, seatFor } from './routes/tables.js';

export function initSocket(httpServer) {
  const io = new Server(httpServer, { path: '/socket.io', cors: { origin: false } });
  setIO(io);

  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie || '');
    const user = await userFromToken(cookies[COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user._id.toString();
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const uid = socket.data.userId;
    socket.join(`user:${uid}`);
    socket.data.tables = new Set();

    // Ejecuta una operación sobre la mesa, guarda y emite el nuevo estado.
    const handle = (event, fn, { dealerOnly = false } = {}) => {
      socket.on(event, async (payload = {}, ack = () => {}) => {
        try {
          const table = await getTable(payload.code);
          if (!table) throw new GameError('Mesa no encontrada');
          if (table.status === 'closed' && event !== 'table:subscribe') throw new GameError('La mesa está cerrada');
          if (dealerOnly && table.dealerId !== uid) throw new GameError('Solo el dealer puede hacer esto');
          const result = await fn(table, payload);
          if (result !== false) {
            save(table);
            broadcast(table);
          }
          ack({ ok: true });
        } catch (e) {
          if (!(e instanceof GameError)) console.error(`[${event}]`, e);
          ack({ ok: false, error: e instanceof GameError ? e.message : 'Error inesperado' });
        }
      });
    };

    socket.on('table:subscribe', async ({ code } = {}, ack = () => {}) => {
      const table = await getTable(code);
      if (!table) return ack({ ok: false, error: 'Mesa no encontrada' });
      if (!table.seats.some((s) => s.userId === uid) && table.dealerId !== uid) {
        return ack({ ok: false, error: 'not-seated' });
      }
      socket.join(roomOf(table.code));
      // refresca nombre/foto del asiento por si el usuario cambió su perfil
      const fresh = await User.findById(uid).catch(() => null);
      const seat = table.seats.find((s) => s.userId === uid);
      if (fresh && seat) {
        socket.data.user = fresh;
        Object.assign(seat, { displayName: fresh.displayName || fresh.username, avatarUrl: fresh.avatarUrl, avatarColor: fresh.avatarColor });
      }
      if (!socket.data.tables.has(table.code)) {
        socket.data.tables.add(table.code);
        markOnline(table.code, uid, 1);
      }
      ack({ ok: true });
      broadcast(table);
    });

    socket.on('table:unsubscribe', async ({ code } = {}) => {
      const table = await getTable(code);
      if (!table) return;
      socket.leave(roomOf(table.code));
      if (socket.data.tables.delete(table.code)) markOnline(table.code, uid, -1);
      broadcast(table);
    });

    socket.on('disconnect', async () => {
      for (const code of socket.data.tables) {
        markOnline(code, uid, -1);
        const t = await getTable(code);
        if (t) broadcast(t);
      }
    });

    // ---------- Jugador ----------
    handle('table:action', (t, { type, amount }) => engine.act(t, uid, type, amount));
    handle('table:cards', (t, { cards }) => engine.setHoleCards(t, uid, cards));

    handle('table:sitout', (t, { sitout }) => {
      const seat = t.seats.find((s) => s.userId === uid);
      if (!seat) throw new GameError('No estás sentado');
      seat.status = sitout ? 'sitout' : 'active';
      if (sitout) engine.foldOut(t, uid);
    });

    handle('table:leave', (t) => {
      if (t.dealerId === uid && t.seats.length > 1) throw new GameError('Pasa el rol de dealer a otro jugador antes de salir');
      engine.foldOut(t, uid);
      t.seats = t.seats.filter((s) => s.userId !== uid);
      if (t.hand) t.hand.players.forEach((p) => p.userId === uid && (p.folded = true));
      socket.leave(roomOf(t.code));
      if (socket.data.tables.delete(t.code)) markOnline(t.code, uid, -1);
      if (t.seats.length === 0) closeTable(t);
    });

    // ---------- Dealer ----------
    handle('dealer:start', (t) => engine.startHand(t), { dealerOnly: true });
    handle('dealer:board', (t, { cards }) => engine.setBoard(t, cards), { dealerOnly: true });
    handle('dealer:undoBoard', (t) => engine.undoBoard(t), { dealerOnly: true });
    handle('dealer:resolve', (t, { winners }) => engine.resolveShowdown(t, winners), { dealerOnly: true });
    handle('dealer:forceFold', (t, { userId }) => engine.forceFold(t, userId), { dealerOnly: true });
    handle('dealer:cancelHand', (t) => engine.cancelHand(t), { dealerOnly: true });

    handle('dealer:settings', (t, { settings, name }) => {
      if (engine.isHandLive(t)) throw new GameError('Cambia la configuración entre manos');
      t.settings = cleanSettings(settings, t.settings);
      if (name) t.name = String(name).trim().slice(0, 40) || t.name;
    }, { dealerOnly: true });

    handle('dealer:chips', (t, { userId, amount, mode }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      if (!seat) throw new GameError('Jugador no encontrado');
      const live = engine.isHandLive(t) && engine.getPlayer(t.hand, userId) && !engine.getPlayer(t.hand, userId).folded;
      if (live) throw new GameError('Espera a que termine la mano de este jugador');
      const n = Math.floor(Number(amount));
      if (!Number.isFinite(n) || n < 0) throw new GameError('Cantidad no válida');
      if (mode === 'set') seat.chips = n;
      else {
        if (n <= 0) throw new GameError('Cantidad no válida');
        seat.chips += n;
        seat.buyIn = (seat.buyIn || 0) + n;
      }
    }, { dealerOnly: true });

    handle('dealer:kick', (t, { userId }) => {
      if (userId === uid) throw new GameError('No puedes expulsarte a ti mismo');
      engine.foldOut(t, userId);
      t.seats = t.seats.filter((s) => s.userId !== userId);
      io.in(`user:${userId}`).emit('table:kicked', { code: t.code });
    }, { dealerOnly: true });

    handle('dealer:seat', (t, { userId, status }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      if (!seat) throw new GameError('Jugador no encontrado');
      seat.status = status === 'sitout' ? 'sitout' : 'active';
      if (seat.status === 'sitout') engine.foldOut(t, userId);
    }, { dealerOnly: true });

    // El dealer actual o el creador de la mesa asignan el rol de dealer
    handle('table:setDealer', (t, { userId }) => {
      if (t.dealerId !== uid && t.ownerId !== uid) throw new GameError('Solo el dealer o el creador pueden asignar el dealer');
      if (!t.seats.some((s) => s.userId === userId)) throw new GameError('Ese jugador no está en la mesa');
      t.dealerId = userId;
    });

    // Reordena asientos (solo entre manos)
    handle('dealer:reorder', (t, { order }) => {
      if (engine.isHandLive(t)) throw new GameError('Reordena entre manos');
      if (!Array.isArray(order) || order.length !== t.seats.length) throw new GameError('Orden no válido');
      const map = new Map(t.seats.map((s) => [s.userId, s]));
      const next = order.map((id) => map.get(id));
      if (next.some((s) => !s)) throw new GameError('Orden no válido');
      t.seats = next;
    }, { dealerOnly: true });

    handle('dealer:close', (t) => closeTable(t), { dealerOnly: true });

    async function closeTable(t) {
      if (engine.isHandLive(t)) engine.cancelHand(t);
      t.status = 'closed';
      t.closedAt = new Date();
      if (t.groupId) await Group.updateOne({ _id: t.groupId, activeTableCode: t.code }, { $set: { activeTableCode: null } });
    }

    socket.on('table:reseat', async ({ code } = {}, ack = () => {}) => {
      // re-sentarse tras haber salido (mismo flujo que /join)
      const t = await getTable(code);
      if (!t || t.status === 'closed') return ack({ ok: false, error: 'Mesa no disponible' });
      if (!t.seats.some((s) => s.userId === uid)) {
        t.seats.push(seatFor(socket.data.user, t.settings.startingChips));
        save(t);
        broadcast(t);
      }
      ack({ ok: true, state: viewFor(t, uid) });
    });
  });

  return io;
}
