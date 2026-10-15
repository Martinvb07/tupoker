import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User } from '../models.js';
import { ah, HttpError, requireAuth, setAuthCookie, COOKIE } from '../auth.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

r.post('/register', limiter, ah(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const displayName = String(req.body.displayName || '').trim().slice(0, 30);
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Usuario: 3-20 caracteres (letras, números, _ o .)');
  if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  if (await User.exists({ username })) throw new HttpError(409, 'Ese usuario ya existe');
  const user = await User.create({
    username,
    passwordHash: await bcrypt.hash(password, 10),
    displayName: displayName || username,
    avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
  });
  setAuthCookie(res, user._id);
  res.status(201).json({ user: user.toPublic() });
}));

r.post('/login', limiter, ah(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  setAuthCookie(res, user._id);
  res.json({ user: user.toPublic() });
}));

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

export default r;
