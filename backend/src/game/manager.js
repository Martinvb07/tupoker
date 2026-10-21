// Caché en memoria de las mesas activas + persistencia en MongoDB.
// IMPORTANTE: el estado vive en memoria, así que pm2 debe correr en modo fork con 1 instancia.
import { Table, Hand, PlayerHand } from '../models.js';
import { chipDenominations } from '../../shared/poker.js';
import { GameError, legalActions, isHandLive, getPlayer, modeOf, isAuto } from './engine.js';
import * as bj from './blackjack.js';

const cache = new Map(); // code -> table (objeto plano)
const saveChains = new Map();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export async function uniqueTableCode() {
  for (;;) {
    const code = randomCode(6);
    if (!(await Table.exists({ code }))) return code;
  }
}

function normalize(doc) {
  const t = doc.toObject ? doc.toObject() : doc;
  return {
    ...t,
    _id: t._id.toString(),
    ownerId: t.ownerId?.toString(),
    dealerId: t.dealerId?.toString(),
    groupId: t.groupId ? t.groupId.toString() : null,
    settings: {
      minBet: t.settings.minBet,
      maxBet: t.settings.maxBet,
      startingChips: t.settings.startingChips,
      mode: modeOf(t),
      chips: [...(t.settings.chips || [])],
      scan: !!t.settings.scan,
    },
  };
}

export async function getTable(code) {
  code = String(code || '').toUpperCase();
  if (cache.has(code)) return cache.get(code);
  const doc = await Table.findOne({ code }).lean();
  if (!doc) return null;
  const t = normalize(doc);
  cache.set(code, t);
  return t;
}

export function cacheTable(doc) {
  const t = normalize(doc);
  cache.set(t.code, t);
  return t;
}

export function save(table) {
  const hand = table.hand;
  const finished = hand?.needsPersist;
  if (finished) delete hand.needsPersist;
  const snapshot = JSON.parse(JSON.stringify({
    name: table.name,
    dealerId: table.dealerId,
    ownerId: table.ownerId,
    settings: table.settings,
    seats: table.seats,
    status: table.status,
    buttonUserId: table.buttonUserId,
    handNo: table.handNo,
    hand: table.hand,
    closedAt: table.closedAt,
  }));
  const prev = saveChains.get(table.code) || Promise.resolve();
  const next = prev
    .then(async () => {
      await Table.updateOne({ _id: table._id }, { $set: snapshot });
      if (finished) await persistHand(table, snapshot.hand);
    })
    .catch((e) => console.error('[save]', e));
  saveChains.set(table.code, next);
  if (table.status === 'closed') next.then(() => cache.delete(table.code));
  return next;
}

async function persistHand(table, hand) {
  const playersInfo = hand.players.map((p) => ({
    userId: p.userId,
    committed: p.total,
    won: p.won || 0,
    net: (p.won || 0) - p.total,
    folded: p.folded,
    cards: p.cards,
    handName: hand.handNames?.[p.userId] || '',
  }));
  const doc = await Hand.create({
    tableId: table._id,
    groupId: table.groupId,
    no: hand.no,
    board: hand.board,
    potTotal: hand.result.potTotal,
    players: playersInfo,
    winners: hand.result.winners,
  });
  await PlayerHand.insertMany(
    playersInfo.map((p) => ({
      userId: p.userId,
      groupId: table.groupId,
      tableId: table._id,
      handId: doc._id,
      committed: p.committed,
      won: p.won,
      net: p.net,
      showdown: hand.result.how === 'showdown' && !p.folded,
      winner: p.won > 0,
    })),
  );
}

// ---------------- Presencia ----------------

const presence = new Map(); // code -> Map(userId -> count)
export function markOnline(code, userId, delta) {
  if (!presence.has(code)) presence.set(code, new Map());
  const m = presence.get(code);
  const n = (m.get(userId) || 0) + delta;
  if (n <= 0) m.delete(userId);
  else m.set(userId, n);
}
export const isOnline = (code, userId) => !!presence.get(code)?.get(userId);

/** Mesa abierta en la que el usuario está sentado y conectado ahora mismo (para "amigos jugando"). */
export function activeTableOf(userId) {
  for (const t of cache.values()) {
    if (t.status === 'closed') continue;
    const seat = t.seats.find((s) => s.userId === userId);
    if (seat && isOnline(t.code, userId)) {
      return { code: t.code, name: t.name, mode: modeOf(t), players: t.seats.length, inHand: !!t.hand && t.hand.stage !== 'done' };
    }
  }
  return null;
}

/** Quién gestiona la mesa: el dealer; en modo aleatorio (sin dealer) también el anfitrión. */
export function canManage(table, userId) {
  if (table.dealerId === userId) return true;
  // sin dealer (aleatorio, viuda y blackjack) gestiona el anfitrión
  return isAuto(table) && table.ownerId === userId;
}

// ---------------- Vista por usuario ----------------

export function viewFor(table, userId) {
  const hand = table.hand;
  const reveal = hand && (hand.stage === 'showdown' || (hand.stage === 'done' && hand.result?.how === 'showdown'));
  const isDealer = table.dealerId === userId;
  const bjv = hand?.mode === 'blackjack' ? bj.view(hand) : null;
  return {
    id: table._id,
    code: table.code,
    name: table.name,
    groupId: table.groupId,
    ownerId: table.ownerId,
    dealerId: table.dealerId,
    isDealer,
    isOwner: table.ownerId === userId,
    canManage: canManage(table, userId),
    serverNow: Date.now(),
    nextHandAt: table.nextHandAt || null,
    me: userId,
    status: table.status,
    settings: { ...table.settings, mode: modeOf(table) },
    chips: table.settings.chips?.length
      ? table.settings.chips
      : chipDenominations(table.settings.minBet, table.settings.maxBet, table.settings.startingChips),
    handNo: table.handNo,
    seats: table.seats.map((s) => ({ ...s, online: isOnline(table.code, s.userId) })),
    hand: hand
      ? {
          no: hand.no,
          mode: hand.mode || 'live',
          stage: hand.stage,
          awaiting: hand.awaiting,
          board: hand.board,
          buttonId: hand.buttonId,
          sbId: hand.sbId,
          bbId: hand.bbId,
          currentBet: hand.currentBet,
          minRaise: hand.minRaise,
          toAct: hand.toAct,
          turnDeadline: hand.turnDeadline || null,
          seeDeadline: hand.seeDeadline || null,
          pots: hand.pots,
          result: hand.result,
          handNames: reveal ? hand.handNames || {} : {},
          potTotal: hand.players.reduce((s, p) => s + p.total - p.bet, 0),
          log: hand.log.slice(-30),
          // blackjack: todo boca arriba menos la carta tapada de la banca
          ...bjv,
          // la viuda: el centro solo se ve cuando está boca arriba
          ...(hand.mode === 'viuda'
            ? { widow: hand.widowOpen || reveal ? hand.widow : [], widowOpen: !!hand.widowOpen, knockBy: hand.knockBy, lastTurns: hand.lastTurns, widowDeals: hand.widowDeals || 0 }
            : {}),
          players: bjv ? bjv.players : hand.players.map((p) => ({
            userId: p.userId,
            stack: p.stack,
            bet: p.bet,
            total: p.total,
            folded: p.folded,
            allIn: p.allIn,
            last: p.last,
            won: p.won || 0,
            hasCards: p.cards.length === 2,
            // se ven: las tuyas, las de quien llega al showdown y las que alguien decide enseñar
            // en la viuda tus cartas llegan tapadas: no se envían hasta que decides verlas
            cards:
              (p.userId === userId && (hand.mode !== 'viuda' || p.seen)) || (reveal && !p.folded) || hand.shown?.includes(p.userId) ? p.cards : [],
            seen: !!p.seen,
            took: !!p.took,
            turns: p.turns || 0,
            shown: !!hand.shown?.includes(p.userId),
            // en vivo: petición para corregir cartas ya registradas ('pending') o permiso concedido ('ok')
            cardsChange: p.changeReq ? 'pending' : p.cardsUnlock ? 'ok' : null,
          })),
        }
      : null,
    legal: legalActions(table, userId),
    bj: bj.options(table, userId),
    inHand: !!(hand && getPlayer(hand, userId) && isHandLive(table)),
  };
}

export { GameError };
