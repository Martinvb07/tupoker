// Blackjack contra la banca: la app hace de crupier y reparte de un sabot de 6 barajas.
//  1. «bets»: cada jugador apuesta (principal y, si quiere, Par y 21+3) antes de que acabe el tiempo.
//     Quien no apuesta se queda fuera de esa ronda.
//  2. Se reparten 2 cartas a cada uno y 2 a la banca (una tapada). Se pagan las apuestas laterales.
//     Si la banca enseña As o figura y tiene blackjack, la ronda acaba ahí.
//  3. «play»: por turnos, cada mano pide, se planta, dobla o divide.
//  4. La banca destapa y pide hasta 17 (se planta con 17 blando) y se paga:
//     ganar 1:1, blackjack 3:2, empate devuelve la apuesta.
import { randomInt } from 'node:crypto';
import { FULL_DECK } from '../../shared/poker.js';
import { BJ_DECKS, BJ_MAX_HANDS, cardValue, handTotal, isBlackjack, pairKind, t21Kind, PAIR_PAYS, T21_PAYS } from '../../shared/blackjack.js';
import { GameError } from './engine.js';

const fail = (msg) => {
  throw new GameError(msg);
};

function newShoe() {
  const d = [];
  for (let i = 0; i < BJ_DECKS; i++) d.push(...FULL_DECK);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
// se baraja de nuevo cuando queda menos de un cuarto del sabot
const RESHUFFLE_AT = Math.floor(52 * BJ_DECKS * 0.25);

const SIDE = { pair: PAIR_PAYS, t21: T21_PAYS };
const payOf = (bet, kind) => SIDE[bet].find((x) => x.kind === kind)?.pays || 0;

function log(hand, entry) {
  hand.log.push({ ...entry, stage: hand.stage, t: Date.now() });
  if (hand.log.length > 200) hand.log.shift();
}

/** Nueva ronda: empieza la fase de apuestas con los jugadores que tienen fichas. */
export function startRound(table, seats) {
  const prev = table.hand;
  const hand = {
    no: (table.handNo || 0) + 1,
    mode: 'blackjack',
    stage: 'bets',
    players: seats.map((s) => ({
      userId: s.userId,
      stack: s.chips,
      startStack: s.chips,
      bets: { main: 0, pair: 0, t21: 0 },
      ready: false,
      out: false,
      hands: [],
      cur: 0,
      side: {},
      total: 0, // apostado en la ronda
      bet: 0,
      won: 0, // lo que devuelve la banca (apuesta incluida)
      folded: false,
      cards: [],
    })),
    dealer: [],
    dealerOpen: false,
    // el sabot sigue de una ronda a otra
    shoe: prev?.shoe?.length > RESHUFFLE_AT ? prev.shoe : null,
    toAct: null,
    log: [],
    startedAt: Date.now(),
  };
  if (!hand.shoe) {
    hand.shoe = newShoe();
    hand.shuffled = true;
  }
  if (!hand.players.length) fail('Nadie tiene fichas para apostar');
  table.handNo = hand.no;
  table.status = 'playing';
  table.hand = hand;
  return hand;
}

function player(table, userId) {
  const hand = table.hand;
  if (!hand || hand.mode !== 'blackjack' || hand.stage === 'done') fail('No hay ninguna ronda de blackjack en curso');
  const p = hand.players.find((x) => x.userId === userId);
  if (!p || p.out) fail('No juegas esta ronda');
  return [hand, p];
}

/** Límites de apuesta: la mínima y la máxima de la mesa valen por apuesta. */
export function betLimits(table) {
  const { minBet, maxBet } = table.settings;
  return { min: minBet, max: maxBet > 0 ? maxBet : Infinity };
}

/** Confirmar las apuestas de la ronda (una vez confirmadas no se cambian). */
export function placeBets(table, userId, bets = {}) {
  const [hand, p] = player(table, userId);
  if (hand.stage !== 'bets') fail('Ya no se admiten apuestas');
  if (p.ready) fail('Ya has apostado en esta ronda');
  const { min, max } = betLimits(table);
  const n = (v) => Math.floor(Number(v) || 0);
  const b = { main: n(bets.main), pair: n(bets.pair), t21: n(bets.t21) };
  if (b.main < min) fail(`La apuesta mínima es ${min}`);
  for (const k of ['main', 'pair', 't21']) {
    if (b[k] < 0) fail('Cantidad no válida');
    if (b[k] > max) fail(`La apuesta máxima es ${max}`);
  }
  // las laterales no pueden superar a la principal
  if (b.pair > b.main || b.t21 > b.main) fail('Las apuestas laterales no pueden superar a la principal');
  const sum = b.main + b.pair + b.t21;
  if (sum > p.stack) fail('No tienes tantas fichas');
  p.bets = b;
  p.stack -= sum;
  p.total = sum;
  p.ready = true;
  log(hand, { userId, type: 'bet', amount: sum });
  if (hand.players.every((x) => x.ready || x.out)) deal(table);
}

/** Se acaba el tiempo de apostar: quien no apostó se queda fuera; si nadie apostó, no hay ronda. */
export function closeBets(table) {
  const hand = table.hand;
  if (hand?.mode !== 'blackjack' || hand.stage !== 'bets') return [];
  const idle = hand.players.filter((p) => !p.ready && !p.out);
  for (const p of idle) p.out = true;
  if (hand.players.some((p) => p.ready)) deal(table);
  else finish(table, 'nobets');
  return idle.map((p) => p.userId);
}

function draw(hand) {
  if (!hand.shoe.length) {
    hand.shoe = newShoe();
    hand.shuffled = true;
  }
  return hand.shoe.pop();
}

function deal(table) {
  const hand = table.hand;
  const ps = hand.players.filter((p) => p.ready && !p.out);
  // como en el casino: una carta a cada uno, una a la banca, y otra vuelta
  for (const p of ps) p.hands = [{ cards: [draw(hand)], bet: p.bets.main, doubled: false, split: false, done: false }];
  hand.dealer = [draw(hand)];
  for (const p of ps) p.hands[0].cards.push(draw(hand));
  hand.dealer.push(draw(hand));

  // apuestas laterales: se pagan al momento
  const up = hand.dealer[0];
  for (const p of ps) {
    const [a, b] = p.hands[0].cards;
    if (p.bets.pair) {
      const kind = pairKind([a, b]);
      const win = kind ? p.bets.pair * (payOf('pair', kind) + 1) : 0;
      p.side.pair = { kind, bet: p.bets.pair, win };
      p.stack += win;
      p.won += win;
    }
    if (p.bets.t21) {
      const kind = t21Kind([a, b, up]);
      const win = kind ? p.bets.t21 * (payOf('t21', kind) + 1) : 0;
      p.side.t21 = { kind, bet: p.bets.t21, win };
      p.stack += win;
      p.won += win;
    }
    if (isBlackjack(p.hands[0].cards)) p.hands[0].done = true;
  }
  hand.stage = 'play';
  log(hand, { type: 'deal' });

  // la banca mira si tiene blackjack cuando enseña un As o una figura
  if (cardValue(up) >= 10 && isBlackjack(hand.dealer)) return dealerTurn(table);
  nextTurn(table);
}

/** Pasa el turno a la siguiente mano sin terminar; si no queda ninguna, juega la banca. */
function nextTurn(table) {
  const hand = table.hand;
  for (const p of hand.players) {
    if (!p.ready || p.out) continue;
    while (p.cur < p.hands.length && p.hands[p.cur].done) p.cur++;
    if (p.cur < p.hands.length) {
      hand.toAct = p.userId;
      return;
    }
  }
  hand.toAct = null;
  dealerTurn(table);
}

/** Qué puede hacer el jugador con la mano que le toca. */
export function options(table, userId) {
  const hand = table.hand;
  if (hand?.mode !== 'blackjack' || hand.stage !== 'play' || hand.toAct !== userId) return null;
  const p = hand.players.find((x) => x.userId === userId);
  const h = p?.hands[p.cur];
  if (!h || h.done) return null;
  const two = h.cards.length === 2;
  return {
    hand: p.cur,
    canHit: true,
    canStand: true,
    canDouble: two && p.stack >= h.bet,
    canSplit: two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && p.hands.length < BJ_MAX_HANDS && p.stack >= h.bet,
    bet: h.bet,
    stack: p.stack,
  };
}

/** Pedir, plantarse, doblar o dividir. */
export function act(table, userId, type) {
  const [hand, p] = player(table, userId);
  if (hand.stage !== 'play') fail('Ahora no se puede jugar');
  if (hand.toAct !== userId) fail('No es tu turno');
  const o = options(table, userId);
  const h = p.hands[p.cur];
  switch (type) {
    case 'hit':
      h.cards.push(draw(hand));
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      if (!o.canDouble) fail(h.cards.length === 2 ? 'No tienes fichas para doblar' : 'Solo se dobla con las dos primeras cartas');
      p.stack -= h.bet;
      p.total += h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(hand));
      h.done = true;
      break;
    case 'split': {
      if (!o.canSplit) fail(p.stack < h.bet ? 'No tienes fichas para dividir' : 'Solo se dividen dos cartas del mismo valor');
      p.stack -= h.bet;
      p.total += h.bet;
      const aces = h.cards[0][0] === 'A';
      const second = { cards: [h.cards.pop()], bet: h.bet, doubled: false, split: true, done: false };
      h.split = true;
      h.cards.push(draw(hand));
      second.cards.push(draw(hand));
      p.hands.splice(p.cur + 1, 0, second);
      // con ases divididos sale una sola carta a cada uno
      if (aces) h.done = second.done = true;
      break;
    }
    default:
      fail('Jugada no válida');
  }
  // con 21 o pasado de 21 la mano se cierra sola
  for (const x of p.hands) if (!x.done && handTotal(x.cards).total >= 21) x.done = true;
  log(hand, { userId, type, hand: p.cur });
  nextTurn(table);
}

/** Tiempo agotado o jugador que se va: se planta con lo que tiene. */
export function standAll(table, userId) {
  const hand = table.hand;
  if (hand?.mode !== 'blackjack' || hand.stage === 'done') return;
  const p = hand.players.find((x) => x.userId === userId);
  if (!p || p.out) return;
  if (hand.stage === 'bets') {
    // aún no se repartió: recupera lo apostado y no juega la ronda
    p.stack = p.startStack;
    p.total = 0;
    p.out = true;
    if (!hand.players.some((x) => !x.out)) return finish(table, 'nobets');
    if (hand.players.every((x) => x.ready || x.out)) deal(table);
    return;
  }
  for (const h of p.hands) h.done = true;
  if (hand.toAct === userId) nextTurn(table);
}

function dealerTurn(table) {
  const hand = table.hand;
  hand.stage = 'dealer';
  hand.dealerOpen = true;
  hand.toAct = null;
  const live = hand.players.flatMap((p) => (p.ready && !p.out ? p.hands.map((h) => ({ h })) : []));
  // solo pide si queda alguna mano que no se pasó ni es blackjack
  const needs = live.some(({ h }) => handTotal(h.cards).total <= 21 && !isBlackjack(h.cards, h.split));
  if (needs && !isBlackjack(hand.dealer)) {
    while (handTotal(hand.dealer).total < 17) hand.dealer.push(draw(hand));
  }
  settle(table);
}

function settle(table) {
  const hand = table.hand;
  const d = handTotal(hand.dealer).total;
  const dealerBJ = isBlackjack(hand.dealer);
  for (const p of hand.players) {
    if (!p.ready || p.out) continue;
    for (const h of p.hands) {
      const t = handTotal(h.cards).total;
      const bj = isBlackjack(h.cards, h.split);
      let back = 0;
      if (t > 21) h.result = 'bust';
      else if (bj && !dealerBJ) {
        h.result = 'blackjack';
        back = h.bet + Math.floor((h.bet * 3) / 2);
      } else if (dealerBJ) h.result = bj ? 'push' : 'lose';
      else if (d > 21 || t > d) {
        h.result = 'win';
        back = h.bet * 2;
      } else if (t === d) {
        h.result = 'push';
        back = h.bet;
      } else h.result = 'lose';
      h.payout = back;
      p.stack += back;
      p.won += back;
    }
  }
  finish(table, 'settled');
}

function finish(table, how) {
  const hand = table.hand;
  const payout = {};
  for (const p of hand.players) {
    if (p.ready && !p.out) payout[p.userId] = p.won;
    const seat = table.seats.find((s) => s.userId === p.userId);
    if (seat) seat.chips = p.stack;
  }
  hand.result = {
    how,
    payout,
    net: Object.fromEntries(hand.players.filter((p) => p.ready && !p.out).map((p) => [p.userId, p.won - p.total])),
    dealerTotal: handTotal(hand.dealer).total,
    dealerBJ: hand.dealer.length === 2 && isBlackjack(hand.dealer),
    winners: hand.players.filter((p) => p.ready && !p.out && p.won > p.total).map((p) => p.userId),
  };
  hand.stage = 'done';
  hand.toAct = null;
  hand.finishedAt = Date.now();
  log(hand, { type: 'end' });
}

/** Lo que ve cada jugador: todo boca arriba salvo la carta tapada de la banca. */
export function view(hand) {
  return {
    board: [],
    dealer: hand.dealerOpen ? hand.dealer : hand.dealer.map((c, i) => (i === 1 ? '' : c)),
    dealerOpen: !!hand.dealerOpen,
    shuffled: !!hand.shuffled,
    shoeLeft: hand.shoe?.length || 0,
    betDeadline: hand.betDeadline || null,
    players: hand.players.map((p) => ({
      userId: p.userId,
      stack: p.stack,
      bets: p.bets,
      ready: p.ready,
      out: p.out,
      hands: p.hands.map(({ cards, bet, doubled, split, done, result, payout }) => ({ cards, bet, doubled, split, done, result: result || null, payout: payout || 0 })),
      cur: p.cur,
      side: p.side,
      total: p.total,
      won: p.won,
      bet: 0,
      folded: false,
      cards: [],
    })),
  };
}
