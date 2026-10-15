import { Router } from 'express';
import mongoose from 'mongoose';
import { Friendship, User } from '../models.js';
import { ah, HttpError, requireAuth } from '../auth.js';
import { notifyUser, isUserOnline } from '../hub.js';
import { getTable, activeTableOf } from '../game/manager.js';

const r = Router();
r.use(requireAuth);

const pub = (u) => ({
  id: u._id.toString(),
  username: u.username,
  displayName: u.displayName || u.username,
  avatarUrl: u.avatarUrl,
  avatarColor: u.avatarColor,
  online: isUserOnline(u._id),
  playing: activeTableOf(u._id.toString()),
});

function between(a, b) {
  return { $or: [{ requester: a, recipient: b }, { requester: b, recipient: a }] };
}

r.get('/', ah(async (req, res) => {
  const me = req.user._id;
  const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] })
    .populate('requester recipient', 'username displayName avatarUrl avatarColor')
    .sort({ updatedAt: -1 })
    .lean();
  const friends = [], incoming = [], outgoing = [];
  for (const f of rows) {
    if (!f.requester || !f.recipient) continue;
    const mine = f.requester._id.equals(me);
    const other = mine ? f.recipient : f.requester;
    const item = { requestId: f._id.toString(), since: f.updatedAt, user: pub(other) };
    if (f.status === 'accepted') friends.push(item);
    else (mine ? outgoing : incoming).push(item);
  }
  // primero los que están jugando, luego los conectados
  friends.sort((a, b) => Number(!!b.user.playing) - Number(!!a.user.playing) || Number(b.user.online) - Number(a.user.online) || a.user.displayName.localeCompare(b.user.displayName));
  res.json({ friends, incoming, outgoing });
}));

r.post('/request', ah(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().replace(/^@/, '');
  const other = await User.findOne({ username });
  if (!other) throw new HttpError(404, 'No existe ese usuario');
  if (other._id.equals(req.user._id)) throw new HttpError(400, 'No puedes agregarte a ti mismo');
  const existing = await Friendship.findOne(between(req.user._id, other._id));
  if (existing) {
    if (existing.status === 'accepted') throw new HttpError(400, 'Ya sois amigos');
    // si él ya me la había enviado, aceptarla directamente
    if (existing.recipient.equals(req.user._id)) {
      existing.status = 'accepted';
      await existing.save();
      notifyUser(other._id.toString(), 'friend:accepted', { by: req.user.displayName });
      return res.json({ status: 'accepted' });
    }
    throw new HttpError(400, 'Ya le enviaste una solicitud');
  }
  await Friendship.create({ requester: req.user._id, recipient: other._id });
  notifyUser(other._id.toString(), 'friend:request', { from: req.user.displayName, username: req.user.username });
  res.status(201).json({ status: 'pending' });
}));

r.post('/:requestId/accept', ah(async (req, res) => {
  const f = await Friendship.findById(req.params.requestId).catch(() => null);
  if (!f || !f.recipient.equals(req.user._id) || f.status !== 'pending') throw new HttpError(404, 'Solicitud no encontrada');
  f.status = 'accepted';
  await f.save();
  notifyUser(f.requester.toString(), 'friend:accepted', { by: req.user.displayName });
  res.json({ ok: true });
}));

// Rechazar, cancelar o eliminar amistad
r.delete('/:requestId', ah(async (req, res) => {
  const f = await Friendship.findById(req.params.requestId).catch(() => null);
  if (!f || !(f.requester.equals(req.user._id) || f.recipient.equals(req.user._id))) throw new HttpError(404, 'No encontrada');
  await f.deleteOne();
  res.json({ ok: true });
}));

// Invitar amigos a una mesa: les llega un aviso con botón para entrar
r.post('/invite', ah(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase();
  const t = await getTable(code);
  if (!t || t.status === 'closed') throw new HttpError(404, 'Mesa no disponible');
  const ids = (Array.isArray(req.body.userIds) ? req.body.userIds : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 20);
  const accepted = await Friendship.find({
    status: 'accepted',
    $or: [
      { requester: req.user._id, recipient: { $in: ids } },
      { recipient: req.user._id, requester: { $in: ids } },
    ],
  }).lean();
  const allowed = new Set(accepted.map((f) => (f.requester.equals(req.user._id) ? f.recipient : f.requester).toString()));
  for (const id of allowed) notifyUser(id, 'table:invite', { code, name: t.name, by: req.user.displayName });
  res.json({ sent: allowed.size });
}));

export default r;
