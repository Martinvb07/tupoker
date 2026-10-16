// Piloto automático del modo aleatorio (no hay dealer):
//  - cada turno tiene un tiempo límite; si se agota se pasa o se retira solo
//  - al terminar una mano, la siguiente se reparte sola tras unos segundos
// Todo cambio de estado pasa por commit(): programa timers, guarda y emite.
import * as engine from './engine.js';
import { save, isOnline } from './manager.js';
import { broadcast } from '../hub.js';

export const TURN_MS = Number(process.env.TURN_MS) || 40_000;
export const NEXT_HAND_MS = Number(process.env.NEXT_HAND_MS) || 10_000;
// tras un all-in el móvil destapa el board calle a calle (~6 s): se suma para que dé tiempo a verlo
const RUNOUT_EXTRA_MS = 6_000;
const MAX_TIMEOUTS = 2; // turnos agotados seguidos antes de sentarle fuera

const timers = new Map(); // code -> { turnKey, turn, next }
const slot = (code) => {
  if (!timers.has(code)) timers.set(code, {});
  return timers.get(code);
};

export function commit(table) {
  if (table.status !== 'closed') engine.settleRebuyVotes(table);
  schedule(table);
  save(table);
  broadcast(table);
}

export function schedule(table) {
  const t = slot(table.code);
  if (table.status === 'closed') {
    clearTimeout(t.turn);
    clearTimeout(t.next);
    timers.delete(table.code);
    return;
  }
  const hand = table.hand;
  const live = engine.isHandLive(table);

  // ---- tiempo de turno
  if (live && hand.mode === 'random' && hand.toAct && !hand.awaiting) {
    const key = `${hand.no}:${hand.toAct}:${hand.log.length}`;
    if (t.turnKey !== key) {
      clearTimeout(t.turn);
      t.turnKey = key;
      hand.turnDeadline = Date.now() + TURN_MS;
      t.turn = setTimeout(() => onTimeout(table, key), TURN_MS);
    }
  } else {
    clearTimeout(t.turn);
    t.turnKey = null;
    if (hand) hand.turnDeadline = null;
  }

  // ---- siguiente mano automática (solo después de la primera)
  if (live) {
    clearTimeout(t.next);
    t.next = null;
    table.nextHandAt = null;
  } else if (engine.modeOf(table) === 'random' && table.hand && !t.next) {
    const ready = engine.eligibleSeats(table).filter((s) => isOnline(table.code, s.userId));
    if (ready.length >= 2) {
      // si la mano acabó en all-in, se suma el tiempo que tarda en destaparse el board
      const runout = table.hand.result?.how === 'showdown' && table.hand.players.some((p) => p.allIn);
      const delay = NEXT_HAND_MS + (runout ? RUNOUT_EXTRA_MS : 0);
      table.nextHandAt = Date.now() + delay;
      t.next = setTimeout(() => {
        t.next = null;
        table.nextHandAt = null;
        try {
          if (!engine.isHandLive(table) && table.status !== 'closed') engine.startHand(table);
        } catch {
          /* no hay jugadores suficientes: se queda esperando */
        }
        commit(table);
      }, delay);
    } else table.nextHandAt = null;
  }
}

function onTimeout(table, key) {
  const t = slot(table.code);
  const hand = table.hand;
  if (t.turnKey !== key || !hand || hand.toAct == null) return;
  const uid = hand.toAct;
  const seat = table.seats.find((s) => s.userId === uid);
  try {
    engine.forceFold(table, uid);
  } catch {
    return;
  }
  if (seat) {
    seat.timeouts = (seat.timeouts || 0) + 1;
    if (seat.timeouts >= MAX_TIMEOUTS) seat.status = 'sitout';
  }
  t.turnKey = null;
  commit(table);
}
