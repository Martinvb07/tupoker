import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { User } from '../models.js';
import { ah, HttpError, requireAuth } from '../auth.js';
import { config } from '../config.js';
import { userStats } from '../stats.js';

const r = Router();
r.use(requireAuth);

const avatarDir = path.join(config.uploadsDir, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => {
      const ext = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg' }[file.mimetype];
      cb(null, `${req.userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/webp', 'image/png', 'image/jpeg'].includes(file.mimetype);
    cb(ok ? null : new HttpError(400, 'Formato de imagen no soportado'), ok);
  },
});

const FELTS = ['emerald', 'royal', 'crimson', 'violet', 'midnight'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

r.patch('/me', ah(async (req, res) => {
  const { displayName, bio, avatarColor, prefs } = req.body;
  const u = req.user;
  if (displayName !== undefined) {
    const d = String(displayName).trim().slice(0, 30);
    if (d.length < 2) throw new HttpError(400, 'El nombre debe tener al menos 2 caracteres');
    u.displayName = d;
  }
  if (bio !== undefined) u.bio = String(bio).slice(0, 160);
  if (avatarColor !== undefined && HEX_RE.test(avatarColor)) u.avatarColor = avatarColor;
  if (prefs) {
    if (FELTS.includes(prefs.felt)) u.prefs.felt = prefs.felt;
    if (typeof prefs.fourColor === 'boolean') u.prefs.fourColor = prefs.fourColor;
  }
  await u.save();
  res.json({ user: u.toPublic() });
}));

function removeOldAvatar(url) {
  if (!url?.startsWith('/uploads/avatars/')) return;
  fs.unlink(path.join(avatarDir, path.basename(url)), () => {});
}

r.post('/me/avatar', upload.single('avatar'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se recibió ninguna imagen');
  removeOldAvatar(req.user.avatarUrl);
  req.user.avatarUrl = `/uploads/avatars/${req.file.filename}`;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

r.delete('/me/avatar', ah(async (req, res) => {
  removeOldAvatar(req.user.avatarUrl);
  req.user.avatarUrl = '';
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}));

r.post('/me/password', ah(async (req, res) => {
  const { current, next } = req.body;
  if (!(await bcrypt.compare(String(current || ''), req.user.passwordHash))) throw new HttpError(400, 'La contraseña actual no es correcta');
  if (String(next || '').length < 6) throw new HttpError(400, 'La nueva contraseña debe tener al menos 6 caracteres');
  req.user.passwordHash = await bcrypt.hash(String(next), 10);
  await req.user.save();
  res.json({ ok: true });
}));

r.get('/search', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (q.length < 2) return res.json({ users: [] });
  const users = await User.find({ username: { $regex: '^' + q } }).limit(10);
  res.json({ users: users.map((u) => u.toPublic()) });
}));

r.get('/:username', ah(async (req, res) => {
  const u = await User.findOne({ username: String(req.params.username).toLowerCase() });
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ user: u.toPublic(), stats: await userStats(u._id) });
}));

export default r;
