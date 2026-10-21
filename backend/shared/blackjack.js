// Blackjack: valor de las manos y pagos de las apuestas laterales (Par y 21+3).
// Compartido por el backend (motor) y el frontend (totales y tabla de pagos).
import { RANKS } from './poker.js';

export const BJ_DECKS = 6; // sabot de 6 barajas
export const BJ_MAX_HANDS = 4; // se puede dividir hasta tener 4 manos

/** Valor de una carta: figuras 10, as 11 (se cuenta 1 si te pasas). */
export function cardValue(c) {
  const r = c[0];
  if (r === 'A') return 11;
  if ('TJQK'.includes(r)) return 10;
  return Number(r);
}

/** Total de una mano y si es «blanda» (un as cuenta 11). */
export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (!c) continue;
    total += cardValue(c);
    if (c[0] === 'A') aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

/** Blackjack natural: as + figura con las dos primeras cartas (no cuenta tras dividir). */
export const isBlackjack = (cards, split = false) => !split && cards.length === 2 && handTotal(cards).total === 21;

/** Texto del total: «7 / 17» si es blanda (mientras se juega), «21» o «Blackjack». */
export function totalLabel(cards, split = false, done = false) {
  if (isBlackjack(cards, split)) return 'Blackjack';
  const { total, soft } = handTotal(cards);
  return soft && total < 21 && !done ? `${total - 10} / ${total}` : String(total);
}

const RED = new Set(['h', 'd']);

// ---------------- Par (Perfect Pairs) ----------------
// Con tus dos primeras cartas: pareja del mismo palo, del mismo color o de distinto color.
export const PAIR_PAYS = [
  { kind: 'perfect', label: 'Pareja perfecta', desc: 'Mismo número y mismo palo', pays: 25 },
  { kind: 'colored', label: 'Pareja de color', desc: 'Mismo número y mismo color', pays: 12 },
  { kind: 'mixed', label: 'Pareja mixta', desc: 'Mismo número, distinto color', pays: 6 },
];

export function pairKind([a, b]) {
  if (!a || !b || a[0] !== b[0]) return null;
  if (a[1] === b[1]) return 'perfect';
  if (RED.has(a[1]) === RED.has(b[1])) return 'colored';
  return 'mixed';
}

// ---------------- 21+3 ----------------
// Tus dos primeras cartas + la carta visible de la banca, como una mano de póker de 3 cartas.
export const T21_PAYS = [
  { kind: 'suitedTrips', label: 'Trío del mismo palo', desc: 'Tres cartas iguales y del mismo palo', pays: 100 },
  { kind: 'straightFlush', label: 'Escalera de color', desc: 'Seguidas y del mismo palo', pays: 40 },
  { kind: 'trips', label: 'Trío', desc: 'Tres cartas del mismo número', pays: 30 },
  { kind: 'straight', label: 'Escalera', desc: 'Tres cartas seguidas', pays: 10 },
  { kind: 'flush', label: 'Color', desc: 'Tres cartas del mismo palo', pays: 5 },
];

export function t21Kind(cards) {
  if (cards.length !== 3 || cards.some((c) => !c)) return null;
  const suited = cards.every((c) => c[1] === cards[0][1]);
  const trips = cards.every((c) => c[0] === cards[0][0]);
  if (trips) return suited ? 'suitedTrips' : 'trips';
  const r = cards.map((c) => RANKS.indexOf(c[0])).sort((x, y) => x - y);
  // el as vale alto (Q-K-A) o bajo (A-2-3)
  const straight = (r[0] + 1 === r[1] && r[1] + 1 === r[2]) || (r[0] === 0 && r[1] === 1 && r[2] === 12);
  if (straight && suited) return 'straightFlush';
  if (straight) return 'straight';
  if (suited) return 'flush';
  return null;
}

export const sideInfo = (kind) => [...PAIR_PAYS, ...T21_PAYS].find((x) => x.kind === kind) || null;
