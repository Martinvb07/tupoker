// Piloto automático del modo aleatorio (no hay dealer):
//  - cada turno tiene un tiempo límite; si se agota se pasa o se retira solo
//  - al terminar una mano, la siguiente se reparte sola tras unos segundos
// Todo cambio de estado pasa por commit(): programa timers, guarda y emite.
import * as engine from './engine.js';
import { save, isOnline } from './manager.js';
import { broadcast } from '../hub.js';

export const TURN_MS = Number(process.env.TURN_MS) || 40_000;
export const NEXT_HAND_MS = Number(process.env.NEXT_HAND_MS) || 10_000;
// la viuda: tiempo para ver tus cartas (o llevarte las del centro) antes de que se destapen solas
export const VIUDA_SEE_MS = Number(process.env.VIUDA_SEE_MS) || 30_000;
// blackjack: tiempo para apostar antes de que se repartan las cartas
export const BJ_BET_MS = Number(process.env.BJ_BET_MS) || 20_000;
// blackjack: el móvil destapa las cartas de la banca una a una; se suma ese tiempo antes de la siguiente ronda
const BJ_DEALER_CARD_MS = 900;
const AUTO = engine.AUTO_MODES; // modos sin dealer: turnos con tiempo y manos que salen solas
// en vivo el dealer pide la siguiente mano y sale tras esta cuenta atrás (le da tiempo a pagar el bote)
export const LIVE_START_MS = 5_000;
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
    clearTimeout(t.see);
    clearTimeout(t.bets);
    timers.delete(table.code);
    return;
  }
  const hand = table.hand;
  const live = engine.isHandLive(table);

  // ---- tiempo de turno
  if (live && AUTO.includes(hand.mode) && hand.toAct && !hand.awaiting) {
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

  // ---- la viuda: tiempo para ver las cartas; al acabarse se destapan solas y empiezan los cambios
  if (live && hand.mode === 'viuda' && hand.stage === 'viuda') {
    const key = `${hand.no}:ver`;
    if (t.seeKey !== key) {
      clearTimeout(t.see);
      t.seeKey = key;
      hand.seeDeadline = Date.now() + VIUDA_SEE_MS;
      t.see = setTimeout(() => {
        if (table.hand?.no !== hand.no) return;
        engine.viudaRevealAll(table);
        commit(table);
      }, VIUDA_SEE_MS);
    }
  } else {
    clearTimeout(t.see);
    t.seeKey = null;
    if (hand) hand.seeDeadline = null;
  }

  // ---- blackjack: tiempo para apostar; al acabarse se reparte a quien haya apostado
  if (live && hand.mode === 'blackjack' && hand.stage === 'bets') {
    const key = `${hand.no}:apuestas`;
    if (t.betKey !== key) {
      clearTimeout(t.bets);
      t.betKey = key;
      hand.betDeadline = Date.now() + BJ_BET_MS;
      t.bets = setTimeout(() => {
        if (table.hand?.no !== hand.no) return;
        // quien no apuesta dos rondas seguidas se queda fuera de la mesa
        for (const id of engine.bjCloseBets(table)) {
          const seat = table.seats.find((s) => s.userId === id);
          if (!seat) continue;
          seat.timeouts = (seat.timeouts || 0) + 1;
          if (seat.timeouts >= MAX_TIMEOUTS) seat.status = 'sitout';
        }
        commit(table);
      }, BJ_BET_MS);
    }
  } else {
    clearTimeout(t.bets);
    t.betKey = null;
    if (hand) hand.betDeadline = null;
  }

  // ---- siguiente mano automática (solo después de la primera)
  if (live) {
    clearTimeout(t.next);
    t.next = null;
    table.nextHandAt = null;
    table.startAt = null;
  } else if (engine.modeOf(table) === 'live') {
    // cuenta atrás que pide el dealer; sin ella (o cancelada) no se reparte
    if (!table.startAt) {
      clearTimeout(t.next);
      t.next = null;
      table.nextHandAt = null;
    } else if (!t.next) {
      table.nextHandAt = table.startAt;
      t.next = setTimeout(() => {
        t.next = null;
        table.nextHandAt = null;
        table.startAt = null;
        try {
          if (!engine.isHandLive(table) && table.status !== 'closed' && !engine.pausedBy(table)) engine.startHand(table);
        } catch {
          /* ya no hay jugadores suficientes: el dealer vuelve a pedirla */
        }
        commit(table);
      }, Math.max(0, table.startAt - Date.now()));
    }
  } else if (AUTO.includes(engine.modeOf(table)) && table.hand && !t.next) {
    const ready = engine.eligibleSeats(table).filter((s) => isOnline(table.code, s.userId));
    // al blackjack se juega también solo, contra la banca
    if (ready.length >= (engine.modeOf(table) === 'blackjack' ? 1 : 2)) {
      // si la mano acabó en all-in, se suma el tiempo que tarda en destaparse el board
      const runout = table.hand.result?.how === 'showdown' && table.hand.players.some((p) => p.allIn);
      // en el blackjack, lo que tardan en destaparse las cartas de la banca
      const dealerCards = table.hand.mode === 'blackjack' && table.hand.dealerOpen ? table.hand.dealer.length - 1 : 0;
      const delay = NEXT_HAND_MS + (runout ? RUNOUT_EXTRA_MS : 0) + dealerCards * BJ_DEALER_CARD_MS;
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
