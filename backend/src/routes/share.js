// Vistas previas personalizadas para los enlaces de invitación (WhatsApp, Telegram, redes...).
// Esas apps no ejecutan JavaScript: leen las etiquetas <meta> del HTML. Aquí servimos el mismo
// index.html de la app pero con título y descripción de la mesa o del grupo.
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { Group, User } from '../models.js';
import { getTable } from '../game/manager.js';
import { formatChips } from '../../shared/poker.js';

const r = Router();
const indexFile = path.join(config.clientDist, 'index.html');
let cache = { mtime: 0, html: '' };

function template() {
  const stat = fs.statSync(indexFile);
  if (stat.mtimeMs !== cache.mtime) cache = { mtime: stat.mtimeMs, html: fs.readFileSync(indexFile, 'utf8') };
  return cache.html;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render({ title, description, url }) {
  const t = esc(title), d = esc(description), u = esc(url);
  return template()
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${d}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${d}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${u}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${d}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${u}"`)
    // las invitaciones no deben indexarse
    .replace(/(<meta name="robots" content=")[^"]*"/, '$1noindex, nofollow"');
}

const MODE = { live: 'en vivo', random: 'aleatorio', viuda: 'viuda', offline: 'viuda' };

r.get('/unirse/:code', async (req, res, next) => {
  if (!fs.existsSync(indexFile)) return next();
  try {
    const code = String(req.params.code).toUpperCase().slice(0, 10);
    const t = await getTable(code);
    if (!t || t.status === 'closed') return next();
    const owner = await User.findById(t.ownerId).select('displayName username').lean();
    const who = owner?.displayName || owner?.username || 'Un amigo';
    const s = t.settings;
    const stakes =
      s.mode === 'viuda' || s.mode === 'offline'
        ? 'La viuda, sin fichas'
        : `Ciegas ${formatChips(Math.max(1, Math.floor(s.minBet / 2)))}/${formatChips(s.minBet)} · ${formatChips(s.startingChips)} fichas`;
    res.set('Cache-Control', 'no-cache').type('html').send(
      render({
        title: `🃏 ${who} te invita a "${t.name}" · TuPoker`,
        description: `${stakes} · modo ${MODE[s.mode] || 'en vivo'} · ${t.seats.length} jugador${t.seats.length === 1 ? '' : 'es'} en la mesa. Entra con el código ${t.code}.`,
        url: `${config.publicUrl}/unirse/${t.code}`,
      }),
    );
  } catch (e) {
    next(e);
  }
});

r.get('/grupos/unirse/:code', async (req, res, next) => {
  if (!fs.existsSync(indexFile)) return next();
  try {
    const code = String(req.params.code).toUpperCase().slice(0, 12);
    const g = await Group.findOne({ inviteCode: code }).select('name description members').lean();
    if (!g) return next();
    res.set('Cache-Control', 'no-cache').type('html').send(
      render({
        title: `Únete al grupo "${g.name}" · TuPoker`,
        description: g.description || `${g.members.length} jugadores ya están en este grupo de póker. Mesa guardada, ranking propio y partidas con amigos.`,
        url: `${config.publicUrl}/grupos/unirse/${code}`,
      }),
    );
  } catch (e) {
    next(e);
  }
});

export default r;

