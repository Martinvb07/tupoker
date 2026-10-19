import { Router } from 'express';
import { Table, Group, User } from '../models.js';
import { ah, HttpError, requireAuth } from '../auth.js';
import { cacheTable, getTable, uniqueTableCode } from '../game/manager.js';
import { isHandLive, cancelHand } from '../game/engine.js';
import { commit } from '../game/autopilot.js';
import { dropChat } from '../game/chat.js';

/** Cierra una mesa (devuelve las fichas de la mano en curso) y libera la mesa del grupo. */
export async function closeTableNow(t) {
  if (isHandLive(t)) cancelHand(t);
  t.status = 'closed';
  t.closedAt = new Date();
  dropChat(t.code);
  if (t.groupId) await Group.updateOne({ _id: t.groupId, activeTableCode: t.code }, { $set: { activeTableCode: null } });
}

const r = Router();
r.use(requireAuth);

const MODES = ['live', 'random', 'offline'];

function cleanChips(list) {
  if (!Array.isArray(list)) return [];
  const vals = list.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 1e12);
  return [...new Set(vals)].sort((a, b) => a - b).slice(0, 10);
}

export function cleanSettings(input = {}, base = {}) {
  const num = (v, d) => (v === undefined || v === null || v === '' ? d : Math.floor(Number(v)));
  const s = {
    minBet: num(input.minBet, base.minBet ?? 100),
    maxBet: num(input.maxBet, base.maxBet ?? 0),
    startingChips: num(input.startingChips, base.startingChips ?? 10000),
    mode: MODES.includes(input.mode) ? input.mode : MODES.includes(base.mode) ? base.mode : 'live',
    chips: cleanChips(input.chips !== undefined ? input.chips : base.chips ? [...base.chips] : []),
    scan: input.scan !== undefined ? !!input.scan : !!base.scan,
  };
  if (!(s.minBet >= 1)) throw new HttpError(400, 'La apuesta mínima debe ser al menos 1');
  if (!(s.maxBet >= 0)) throw new HttpError(400, 'Apuesta máxima no válida');
  if (s.maxBet > 0 && s.maxBet < s.minBet) throw new HttpError(400, 'La máxima no puede ser menor que la mínima');
  if (!(s.startingChips >= s.minBet * 2)) throw new HttpError(400, 'Las fichas iniciales deben ser al menos 2 veces la mínima');
  if (s.startingChips > 1e12) throw new HttpError(400, 'Demasiadas fichas');
  return s;
}

export function seatFor(user, chips, status = 'active') {
  return {
    userId: user._id.toString(),
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    chips,
    buyIn: chips,
    status,
    joinedAt: Date.now(),
  };
}

export async function createTable({ owner, name, settings, groupId = null, dealerId = null, dealerPlays = true }) {
  const code = await uniqueTableCode();
  const dealer = dealerId || owner._id.toString();
  const ownerIsDealer = dealer === owner._id.toString();
  // en vivo el dealer no juega: su asiento queda fuera de las manos
  if (settings.mode === 'live') dealerPlays = false;
  const doc = await Table.create({
    code,
    name: name || 'Mesa de ' + (owner.displayName || owner.username),
    groupId,
    ownerId: owner._id,
    dealerId: dealer,
    settings,
    seats: [seatFor(owner, settings.startingChips, ownerIsDealer && !dealerPlays ? 'sitout' : 'active')],
  });
  return cacheTable(doc);
}

r.post('/', ah(async (req, res) => {
  const settings = cleanSettings(req.body);
  const table = await createTable({
    owner: req.user,
    name: String(req.body.name || '').trim().slice(0, 40),
    settings,
    dealerPlays: req.body.dealerPlays !== false,
  });
  res.status(201).json({ code: table.code });
}));

// Mesas abiertas donde estoy sentado o de mis grupos
r.get('/mine', ah(async (req, res) => {
  const groups = await Group.find({ 'members.userId': req.user._id }).select('_id');
  const tables = await Table.find({
    status: { $ne: 'closed' },
    $or: [{ 'seats.userId': req.userId }, { groupId: { $in: groups.map((g) => g._id) } }, { ownerId: req.user._id }],
  })
    .sort({ updatedAt: -1 })
    .limit(20)
    .populate('groupId', 'name emoji color')
    .lean();
  res.json({
    tables: tables.map((t) => ({
      code: t.code,
      name: t.name,
      status: t.status,
      group: t.groupId ? { id: t.groupId._id, name: t.groupId.name, emoji: t.groupId.emoji, color: t.groupId.color } : null,
      players: t.seats.length,
      seated: t.seats.some((s) => s.userId === req.userId),
      canClose: t.ownerId?.toString() === req.userId || t.dealerId?.toString() === req.userId,
      settings: t.settings,
      handNo: t.handNo,
      seats: t.seats.slice(0, 6).map((s) => ({ displayName: s.displayName, avatarUrl: s.avatarUrl, avatarColor: s.avatarColor })),
    })),
  });
}));

r.get('/:code', ah(async (req, res) => {
  const t = await getTable(req.params.code);
  if (!t) throw new HttpError(404, 'No existe ninguna mesa con ese código');
  const dealer = await User.findById(t.dealerId).select('username displayName avatarUrl avatarColor');
  res.json({
    table: {
      code: t.code,
      name: t.name,
      status: t.status,
      settings: t.settings,
      players: t.seats.length,
      seated: t.seats.some((s) => s.userId === req.userId),
      dealer: dealer && { displayName: dealer.displayName, avatarUrl: dealer.avatarUrl, avatarColor: dealer.avatarColor },
      seats: t.seats.map((s) => ({ displayName: s.displayName, avatarUrl: s.avatarUrl, avatarColor: s.avatarColor })),
    },
  });
}));

// El creador o el dealer cierran la mesa desde fuera (p. ej. desde la lista de mesas abiertas)
r.post('/:code/close', ah(async (req, res) => {
  const t = await getTable(req.params.code);
  if (!t) throw new HttpError(404, 'Mesa no encontrada');
  if (t.ownerId !== req.userId && t.dealerId !== req.userId) throw new HttpError(403, 'Solo el creador o el dealer pueden cerrar la mesa');
  if (t.status !== 'closed') {
    await closeTableNow(t);
    commit(t);
  }
  res.json({ ok: true });
}));

r.post('/:code/join', ah(async (req, res) => {
  const t = await getTable(req.params.code);
  if (!t) throw new HttpError(404, 'No existe ninguna mesa con ese código');
  if (t.status === 'closed') throw new HttpError(400, 'Esta mesa ya está cerrada');
  if (!t.seats.some((s) => s.userId === req.userId)) {
    if (t.seats.length >= 10) throw new HttpError(400, 'La mesa está llena (máx. 10 jugadores)');
    t.seats.push(seatFor(req.user, t.settings.startingChips));
    commit(t);
  }
  res.json({ code: t.code });
}));

export default r;
