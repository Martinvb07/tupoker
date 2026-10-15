import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models.js';

export const COOKIE = 'pk_token';

export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, config.jwtSecret, { expiresIn: '30d' });
}

export function setAuthCookie(res, userId) {
  res.cookie(COOKIE, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

export async function userFromToken(token) {
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    return await User.findById(sub);
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await userFromToken(req.cookies?.[COOKIE]);
  if (!user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  req.user = user;
  req.userId = user._id.toString();
  next();
}

/** Envuelve handlers async para que los errores lleguen al middleware de errores. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
