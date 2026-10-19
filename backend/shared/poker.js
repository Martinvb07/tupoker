// Motor de póker compartido entre servidor y cliente.
// Cartas en formato texto: rango + palo, p.ej. "As", "Td", "9h".

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // picas, corazones, diamantes, tréboles

export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAME = { s: 'Picas', h: 'Corazones', d: 'Diamantes', c: 'Tréboles' };
export const RANK_LABEL = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

const RANK_SING = ['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Jota', 'Reina', 'Rey', 'As'];
const RANK_PLUR = ['Doses', 'Treses', 'Cuatros', 'Cincos', 'Seises', 'Sietes', 'Ochos', 'Nueves', 'Dieces', 'Jotas', 'Reinas', 'Reyes', 'Ases'];

export const CATEGORIES = [
  'Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera',
  'Color', 'Full', 'Póker', 'Escalera de color',
];

export const FULL_DECK = (() => {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
})();

export function isValidCard(c) {
  return typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);
}

export function cardToInt(c) {
  return RANKS.indexOf(c[0]) * 4 + SUITS.indexOf(c[1]);
}

export function rankLabel(c) {
  return RANK_LABEL[c[0]] || c[0];
}

// ---------- Evaluador (5 a 7 cartas, enteros) ----------

function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  // rueda A-2-3-4-5
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

function topBits(mask, n, exclude = []) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (mask & (1 << r) && !exclude.includes(r)) out.push(r);
  }
  return out;
}

function pack(cat, ranks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (ranks[i] ?? 0);
  return s;
}

/** Evalúa cartas codificadas como enteros. Devuelve un score comparable (mayor = mejor). */
export function evalInts(cards) {
  const counts = new Array(13).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    counts[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sh = straightHigh(suitMask[flushSuit]);
    if (sh >= 0) return pack(8, [sh]);
  }

  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads.length) return pack(7, [quads[0], topBits(rankMask, 1, [quads[0]])[0]]);

  if (trips.length && (trips.length > 1 || pairs.length)) {
    const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(6, [trips[0], p]);
  }

  if (flushSuit >= 0) return pack(5, topBits(suitMask[flushSuit], 5));

  const sh = straightHigh(rankMask);
  if (sh >= 0) return pack(4, [sh]);

  if (trips.length) return pack(3, [trips[0], ...topBits(rankMask, 2, [trips[0]])]);

  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return pack(2, [a, b, topBits(rankMask, 1, [a, b])[0]]);
  }

  if (pairs.length === 1) return pack(1, [pairs[0], ...topBits(rankMask, 3, [pairs[0]])]);

  return pack(0, topBits(rankMask, 5));
}

export function scoreCategory(score) {
  return Math.floor(score / 16 ** 5);
}

function scoreRanks(score) {
  const out = [];
  for (let i = 4; i >= 0; i--) out.push(Math.floor(score / 16 ** i) % 16);
  return out;
}

export function describeScore(score) {
  const cat = scoreCategory(score);
  const r = scoreRanks(score);
  switch (cat) {
    case 8: return r[0] === 12 ? 'Escalera real' : `Escalera de color al ${RANK_SING[r[0]]}`;
    case 7: return `Póker de ${RANK_PLUR[r[0]]}`;
    case 6: return `Full de ${RANK_PLUR[r[0]]} con ${RANK_PLUR[r[1]]}`;
    case 5: return `Color al ${RANK_SING[r[0]]}`;
    case 4: return `Escalera al ${RANK_SING[r[0]]}`;
    case 3: return `Trío de ${RANK_PLUR[r[0]]}`;
    case 2: return `Doble pareja: ${RANK_PLUR[r[0]]} y ${RANK_PLUR[r[1]]}`;
    case 1: return `Pareja de ${RANK_PLUR[r[0]]}`;
    default: return `Carta alta: ${RANK_SING[r[0]]}`;
  }
}

/** Evalúa cartas en texto. Requiere al menos 5 cartas. */
export function evaluate(cards) {
  const score = evalInts(cards.map(cardToInt));
  const category = scoreCategory(score);
  return { score, category, categoryName: CATEGORIES[category], name: describeScore(score) };
}

/** Descripción corta de la mano actual con 2+ cartas (sirve en preflop). */
export function describeCurrent(hole, board = []) {
  const all = [...hole, ...board];
  if (all.length >= 5) return evaluate(all);
  if (hole.length === 2) {
    const [a, b] = hole;
    const ra = RANKS.indexOf(a[0]), rb = RANKS.indexOf(b[0]);
    if (ra === rb) return { category: 1, categoryName: 'Pareja', name: `Pareja de ${RANK_PLUR[ra]}` };
    const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
    const suited = a[1] === b[1];
    return {
      category: 0,
      categoryName: 'Carta alta',
      name: `${RANKS[hi].replace('T', '10')}-${RANKS[lo].replace('T', '10')} ${suited ? 'del mismo palo' : 'de distinto palo'}`,
    };
  }
  return null;
}

// ---------- Probabilidades (Monte Carlo) ----------

/**
 * Calcula equity de la mano del jugador contra N rivales con cartas desconocidas.
 * Devuelve porcentajes de ganar/empatar/perder y la distribución de la jugada final.
 */
export function equity({ hole, board = [], opponents = 1, iterations = 4000, dead = [] }) {
  const heroInts = hole.map(cardToInt);
  const boardInts = board.map(cardToInt);
  const used = new Set([...heroInts, ...boardInts, ...dead.map(cardToInt)]);
  const deck = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) deck.push(i);

  opponents = Math.max(1, Math.min(9, opponents));
  const needBoard = 5 - boardInts.length;
  const need = needBoard + opponents * 2;
  let win = 0, tie = 0, lose = 0, equitySum = 0;
  const cats = new Array(9).fill(0);
  const n = deck.length;
  const pool = deck.slice();
  const fullBoard = new Array(5);
  const hand = new Array(7);

  for (let it = 0; it < iterations; it++) {
    // barajado parcial de Fisher-Yates
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    let k = 0;
    for (let i = 0; i < 5; i++) fullBoard[i] = i < boardInts.length ? boardInts[i] : pool[k++];

    hand[0] = heroInts[0]; hand[1] = heroInts[1];
    for (let i = 0; i < 5; i++) hand[i + 2] = fullBoard[i];
    const hero = evalInts(hand);
    cats[scoreCategory(hero)]++;

    let best = -1, bestCount = 0;
    for (let o = 0; o < opponents; o++) {
      hand[0] = pool[k++]; hand[1] = pool[k++];
      const s = evalInts(hand);
      if (s > best) { best = s; bestCount = 1; } else if (s === best) bestCount++;
    }
    if (hero > best) { win++; equitySum += 1; }
    else if (hero === best) { tie++; equitySum += 1 / (bestCount + 1); }
    else lose++;
  }

  const pct = (x) => (x / iterations) * 100;
  return {
    win: pct(win),
    tie: pct(tie),
    lose: pct(lose),
    equity: pct(equitySum),
    categories: cats.map((c, i) => ({ category: i, name: CATEGORIES[i], pct: pct(c) })),
  };
}

/**
 * Probabilidad de ganar de varias manos conocidas (all-in / showdown) completando el board.
 * Devuelve un % por mano; los empates se reparten.
 */
export function equityVs(hands, board = [], iterations = 4000) {
  const hs = hands.map((h) => h.map(cardToInt));
  const b = board.map(cardToInt);
  const used = new Set([...hs.flat(), ...b]);
  const pool = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) pool.push(i);
  const need = 5 - b.length;
  const iters = need === 0 ? 1 : iterations;
  const wins = new Array(hs.length).fill(0);
  const full = new Array(5);
  const scores = new Array(hs.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    for (let i = 0; i < 5; i++) full[i] = i < b.length ? b[i] : pool[i - b.length];
    let best = -1, count = 0;
    for (let k = 0; k < hs.length; k++) {
      scores[k] = evalInts([...hs[k], ...full]);
      if (scores[k] > best) { best = scores[k]; count = 1; } else if (scores[k] === best) count++;
    }
    for (let k = 0; k < hs.length; k++) if (scores[k] === best) wins[k] += 1 / count;
  }
  return wins.map((w) => (w / iters) * 100);
}

// ---------- Fichas ----------

const CHIP_MULTIPLIERS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Denominaciones de fichas a partir de la apuesta mínima y máxima que define el dealer. */
export function chipDenominations(minBet, maxBet = 0, cap = 0) {
  // con máxima, ninguna ficha la pasa (si no, tocarla pondría siempre la máxima) y la máxima es una ficha más
  if (maxBet > 0) {
    const out = CHIP_MULTIPLIERS.map((m) => minBet * m).filter((v) => v < maxBet).slice(0, 7);
    return [...out, Math.max(minBet, maxBet)];
  }
  const limit = maxBet > 0 ? maxBet : cap > 0 ? cap : minBet * 1000;
  const out = [];
  for (const m of CHIP_MULTIPLIERS) {
    const v = minBet * m;
    if (v > limit && out.length >= 3) break;
    out.push(v);
    if (out.length >= 8) break;
  }
  return out;
}

export function formatChips(n) {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  const fmt = (v, s) => {
    const str = (Math.round(v * 10) / 10).toString().replace('.', ',');
    return str + s;
  };
  if (abs >= 1e9) return fmt(n / 1e9, 'B');
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e4) return fmt(n / 1e3, 'K');
  if (abs >= 1e3 && abs % 1000 === 0) return fmt(n / 1e3, 'K');
  return n.toLocaleString('es-ES');
}
