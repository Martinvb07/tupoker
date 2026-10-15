import { Router } from 'express';
import { Group, Hand, Table, User } from '../models.js';
import { ah, HttpError, requireAuth } from '../auth.js';
import { randomCode, getTable } from '../game/manager.js';
import { cleanSettings, createTable, seatFor, closeTableNow } from './tables.js';
import { commit } from '../game/autopilot.js';
import { userRanking, userStats } from '../stats.js';
import { notifyUser } from '../hub.js';

const r = Router();
r.use(requireAuth);

async function uniqueInvite() {
  for (;;) {
    const c = randomCode(8);
    if (!(await Group.exists({ inviteCode: c }))) return c;
  }
}

async function loadGroup(req, { admin = false } = {}) {
  const g = await Group.findById(req.params.id).catch(() => null);
  if (!g) throw new HttpError(404, 'Grupo no encontrado');
  const m = g.members.find((x) => x.userId.toString() === req.userId);
  if (!m) throw new HttpError(403, 'No eres miembro de este grupo');
  if (admin && m.role !== 'admin') throw new HttpError(403, 'Solo los administradores pueden hacer esto');
  return { g, me: m };
}

async function serialize(g, userId) {
  await g.populate('members.userId', 'username displayName avatarUrl avatarColor');
  let activeTable = null;
  if (g.activeTableCode) {
    const t = await getTable(g.activeTableCode);
    if (t && t.status !== 'closed') activeTable = { code: t.code, name: t.name, players: t.seats.length, handNo: t.handNo, status: t.status };
  }
  const me = g.members.find((m) => m.userId?._id.toString() === userId);
  return {
    id: g._id.toString(),
    name: g.name,
    description: g.description,
    emoji: g.emoji,
    color: g.color,
    inviteCode: g.inviteCode,
    defaults: g.defaults,
    defaultDealerId: g.defaultDealerId?.toString() || null,
    ownerId: g.ownerId.toString(),
    myRole: me?.role,
    activeTable,
    members: g.members
      .filter((m) => m.userId)
      .map((m) => ({
        id: m.userId._id.toString(),
        username: m.userId.username,
        displayName: m.userId.displayName || m.userId.username,
        avatarUrl: m.userId.avatarUrl,
        avatarColor: m.userId.avatarColor,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
  };
}

r.get('/', ah(async (req, res) => {
  const groups = await Group.find({ 'members.userId': req.user._id }).sort({ updatedAt: -1 }).lean();
  res.json({
    groups: groups.map((g) => ({
      id: g._id.toString(),
      name: g.name,
      description: g.description,
      emoji: g.emoji,
      color: g.color,
      members: g.members.length,
      activeTableCode: g.activeTableCode,
      defaults: g.defaults,
    })),
  });
}));

r.post('/', ah(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (name.length < 2) throw new HttpError(400, 'Ponle un nombre al grupo');
  const g = await Group.create({
    name,
    description: String(req.body.description || '').slice(0, 200),
    emoji: String(req.body.emoji || '♠️').slice(0, 8),
    color: /^#[0-9a-f]{6}$/i.test(req.body.color) ? req.body.color : '#10b981',
    ownerId: req.user._id,
    members: [{ userId: req.user._id, role: 'admin' }],
    inviteCode: await uniqueInvite(),
    defaults: cleanSettings(req.body.defaults || {}),
    defaultDealerId: req.user._id,
  });
  res.status(201).json({ group: await serialize(g, req.userId) });
}));

r.post('/join', ah(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const g = await Group.findOne({ inviteCode: code });
  if (!g) throw new HttpError(404, 'Código de grupo no válido');
  if (!g.members.some((m) => m.userId.toString() === req.userId)) {
    g.members.push({ userId: req.user._id, role: 'member' });
    await g.save();
  }
  res.json({ id: g._id.toString() });
}));

r.get('/:id', ah(async (req, res) => {
  const { g } = await loadGroup(req);
  res.json({ group: await serialize(g, req.userId) });
}));

r.patch('/:id', ah(async (req, res) => {
  const { g } = await loadGroup(req, { admin: true });
  const b = req.body;
  if (b.name !== undefined) {
    const n = String(b.name).trim().slice(0, 40);
    if (n.length < 2) throw new HttpError(400, 'Nombre demasiado corto');
    g.name = n;
  }
  if (b.description !== undefined) g.description = String(b.description).slice(0, 200);
  if (b.emoji) g.emoji = String(b.emoji).slice(0, 8);
  if (/^#[0-9a-f]{6}$/i.test(b.color || '')) g.color = b.color;
  if (b.defaults) g.defaults = cleanSettings(b.defaults, g.defaults);
  if (b.defaultDealerId !== undefined) {
    if (b.defaultDealerId && !g.members.some((m) => m.userId.toString() === b.defaultDealerId)) throw new HttpError(400, 'El dealer debe ser miembro del grupo');
    g.defaultDealerId = b.defaultDealerId || null;
  }
  await g.save();
  res.json({ group: await serialize(g, req.userId) });
}));

r.post('/:id/regenerate-code', ah(async (req, res) => {
  const { g } = await loadGroup(req, { admin: true });
  g.inviteCode = await uniqueInvite();
  await g.save();
  res.json({ group: await serialize(g, req.userId) });
}));

r.post('/:id/members', ah(async (req, res) => {
  const { g } = await loadGroup(req, { admin: true });
  const u = await User.findOne({ username: String(req.body.username || '').toLowerCase() });
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  if (!g.members.some((m) => m.userId.equals(u._id))) g.members.push({ userId: u._id, role: 'member' });
  await g.save();
  res.json({ group: await serialize(g, req.userId) });
}));

r.patch('/:id/members/:userId', ah(async (req, res) => {
  const { g } = await loadGroup(req, { admin: true });
  const m = g.members.find((x) => x.userId.toString() === req.params.userId);
  if (!m) throw new HttpError(404, 'No es miembro');
  if (g.ownerId.toString() === req.params.userId) throw new HttpError(400, 'No puedes cambiar el rol del creador');
  m.role = req.body.role === 'admin' ? 'admin' : 'member';
  await g.save();
  res.json({ group: await serialize(g, req.userId) });
}));

r.delete('/:id/members/:userId', ah(async (req, res) => {
  const self = req.params.userId === req.userId;
  const { g } = await loadGroup(req, { admin: !self });
  if (g.ownerId.toString() === req.params.userId) throw new HttpError(400, 'El creador no puede salir del grupo (puedes eliminarlo)');
  g.members = g.members.filter((x) => x.userId.toString() !== req.params.userId);
  await g.save();
  res.json({ ok: true });
}));

r.delete('/:id', ah(async (req, res) => {
  const { g } = await loadGroup(req, { admin: true });
  if (g.ownerId.toString() !== req.userId) throw new HttpError(403, 'Solo el creador puede eliminar el grupo');
  // cierra la mesa del grupo si estaba abierta
  if (g.activeTableCode) {
    const t = await getTable(g.activeTableCode);
    if (t && t.status !== 'closed') {
      await closeTableNow(t);
      commit(t);
    }
  }
  await g.deleteOne();
  res.json({ ok: true });
}));

// Abre (o reutiliza) la mesa del grupo con su configuración guardada: no hay que volver a crearla.
r.post('/:id/open-table', ah(async (req, res) => {
  const { g } = await loadGroup(req);
  if (g.activeTableCode) {
    const t = await getTable(g.activeTableCode);
    if (t && t.status !== 'closed') return res.json({ code: t.code });
  }
  const settings = cleanSettings(req.body.settings || {}, g.defaults);
  const dealerId = g.defaultDealerId && g.members.some((m) => m.userId.equals(g.defaultDealerId)) ? g.defaultDealerId.toString() : req.userId;
  const t = await createTable({ owner: req.user, name: g.name, settings, groupId: g._id, dealerId, dealerPlays: req.body.dealerPlays !== false });
  if (dealerId !== req.userId) {
    const dealer = await User.findById(dealerId);
    if (dealer) t.seats.push(seatFor(dealer, settings.startingChips));
    await Table.updateOne({ _id: t._id }, { $set: { seats: t.seats } });
  }
  g.activeTableCode = t.code;
  await g.save();
  for (const m of g.members) {
    if (m.userId.toString() !== req.userId) notifyUser(m.userId.toString(), 'group:table-opened', { group: g.name, code: t.code, by: req.user.displayName });
  }
  res.json({ code: t.code });
}));

r.get('/:id/ranking', ah(async (req, res) => {
  const { g } = await loadGroup(req);
  res.json({ ranking: await userRanking({ groupId: g._id, sort: req.query.sort }) });
}));

r.get('/:id/me', ah(async (req, res) => {
  const { g } = await loadGroup(req);
  res.json({ stats: await userStats(req.userId, g._id) });
}));

r.get('/:id/history', ah(async (req, res) => {
  const { g } = await loadGroup(req);
  const hands = await Hand.find({ groupId: g._id })
    .sort({ createdAt: -1 })
    .limit(30)
    .populate('winners', 'username displayName avatarUrl avatarColor')
    .lean();
  res.json({
    hands: hands.map((h) => ({
      id: h._id,
      no: h.no,
      board: h.board,
      potTotal: h.potTotal,
      createdAt: h.createdAt,
      players: h.players.length,
      winners: h.winners.map((w) => ({ displayName: w.displayName || w.username, avatarUrl: w.avatarUrl, avatarColor: w.avatarColor })),
      winningHand: h.players.find((p) => p.won > 0 && p.handName)?.handName || '',
    })),
  });
}));

export default r;
