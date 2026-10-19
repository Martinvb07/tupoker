import { Server } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { COOKIE, userFromToken } from './auth.js';
import { User } from './models.js';
import { getTable, markOnline, viewFor, canManage, GameError } from './game/manager.js';
import * as engine from './game/engine.js';
import { commit, schedule, LIVE_START_MS } from './game/autopilot.js';
import * as chat from './game/chat.js';
import { setIO, broadcast, roomOf, notifyUser, markUserOnline } from './hub.js';
import { cleanSettings, seatFor, closeTableNow } from './routes/tables.js';

// emojis permitidos como reacción en la mesa (los mismos que ofrece el selector del cliente)
export const REACTIONS = new Set(['😂', '🔥', '😎', '😭', '😡', '👏', '🤑', '🙈', '💀', '🤡', '🥶', '🫡', '😱', '🙏', '🍀', '👀']);

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
    markUserOnline(uid, 1);

    // Ejecuta una operación sobre la mesa, guarda y emite el nuevo estado.
    // manage: solo quien gestiona la mesa (dealer; en modo aleatorio, el anfitrión).
    // acciones de juego bloqueadas mientras una recompra en vivo tiene la partida en pausa
    const PAUSABLE = new Set(['table:action', 'dealer:start', 'dealer:startIn', 'dealer:board', 'dealer:resolve', 'dealer:forceFold']);
    const handle = (event, fn, { manage = false } = {}) => {
      socket.on(event, async (payload = {}, ack = () => {}) => {
        try {
          const table = await getTable(payload.code);
          if (!table) throw new GameError('Mesa no encontrada');
          if (table.status === 'closed') throw new GameError('La mesa está cerrada');
          const paused = PAUSABLE.has(event) && engine.pausedBy(table);
          if (paused) throw new GameError(`Partida en pausa: recompra de ${paused.displayName} pendiente`);
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

    // Reacciones con emoji: no se guardan, solo se reenvían a la mesa (con límite anti-spam)
    let lastReaction = 0;
    socket.on('table:react', async ({ code, emoji } = {}) => {
      if (!REACTIONS.has(emoji)) return;
      const now = Date.now();
      if (now - lastReaction < 1200) return;
      lastReaction = now;
      const t = await getTable(code);
      if (!t || t.status === 'closed' || !t.seats.some((s) => s.userId === uid)) return;
      io.to(roomOf(t.code)).emit('table:reaction', { code: t.code, userId: uid, emoji, id: `${uid}-${now}` });
    });

    // ---------- chat de la mesa ----------
    const seatIn = async (code) => {
      const t = await getTable(code);
      if (!t || t.status === 'closed') return null;
      const seat = t.seats.find((s) => s.userId === uid);
      return seat ? { t, seat } : null;
    };
    socket.on('chat:history', async ({ code } = {}, ack = () => {}) => {
      const ctx = await seatIn(code);
      if (!ctx) return ack({ ok: false, error: 'No estás en esta mesa' });
      ack({ ok: true, messages: chat.history(ctx.t.code), cooldown: chat.CHAT_COOLDOWN_MS, reactions: chat.CHAT_REACTIONS });
    });
    socket.on('chat:send', async ({ code, text, replyTo } = {}, ack = () => {}) => {
      const ctx = await seatIn(code);
      if (!ctx) return ack({ ok: false, error: 'No estás en esta mesa' });
      try {
        const message = chat.addMessage(ctx.t.code, ctx.seat, text, replyTo);
        io.to(roomOf(ctx.t.code)).emit('chat:message', { code: ctx.t.code, message });
        ack({ ok: true });
      } catch (e) {
        ack({ ok: false, error: e.message, wait: e.wait || 0 });
      }
    });
    socket.on('chat:react', async ({ code, id, emoji } = {}, ack = () => {}) => {
      const ctx = await seatIn(code);
      if (!ctx) return ack({ ok: false });
      const msg = chat.toggleReaction(ctx.t.code, id, emoji, uid);
      if (msg) io.to(roomOf(ctx.t.code)).emit('chat:update', { code: ctx.t.code, id: msg.id, reactions: msg.reactions });
      ack({ ok: !!msg });
    });

    socket.on('table:unsubscribe', async ({ code } = {}) => {
      const table = await getTable(code);
      if (!table) return;
      socket.leave(roomOf(table.code));
      if (socket.data.tables.delete(table.code)) markOnline(table.code, uid, -1);
      broadcast(table);
    });

    socket.on('disconnect', async () => {
      markUserOnline(uid, -1);
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
    handle('table:cards', (t, { cards }) => engine.setHoleCards(t, uid, cards, { free: canManage(t, uid) }));
    // En vivo: quien se equivocó al registrar sus cartas pide al dealer permiso para cambiarlas
    handle('table:cardsChange', (t) => {
      const p = engine.isHandLive(t) ? engine.getPlayer(t.hand, uid) : null;
      if (!p || p.folded) throw new GameError('No estás en esta mano');
      if (p.cards.length !== 2) throw new GameError('Aún no has registrado tus cartas');
      if (p.changeReq || p.cardsUnlock) return false;
      p.changeReq = true;
      notifyUser(t.dealerId, 'table:notice', { message: `${mySeat(t)?.displayName || 'Un jugador'} pide cambiar sus cartas` });
    });
    handle('dealer:cardsChange', (t, { userId, approve }) => {
      const p = engine.isHandLive(t) ? engine.getPlayer(t.hand, userId) : null;
      if (!p?.changeReq) throw new GameError('Esa petición ya no está pendiente');
      delete p.changeReq;
      if (approve) p.cardsUnlock = true;
      notifyUser(userId, 'table:notice', approve
        ? { message: 'El dealer te deja cambiar tus cartas', type: 'success' }
        : { message: 'El dealer no aceptó el cambio de cartas', type: 'error' });
    }, { manage: true });
    handle('table:show', (t) => engine.showCards(t, uid));

    handle('table:sitout', (t, { sitout }) => {
      const seat = mySeat(t);
      if (!seat) throw new GameError('No estás sentado');
      if (!sitout && engine.modeOf(t) === 'live' && t.dealerId === uid) throw new GameError('En vivo el dealer no juega, solo reparte');
      seat.status = sitout ? 'sitout' : 'active';
      seat.timeouts = 0;
      if (sitout) engine.foldOut(t, uid);
    });

    handle('table:leave', async (t) => {
      const others = t.seats.filter((s) => s.userId !== uid);
      // quien se va nunca se queda atrapado: el rol de dealer / anfitrión pasa al siguiente
      const heir = others.find((s) => s.status === 'active') || others[0];
      if (heir && t.dealerId === uid) {
        t.dealerId = heir.userId;
        if (engine.modeOf(t) !== 'random') notifyUser(heir.userId, 'table:notice', { message: `Ahora eres el dealer de ${t.name}` });
      }
      if (heir && t.ownerId === uid) t.ownerId = heir.userId;
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

    // Recompra. Se juega con dinero real, así que nadie se pone fichas solo:
    //  - aleatorio: la tienen que aceptar todos los demás jugadores de la mesa
    //  - en vivo: la aprueba el dealer
    handle('table:rebuy', (t, { amount }) => {
      if (engine.modeOf(t) === 'live' && t.dealerId === uid) throw new GameError('En vivo el dealer no juega, solo reparte');
      const seat = engine.checkRebuy(t, uid);
      if (seat.rebuyRequest) throw new GameError('Ya tienes una recompra pendiente');
      const amt = Math.floor(Number(amount) || t.settings.startingChips);
      if (!(amt >= t.settings.minBet) || amt > t.settings.startingChips * 10) throw new GameError('Cantidad de recompra no válida');
      const others = t.seats.filter((s) => s.userId !== uid).map((s) => s.userId);
      if (engine.modeOf(t) === 'random') {
        seat.rebuyRequest = { amount: amt, at: Date.now(), needed: others, approvals: [] };
        for (const id of others) notifyUser(id, 'table:notice', { message: `${seat.displayName} pide recomprar ${amt}. Acepta o rechaza en la mesa.` });
      } else if (!others.length) engine.applyRebuy(t, uid, amt);
      else {
        // en vivo: se pausa la partida, votan todos los demás jugadores (menos el dealer)
        // y al final el dealer asigna las fichas
        const voters = others.filter((id) => id !== t.dealerId);
        seat.rebuyRequest = { amount: amt, at: Date.now(), needed: voters, approvals: [], dealerAssign: true };
        for (const id of others) {
          notifyUser(id, 'table:notice', {
            message: id === t.dealerId ? `${seat.displayName} pide recomprar ${amt}: la partida queda en pausa` : `${seat.displayName} pide recomprar ${amt}. Acepta o rechaza en la mesa.`,
          });
        }
      }
    });
    handle('table:cancelRebuy', (t) => {
      const seat = mySeat(t);
      if (seat) delete seat.rebuyRequest;
    });
    // Voto de los demás jugadores (modo aleatorio). Un "no" cancela la petición.
    handle('table:rebuyVote', (t, { userId, approve }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      const req = seat?.rebuyRequest;
      if (!req?.needed) throw new GameError('Esa recompra ya no está pendiente');
      if (!req.needed.includes(uid)) throw new GameError('No te toca votar esta recompra');
      if (!approve) {
        delete seat.rebuyRequest;
        const me = mySeat(t);
        notifyUser(userId, 'table:notice', { message: `${me?.displayName || 'Un jugador'} rechazó tu recompra`, type: 'error' });
        return;
      }
      if (!req.approvals.includes(uid)) req.approvals.push(uid);
    });

    // ---------- Gestión (dealer / anfitrión) ----------
    // En aleatorio cualquier jugador sentado puede repartir la primera mano
    handle('dealer:start', (t) => {
      if (!canManage(t, uid) && !(engine.modeOf(t) === 'random' && mySeat(t))) throw new GameError('Solo el dealer puede repartir');
      engine.startHand(t);
    });
    // En vivo: la siguiente mano sale tras una cuenta atrás, para que el dealer pague antes el bote
    handle('dealer:startIn', (t) => {
      if (engine.modeOf(t) !== 'live') throw new GameError('Solo en el modo en vivo');
      if (engine.isHandLive(t)) throw new GameError('Ya hay una mano en curso');
      if (engine.eligibleSeats(t).length < 2) throw new GameError('Se necesitan al menos 2 jugadores con fichas');
      if (!t.startAt) t.startAt = Date.now() + LIVE_START_MS;
    }, { manage: true });
    handle('dealer:cancelStart', (t) => {
      t.startAt = null;
    }, { manage: true });
    handle('dealer:board', (t, { cards }) => engine.setBoard(t, cards), { manage: true });
    handle('dealer:undoBoard', (t) => engine.undoBoard(t), { manage: true });
    handle('dealer:resolve', (t, { winners }) => engine.resolveShowdown(t, winners), { manage: true });
    handle('dealer:forceFold', (t, { userId }) => engine.forceFold(t, userId), { manage: true });
    handle('dealer:cancelHand', (t) => engine.cancelHand(t), { manage: true });
    handle('dealer:resetChips', (t) => engine.resetChips(t), { manage: true });

    // El dealer asigna (o rechaza) la recompra. En vivo, solo cuando todos han aceptado.
    handle('dealer:rebuy', (t, { userId, approve, amount }) => {
      const seat = t.seats.find((s) => s.userId === userId);
      const req = seat?.rebuyRequest;
      if (!req) throw new GameError('No hay recompra pendiente');
      if (req.needed && !req.dealerAssign) throw new GameError('Esta recompra la votan todos los jugadores');
      if (!approve) {
        delete seat.rebuyRequest;
        notifyUser(userId, 'table:notice', { message: 'El dealer rechazó tu recompra', type: 'error' });
        return;
      }
      if (req.needed && req.approvals.length < req.needed.length) throw new GameError('Aún faltan jugadores por aceptar');
      const n = Math.floor(Number(amount) || req.amount);
      if (!(n >= 1)) throw new GameError('Cantidad no válida');
      engine.applyRebuy(t, userId, n);
      notifyUser(userId, 'table:notice', { message: `El dealer te asignó ${n} fichas`, type: 'success' });
    }, { manage: true });

    handle('dealer:settings', (t, { settings, name }) => {
      if (engine.isHandLive(t)) throw new GameError('Cambia la configuración entre manos');
      t.settings = cleanSettings(settings, t.settings);
      // al pasar a en vivo, el dealer vuelve a ser el creador de la mesa
      if (engine.modeOf(t) === 'live' && t.seats.some((s) => s.userId === t.ownerId)) t.dealerId = t.ownerId;
      if (name) t.name = String(name).trim().slice(0, 40) || t.name;
    }, { manage: true });

    handle('dealer:chips', (t, { userId, amount, mode }) => {
      if (engine.modeOf(t) === 'random') throw new GameError('En modo aleatorio las recompras se aprueban entre todos');
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

    // El dealer actual o el creador de la mesa asignan el rol de dealer (en vivo no: siempre es el creador)
    handle('table:setDealer', (t, { userId }) => {
      if (engine.modeOf(t) === 'live') throw new GameError('En vivo el dealer es siempre quien creó la mesa');
      if (t.dealerId !== uid && t.ownerId !== uid) throw new GameError('Solo el dealer o el creador pueden asignar el dealer');
      if (!t.seats.some((s) => s.userId === userId)) throw new GameError('Ese jugador no está en la mesa');
      t.dealerId = userId;
    });

    // cerrar la mesa: el dealer / anfitrión o quien la creó
    handle('dealer:close', (t) => {
      if (!canManage(t, uid) && t.ownerId !== uid) throw new GameError('Solo el creador o el dealer pueden cerrar la mesa');
      return closeTableNow(t);
    });

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
