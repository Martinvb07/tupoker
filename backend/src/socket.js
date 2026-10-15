import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { COOKIE, userFromToken } from './auth.js';
import { User } from './models.js';
import { getTable, markOnline, viewFor, canManage, GameError } from './game/manager.js';
import * as engine from './game/engine.js';
import { commit, schedule } from './game/autopilot.js';
import { setIO, broadcast, roomOf } from './hub.js';
import { cleanSettings, seatFor, closeTableNow } from './routes/tables.js';

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
    // manage: solo quien gestiona la mesa (dealer; en modo aleatorio, el anfitrión).
    const handle = (event, fn, { manage = false } = {}) => {
      socket.on(event, async (payload = {}, ack = () => {}) => {
        try {
          const table = await getTable(payload.code);
          if (!table) throw new GameError('Mesa no encontrada');
          if (table.status === 'closed') throw new GameError('La mesa está cerrada');
          if (manage && !canManage(table, uid)) {
            throw new GameError(engine.modeOf(table) === 'random' ? 'Solo el anfitrión puede hacer esto' : 'Solo el dealer puede hacer esto');
          }
          const result = await fn(table, payload);
          if (result !== false) commit(table);
          ack({ ok: true });
        } catch (e) {
          if (!(e instanceof GameError)) console.error(`[${event}]`, e);
          ack({ ok: false, error: e instanceof GameError ? e.message : 'Error inesperado' });
        }
      });
    };
    const mySeat = (t) => t.seats.find((s) => s.userId === uid);

    socket.on('table:subscribe', async ({ code } = {}, ack = () => {}) => {
      const table = await getTable(code);
      if (!table) return ack({ ok: false, error: 'Mesa no encontrada' });
      if (!table.seats.some((s) => s.userId === uid) && table.dealerId !== uid) {
        return ack({ ok: false, error: 'not-seated' });
      }
      socket.join(roomOf(table.code));
      // refresca nombre/foto del asiento por si el usuario cambió su perfil
      const fresh = await User.findById(uid).catch(() => null);
      const seat = mySeat(table);
      if (fresh && seat) {
        socket.data.user = fresh;
        Object.assign(seat, { displayName: fresh.displayName || fresh.username, avatarUrl: fresh.avatarUrl, avatarColor: fresh.avatarColor });
      }
      if (!socket.data.tables.has(table.code)) {
        socket.data.tables.add(table.code);
        markOnline(table.code, uid, 1);
      }
      ack({ ok: true });
      if (table.status !== 'closed') schedule(table);
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
    handle('table:action', (t, { type, amount }) => {
      engine.act(t, uid, type, amount);
      const seat = mySeat(t);
      if (seat) seat.timeouts = 0;
    });
    handle('table:cards', (t, { cards }) => engine.setHoleCards(t, uid, cards));

    handle('table:sitout', (t, { sitout }) => {
      const seat = mySeat(t);
      if (!seat) throw new GameError('No estás sentado');
      seat.status = sitout ? 'sitout' : 'active';
      seat.timeouts = 0;
      if (sitout) engine.foldOut(t, uid);
    });

    handle('table:leave', async (t) => {
      const others = t.seats.filter((s) => s.userId !== uid);
      if (t.dealerId === uid && others.length) {
        // en aleatorio no hay dealer real: el rol pasa solo al siguiente; en vivo hay que cederlo
        if (engine.modeOf(t) !== 'random') throw new GameError('Pasa el rol de dealer a otro jugador antes de salir');
        t.dealerId = others[0].userId;
      }
      if (t.ownerId === uid && others.length && engine.modeOf(t) === 'random') t.ownerId = others[0].userId;
      engine.foldOut(t, uid);
      t.seats = others;
      if (t.hand) t.hand.players.forEach((p) => p.userId === uid && (p.folded = true));
      socket.leave(roomOf(t.code));
      if (socket.data.tables.delete(t.code)) markOnline(t.code, uid, -1);
      if (t.seats.length === 0) await closeTableNow(t);
    });

    // Modo sin dinero: cualquiera puede retirarse en cualquier momento
    handle('table:fold', (t) => {
      if (engine.modeOf(t) !== 'offline') throw new GameError('Usa el botón de retirarse cuando sea tu turno');
      if (!engine.getPlayer(t.hand, uid)) throw new GameError('No estás en esta mano');
      engine.foldOut(t, uid);
    });

    // Recompra: en aleatorio es inmediata; en vivo la aprueba el dealer
    handle('table:rebuy', (t) => {
      const seat = engine.checkRebuy(t, uid);
      if (engine.modeOf(t) === 'random' || canManage(t, uid)) engine.applyRebuy(t, uid);
      else {
        if (seat.rebuyRequest) throw new GameError('Ya pediste una recompra, espera al dealer');
        seat.rebuyRequest = { amount: t.settings.startingChips, at: Date.now() };
      }
    });
    handle('table:cancelRebuy', (t) => {
      const seat = mySeat(t);
      if (seat) delete seat.rebuyRequest;
    });

    // ---------- Gestión (dealer / anfitrión) ----------
    // En aleatorio cualquier jugador sentado puede repartir la primera mano
    handle('dealer:start', (t) => {
      if (!canManage(t, uid) && !(engine.modeOf(t) === 'random' && mySeat(t))) throw new GameError('Solo el dealer puede repartir');
      engine.startHand(t);
    });
    handle('dealer:board', (t, { cards }) => engine.setBoard(t, cards), { manage: true });
    handle('dealer:undoBoard', (t) => engine.undoBoard(t), { manage: true });
    handle('dealer:resolve', (t, { winners }) => engine.resolveShowdown(t, winners), { manage: true });
    handle('dealer:forceFold', (t, { userId }) => engine.forceFold(t, userId), { manage: true });
    handle('dealer:cancelHand', (t) => engine.cancelHand(t), { manage: true });
    handle('dealer:resetChips', (t) => engine.resetChips(t), { manage: true });

    handle('dealer:rebuy', (t, { userId, approve }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      if (!seat?.rebuyRequest) throw new GameError('No hay recompra pendiente');
      if (approve) engine.applyRebuy(t, userId, seat.rebuyRequest.amount);
      else delete seat.rebuyRequest;
    }, { manage: true });

    handle('dealer:settings', (t, { settings, name }) => {
      if (engine.isHandLive(t)) throw new GameError('Cambia la configuración entre manos');
      t.settings = cleanSettings(settings, t.settings);
      if (name) t.name = String(name).trim().slice(0, 40) || t.name;
    }, { manage: true });

    handle('dealer:chips', (t, { userId, amount, mode }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      if (!seat) throw new GameError('Jugador no encontrado');
      const p = engine.isHandLive(t) ? engine.getPlayer(t.hand, userId) : null;
      if (p && !p.folded) throw new GameError('Espera a que termine la mano de este jugador');
      const n = Math.floor(Number(amount));
      if (!Number.isFinite(n) || n < 0) throw new GameError('Cantidad no válida');
      if (mode === 'set') seat.chips = n;
      else {
        if (n <= 0) throw new GameError('Cantidad no válida');
        engine.applyRebuy(t, userId, n);
      }
    }, { manage: true });

    handle('dealer:kick', (t, { userId }) => {
      if (userId === uid) throw new GameError('No puedes expulsarte a ti mismo');
      engine.foldOut(t, userId);
      t.seats = t.seats.filter((s) => s.userId !== userId);
      io.in(`user:${userId}`).emit('table:kicked', { code: t.code });
    }, { manage: true });

    handle('dealer:seat', (t, { userId, status }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      if (!seat) throw new GameError('Jugador no encontrado');
      seat.status = status === 'sitout' ? 'sitout' : 'active';
      seat.timeouts = 0;
      if (seat.status === 'sitout') engine.foldOut(t, userId);
    }, { manage: true });

    // El dealer actual o el creador de la mesa asignan el rol de dealer
    handle('table:setDealer', (t, { userId }) => {
      if (t.dealerId !== uid && t.ownerId !== uid) throw new GameError('Solo el dealer o el creador pueden asignar el dealer');
      if (!t.seats.some((s) => s.userId === userId)) throw new GameError('Ese jugador no está en la mesa');
      t.dealerId = userId;
    });

    handle('dealer:close', (t) => closeTableNow(t), { manage: true });

    socket.on('table:reseat', async ({ code } = {}, ack = () => {}) => {
      // re-sentarse tras haber salido (mismo flujo que /join)
      const t = await getTable(code);
      if (!t || t.status === 'closed') return ack({ ok: false, error: 'Mesa no disponible' });
      if (!t.seats.some((s) => s.userId === uid)) {
        t.seats.push(seatFor(socket.data.user, t.settings.startingChips));
        commit(t);
      }
      ack({ ok: true, state: viewFor(t, uid) });
    });
  });

  return io;
}
