// Lógica pura de una mano de Texas Hold'em. Tres modos:
//  - live:    cartas físicas; el dealer introduce el board, los jugadores sus cartas, con fichas.
//  - random:  la app baraja y reparte cartas y board, con fichas.
//  - offline: cartas físicas sin dinero; solo board, jugadas, probabilidades y ganador.
import { randomInt } from 'node:crypto';
import { evaluate, isValidCard, FULL_DECK } from '../../shared/poker.js';

export class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

const STAGES = ['preflop', 'flop', 'turn', 'river'];
const BOARD_SIZE = { flop: 3, turn: 4, river: 5 };
export const MODES = ['live', 'random', 'offline'];

export function blinds(settings) {
  const bb = Math.max(1, Math.floor(settings.minBet));
  return { sb: Math.max(1, Math.floor(bb / 2)), bb };
}

export const modeOf = (table) => (MODES.includes(table.settings?.mode) ? table.settings.mode : 'live');
const handMode = (hand) => hand.mode || 'live';

function shuffledDeck() {
  const d = [...FULL_DECK];
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const playable = (seat) => seat.status === 'active' && seat.chips > 0;
const playableIn = (mode) => (mode === 'offline' ? (seat) => seat.status === 'active' : playable);
// en vivo el dealer solo reparte: nunca entra en las manos
const playableAt = (table) => {
  const ok = playableIn(modeOf(table));
  return modeOf(table) === 'live' ? (seat) => ok(seat) && seat.userId !== table.dealerId : ok;
};

/** Jugadores que pueden entrar en la siguiente mano. */
export function eligibleSeats(table) {
  return table.seats.filter(playableAt(table));
}

function nextIn(list, fromId, pred = () => true) {
  const n = list.length;
  const start = list.findIndex((x) => x.userId === fromId);
  for (let i = 1; i <= n; i++) {
    const item = list[(start + i + n) % n];
    if (pred(item)) return item;
  }
  return null;
}

export function getPlayer(hand, userId) {
  return hand?.players.find((p) => p.userId === userId) || null;
}

const inHand = (p) => !p.folded;
const canAct = (p) => !p.folded && !p.allIn;

function log(hand, entry) {
  hand.log.push({ ...entry, stage: hand.stage, t: Date.now() });
  if (hand.log.length > 200) hand.log.shift();
}

function put(hand, p, amount) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.total += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

export function isHandLive(table) {
  return !!table.hand && !['done'].includes(table.hand.stage);
}

// ---------------- Inicio de mano ----------------

export function startHand(table) {
  if (table.status === 'closed') fail('La mesa está cerrada');
  if (isHandLive(table)) fail('Ya hay una mano en curso');
  const mode = modeOf(table);
  const ok = playableAt(table);
  const seats = table.seats.filter(ok);
  if (seats.length < 2) fail(mode === 'offline' ? 'Se necesitan al menos 2 jugadores activos' : 'Se necesitan al menos 2 jugadores con fichas');

  const { sb, bb } = blinds(table.settings);
  const prevBtn = table.buttonUserId;
  let button;
  if (prevBtn && table.seats.some((s) => s.userId === prevBtn)) button = nextIn(table.seats, prevBtn, ok);
  else button = seats[0];

  const players = seats.map((s) => ({
    userId: s.userId,
    stack: s.chips,
    startStack: s.chips,
    bet: 0,
    total: 0,
    folded: false,
    allIn: false,
    acted: false,
    cards: [],
    last: null,
  }));

  const hand = {
    no: (table.handNo || 0) + 1,
    mode,
    stage: 'preflop',
    awaiting: null,
    board: [],
    players,
    buttonId: button.userId,
    sbId: null,
    bbId: null,
    currentBet: 0,
    minRaise: bb,
    toAct: null,
    pots: null,
    result: null,
    log: [],
    startedAt: Date.now(),
  };

  table.buttonUserId = button.userId;
  table.handNo = hand.no;
  table.status = 'playing';
  table.hand = hand;

  if (mode === 'offline') {
    // sin apuestas: el dealer pone el flop cuando quiera
    hand.awaiting = 'flop';
    return hand;
  }
  if (mode === 'random') {
    hand.deck = shuffledDeck();
    for (const p of players) p.cards = hand.deck.splice(0, 2);
  }

  let sbP, bbP;
  if (players.length === 2) {
    sbP = getPlayer(hand, button.userId);
    bbP = nextIn(players, sbP.userId);
  } else {
    sbP = nextIn(players, button.userId);
    bbP = nextIn(players, sbP.userId);
  }
  hand.sbId = sbP.userId;
  hand.bbId = bbP.userId;
  const sbPaid = put(hand, sbP, sb);
  const bbPaid = put(hand, bbP, bb);
  sbP.last = { type: 'sb', amount: sbPaid };
  bbP.last = { type: 'bb', amount: bbPaid };
  log(hand, { userId: sbP.userId, type: 'sb', amount: sbPaid });
  log(hand, { userId: bbP.userId, type: 'bb', amount: bbPaid });
  hand.currentBet = Math.max(bb, sbPaid, bbPaid);

  const first = nextIn(players, bbP.userId, canAct);
  hand.toAct = first ? first.userId : null;
  if (roundComplete(hand)) endRound(table);
  return hand;
}

// ---------------- Acciones de apuesta ----------------

function roundComplete(hand) {
  const live = hand.players.filter(inHand);
  if (live.length <= 1) return true;
  const actors = hand.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1 && actors[0].bet >= hand.currentBet) {
    // el único que puede actuar ya iguala a todos: no hay nadie contra quien apostar
    const others = live.filter((p) => p !== actors[0]);
    if (others.every((p) => p.allIn)) return true;
  }
  return actors.every((p) => p.acted && p.bet === hand.currentBet);
}

/** Datos para la interfaz: qué puede hacer el jugador al que le toca. */
export function legalActions(table, userId) {
  const hand = table.hand;
  if (!hand || hand.toAct !== userId || hand.awaiting || hand.stage === 'showdown' || hand.stage === 'done') return null;
  const p = getPlayer(hand, userId);
  const toCall = Math.max(0, hand.currentBet - p.bet);
  const maxInc = table.settings.maxBet > 0 ? table.settings.maxBet : Infinity;
  const allInTo = p.bet + p.stack;
  const minTo = hand.currentBet + hand.minRaise;
  const maxTo = Math.min(allInTo, hand.currentBet + maxInc);
  const canRaise = !p.acted && p.stack > toCall && maxTo > hand.currentBet;
  return {
    toCall: Math.min(toCall, p.stack),
    canCheck: toCall === 0,
    canRaise,
    isBet: hand.currentBet === 0,
    minTo: Math.min(minTo, allInTo, maxTo),
    maxTo,
    allInTo,
    currentBet: hand.currentBet,
    myBet: p.bet,
    stack: p.stack,
  };
}

export function act(table, userId, type, amountTo) {
  const hand = table.hand;
  if (!hand || hand.stage === 'done' || hand.stage === 'showdown') fail('No hay ninguna ronda de apuestas activa');
  if (handMode(hand) === 'offline') fail('En el modo sin dinero no hay apuestas');
  if (hand.awaiting) fail('Esperando a que el dealer ponga las cartas');
  if (hand.toAct !== userId) fail('No es tu turno');
  const p = getPlayer(hand, userId);
  const legal = legalActions(table, userId);

  switch (type) {
    case 'fold':
      p.folded = true;
      p.last = { type: 'fold' };
      break;
    case 'check':
      if (!legal.canCheck) fail('No puedes pasar: hay una apuesta que igualar');
      p.last = { type: 'check' };
      break;
    case 'call': {
      if (legal.toCall === 0) fail('No hay nada que igualar');
      const paid = put(hand, p, legal.toCall);
      p.last = { type: p.allIn ? 'allin' : 'call', amount: paid };
      break;
    }
    case 'allin':
    case 'raise': {
      let to = type === 'allin' ? legal.allInTo : Math.floor(Number(amountTo));
      if (!Number.isFinite(to)) fail('Cantidad no válida');
      if (type === 'allin' && to <= hand.currentBet) {
        // all-in que no llega a la apuesta actual = call por todo
        const paid = put(hand, p, p.stack);
        p.last = { type: 'allin', amount: paid };
        break;
      }
      if (!legal.canRaise) fail('No puedes subir en este momento');
      if (to > legal.allInTo) fail('No tienes tantas fichas');
      if (to > legal.maxTo) fail(`La apuesta máxima es ${legal.maxTo - hand.currentBet} por encima de la actual`);
      const isAllIn = to === legal.allInTo;
      const inc = to - hand.currentBet;
      if (inc <= 0) fail('La subida debe superar la apuesta actual');
      if (inc < hand.minRaise && !isAllIn) fail(`La subida mínima es hasta ${legal.minTo}`);
      const paid = put(hand, p, to - p.bet);
      const wasBet = hand.currentBet === 0;
      hand.currentBet = to;
      if (inc >= hand.minRaise) {
        hand.minRaise = inc;
        for (const o of hand.players) if (o !== p && canAct(o)) o.acted = false;
      }
      p.last = { type: isAllIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: paid, to };
      break;
    }
    default:
      fail('Acción desconocida');
  }

  p.acted = true;
  log(hand, { userId, type: p.last.type, amount: p.last.amount || 0 });

  if (roundComplete(hand)) endRound(table);
  else {
    const next = nextIn(hand.players, userId, (o) => canAct(o) && (!o.acted || o.bet < hand.currentBet));
    hand.toAct = next ? next.userId : null;
    if (!next) endRound(table);
  }
  return hand;
}

function endRound(table) {
  const hand = table.hand;
  for (const p of hand.players) {
    p.bet = 0;
    p.acted = false;
  }
  hand.currentBet = 0;
  hand.minRaise = blinds(table.settings).bb;
  hand.toAct = null;

  const live = hand.players.filter(inHand);
  if (live.length === 1) {
    // todos se retiraron: gana sin enseñar
    const total = hand.players.reduce((s, p) => s + p.total, 0);
    return finishHand(table, { [live[0].userId]: total }, 'fold');
  }

  const idx = STAGES.indexOf(hand.stage);
  if (idx < 3) {
    hand.awaiting = STAGES[idx + 1];
    if (handMode(hand) === 'random') dealNext(table);
  } else {
    goShowdown(table);
  }
}

/** Modo aleatorio: la app saca del mazo las cartas de la siguiente calle. */
function dealNext(table) {
  const hand = table.hand;
  const need = BOARD_SIZE[hand.awaiting] - hand.board.length;
  hand.deck.shift(); // carta quemada
  setBoard(table, hand.deck.splice(0, need), { auto: true });
}

// ---------------- Board (dealer) ----------------

export function setBoard(table, cards, { auto = false } = {}) {
  const hand = table.hand;
  if (!hand || !hand.awaiting) fail('No toca poner cartas ahora');
  if (handMode(hand) === 'random' && !auto) fail('En el modo aleatorio las cartas las reparte la app');
  const stage = hand.awaiting;
  const need = BOARD_SIZE[stage] - hand.board.length;
  if (!Array.isArray(cards) || cards.length !== need) fail(`Debes elegir ${need} carta(s)`);
  for (const c of cards) if (!isValidCard(c)) fail('Carta no válida');
  const taken = new Set([...hand.board, ...hand.players.flatMap((p) => p.cards)]);
  const seen = new Set();
  for (const c of cards) {
    if (taken.has(c) || seen.has(c)) fail(`La carta ${c} ya está en juego`);
    seen.add(c);
  }
  hand.board.push(...cards);
  hand.stage = stage;
  hand.awaiting = null;
  log(hand, { type: 'board', cards });

  if (handMode(hand) === 'offline') {
    hand.toAct = null;
    if (stage === 'river') goShowdown(table);
    else hand.awaiting = STAGES[STAGES.indexOf(stage) + 1];
    return hand;
  }

  const actors = hand.players.filter(canAct);
  if (actors.length >= 2) {
    const first = nextIn(hand.players, hand.buttonId, canAct);
    hand.toAct = first.userId;
  } else {
    // todos (menos uno) all-in: se reparten las cartas sin apuestas
    endRound(table);
  }
  return hand;
}

/** El dealer puede corregir la última carta/s puestas si se equivocó (antes de que nadie actúe). */
export function undoBoard(table) {
  const hand = table.hand;
  if (!hand || hand.stage === 'preflop' || hand.stage === 'done' || hand.stage === 'showdown') fail('No se puede corregir ahora');
  const offline = handMode(hand) === 'offline';
  if (handMode(hand) === 'random') fail('En el modo aleatorio no se corrigen cartas');
  if (hand.awaiting && !offline) fail('No se puede corregir ahora');
  const acted = hand.log.length && hand.log[hand.log.length - 1].type !== 'board';
  if (acted && !offline) fail('Ya hubo acciones en esta calle');
  const prev = STAGES[STAGES.indexOf(hand.stage) - 1];
  const keep = prev === 'preflop' ? 0 : BOARD_SIZE[prev];
  hand.board = hand.board.slice(0, keep);
  hand.awaiting = hand.stage;
  hand.stage = prev;
  hand.toAct = null;
  const i = hand.log.map((l) => l.type).lastIndexOf('board');
  if (i >= 0) hand.log.splice(i, 1);
}

// ---------------- Cartas propias ----------------

export function setHoleCards(table, userId, cards, { free = false } = {}) {
  const hand = table.hand;
  if (!hand || hand.stage === 'done') fail('No hay mano activa');
  if (handMode(hand) === 'random') fail('En el modo aleatorio la app reparte tus cartas');
  const p = getPlayer(hand, userId);
  if (!p) fail('No estás en esta mano');
  if (!Array.isArray(cards) || cards.length > 2) fail('Máximo 2 cartas');
  for (const c of cards) if (!isValidCard(c)) fail('Carta no válida');
  if (cards.length === 2 && cards[0] === cards[1]) fail('Cartas repetidas');
  const taken = new Set([...hand.board, ...hand.players.filter((o) => o !== p).flatMap((o) => o.cards)]);
  for (const c of cards) if (taken.has(c)) fail('Esa carta no está disponible');
  // en vivo, una vez registradas solo se cambian con permiso del dealer (si no, sería trampa)
  if (handMode(hand) === 'live' && p.cards.length === 2 && !free) {
    if (!p.cardsUnlock) fail('Para cambiar tus cartas pide permiso al dealer');
    delete p.cardsUnlock;
  }
  delete p.changeReq;
  p.cards = cards;
}

// ---------------- Showdown ----------------

export function computePots(players) {
  const levels = [...new Set(players.filter(inHand).map((p) => p.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lvl of levels) {
    const amount = players.reduce((s, p) => s + Math.max(0, Math.min(p.total, lvl) - Math.min(p.total, prev)), 0);
    const eligible = players.filter((p) => inHand(p) && p.total >= lvl).map((p) => p.userId);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = lvl;
  }
  // fichas de jugadores retirados por encima del último nivel
  const leftover = players.reduce((s, p) => s + Math.max(0, p.total - prev), 0);
  if (leftover && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

function goShowdown(table) {
  const hand = table.hand;
  hand.stage = 'showdown';
  hand.awaiting = null;
  hand.toAct = null;
  const pots =
    handMode(hand) === 'offline'
      ? [{ amount: 0, eligible: hand.players.filter(inHand).map((p) => p.userId) }]
      : computePots(hand.players);
  const scores = {};
  if (hand.board.length === 5) {
    for (const p of hand.players.filter(inHand)) {
      if (p.cards.length === 2) {
        const ev = evaluate([...p.cards, ...hand.board]);
        scores[p.userId] = ev;
      }
    }
  }
  hand.pots = pots.map((pot) => {
    const known = pot.eligible.filter((id) => scores[id]);
    let suggested = [];
    if (pot.eligible.length === 1) suggested = [...pot.eligible];
    // en vivo, si alguien no registró sus cartas la app no puede saber quién gana: decide el dealer
    else if (known.length && (handMode(hand) !== 'live' || known.length === pot.eligible.length)) {
      const best = Math.max(...known.map((id) => scores[id].score));
      suggested = known.filter((id) => scores[id].score === best);
    }
    return { ...pot, suggested, complete: known.length === pot.eligible.length };
  });
  hand.handNames = Object.fromEntries(Object.entries(scores).map(([id, ev]) => [id, ev.name]));
  // si solo hay un bote con un único elegible (resto all-in que ya se repartió) se resuelve solo
  if (hand.pots.every((p) => p.eligible.length === 1)) {
    resolveShowdown(table, hand.pots.map((p) => p.eligible));
  } else if (handMode(hand) === 'random' && hand.pots.every((p) => p.complete && p.suggested.length)) {
    // con cartas repartidas por la app el ganador se sabe con certeza
    resolveShowdown(table, hand.pots.map((p) => p.suggested));
  }
}

/** winners: array (uno por bote) de arrays de userIds. */
export function resolveShowdown(table, winners) {
  const hand = table.hand;
  if (!hand || hand.stage !== 'showdown') fail('No hay showdown pendiente');
  if (!Array.isArray(winners) || winners.length !== hand.pots.length) fail('Elige ganador para cada bote');
  const order = orderFromButton(hand);
  const payout = {};
  hand.pots.forEach((pot, i) => {
    const ws = [...new Set(winners[i])].filter((id) => pot.eligible.includes(id));
    if (!ws.length) fail(`Elige al menos un ganador para el bote ${i + 1}`);
    ws.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const share = Math.floor(pot.amount / ws.length);
    let rem = pot.amount - share * ws.length;
    for (const id of ws) {
      payout[id] = (payout[id] || 0) + share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
  });
  finishHand(table, payout, 'showdown');
}

function orderFromButton(hand) {
  const ids = hand.players.map((p) => p.userId);
  const i = ids.indexOf(hand.buttonId);
  return [...ids.slice(i + 1), ...ids.slice(0, i + 1)];
}

function finishHand(table, payout, how) {
  const hand = table.hand;
  for (const p of hand.players) {
    p.won = payout[p.userId] || 0;
    p.stack += p.won;
    const seat = table.seats.find((s) => s.userId === p.userId);
    if (seat) seat.chips = p.stack;
  }
  hand.result = {
    how,
    payout,
    potTotal: hand.players.reduce((s, p) => s + p.total, 0),
    winners: Object.keys(payout),
  };
  hand.stage = 'done';
  hand.toAct = null;
  hand.awaiting = null;
  hand.finishedAt = Date.now();
  delete hand.deck;
  log(hand, { type: 'end', payout });
  // el modo sin dinero no cuenta para los rankings
  if (handMode(hand) !== 'offline') hand.needsPersist = true;
}

/** ¿Puede este jugador recomprar ahora? (no mientras sigue vivo en una mano) */
export function checkRebuy(table, userId) {
  if (modeOf(table) === 'offline') fail('En el modo sin dinero no hay fichas');
  const seat = table.seats.find((s) => s.userId === userId);
  if (!seat) fail('No estás sentado en la mesa');
  const p = isHandLive(table) ? getPlayer(table.hand, userId) : null;
  if (p && !p.folded) fail('Podrás recomprar cuando termine la mano');
  return seat;
}

/** Recompra: suma las fichas iniciales al jugador. */
export function applyRebuy(table, userId, amount = table.settings.startingChips) {
  const seat = checkRebuy(table, userId);
  seat.chips += amount;
  seat.buyIn = (seat.buyIn || 0) + amount;
  seat.rebuys = (seat.rebuys || 0) + 1;
  seat.timeouts = 0;
  if (seat.status === 'sitout' && seat.chips > 0) seat.status = 'active';
  delete seat.rebuyRequest;
  return amount;
}

/**
 * Recompras votadas (modo aleatorio): se aplican cuando todos los demás jugadores
 * que siguen en la mesa las han aceptado. Devuelve los userIds a los que se aplicó.
 */
export function settleRebuyVotes(table) {
  const applied = [];
  const present = new Set(table.seats.map((s) => s.userId));
  for (const seat of table.seats) {
    const req = seat.rebuyRequest;
    if (!req?.needed) continue;
    req.needed = req.needed.filter((id) => present.has(id));
    req.approvals = (req.approvals || []).filter((id) => req.needed.includes(id));
    // en vivo, tras los votos las fichas las asigna el dealer a mano
    if (req.dealerAssign || req.approvals.length < req.needed.length) continue;
    try {
      applyRebuy(table, seat.userId, req.amount);
      applied.push(seat.userId);
    } catch {
      /* sigue jugando una mano: se aplicará al terminarla */
    }
  }
  return applied;
}

/** Al terminar la mano, un jugador puede enseñar sus cartas a la mesa (p. ej. tras ganar porque todos se retiraron). */
export function showCards(table, userId) {
  const hand = table.hand;
  if (!hand || hand.stage !== 'done') fail('Solo puedes enseñar tus cartas cuando termina la mano');
  const p = getPlayer(hand, userId);
  if (!p) fail('No jugaste esta mano');
  if (p.cards.length !== 2) fail('La app no tiene tus cartas de esta mano');
  hand.shown = [...new Set([...(hand.shown || []), userId])];
}

/** En vivo, una recompra pendiente pausa la partida hasta que se resuelve. */
export function pausedBy(table) {
  if (modeOf(table) !== 'live') return null;
  return table.seats.find((s) => s.rebuyRequest) || null;
}

/** Nueva partida: todos vuelven a las fichas iniciales. */
export function resetChips(table) {
  if (isHandLive(table)) fail('Espera a que termine la mano');
  for (const s of table.seats) {
    s.chips = table.settings.startingChips;
    s.buyIn = table.settings.startingChips;
    s.rebuys = 0;
    delete s.rebuyRequest;
  }
}

/** Un jugador abandona la mano fuera de su turno (se levanta, se va, lo expulsan). */
export function foldOut(table, userId) {
  const hand = table.hand;
  if (!isHandLive(table)) return;
  const p = getPlayer(hand, userId);
  if (!p || p.folded) return;
  if (hand.toAct === userId) return act(table, userId, 'fold');
  p.folded = true;
  p.last = { type: 'fold' };
  log(hand, { userId, type: 'fold', amount: 0 });
  const live = hand.players.filter(inHand);
  if (hand.stage === 'showdown') {
    if (live.length === 1) {
      const total = hand.players.reduce((s, x) => s + x.total, 0);
      return finishHand(table, { [live[0].userId]: total }, 'fold');
    }
    return goShowdown(table);
  }
  if (live.length === 1) return endRound(table);
  if (hand.toAct && roundComplete(hand)) endRound(table);
}

/** El dealer retira a un jugador inactivo (fold forzado). */
export function forceFold(table, userId) {
  const hand = table.hand;
  if (!hand || hand.toAct !== userId) fail('Ese jugador no tiene el turno');
  const legal = legalActions(table, userId);
  return act(table, userId, legal?.canCheck ? 'check' : 'fold');
}

/** Cancela la mano actual devolviendo las fichas apostadas. */
export function cancelHand(table) {
  const hand = table.hand;
  if (!isHandLive(table)) fail('No hay mano en curso');
  for (const p of hand.players) {
    const seat = table.seats.find((s) => s.userId === p.userId);
    if (seat) seat.chips = p.startStack;
  }
  table.hand = null;
  table.handNo = Math.max(0, (table.handNo || 1) - 1);
}
