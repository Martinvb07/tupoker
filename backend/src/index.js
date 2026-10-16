import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config.js';
import { ah, requireAuth, HttpError } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import groupRoutes from './routes/groups.js';
import tableRoutes from './routes/tables.js';
import friendRoutes from './routes/friends.js';
import visionRoutes from './routes/vision.js';
import { userRanking, groupRanking, userStats } from './stats.js';
import { initSocket } from './socket.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/vision', visionRoutes);

app.get('/api/rankings/users', requireAuth, ah(async (req, res) => {
  res.json({ ranking: await userRanking({ sort: req.query.sort }) });
}));
app.get('/api/rankings/groups', requireAuth, ah(async (req, res) => {
  res.json({ ranking: await groupRanking({ sort: req.query.sort }) });
}));
app.get('/api/stats/me', requireAuth, ah(async (req, res) => {
  res.json({ stats: await userStats(req.userId) });
}));
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// En producción nginx sirve el frontend; esto es un respaldo por si se accede directo al puerto.
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, { index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  // los HttpError llevan un mensaje pensado para el usuario; el resto de errores 5xx se ocultan
  const ours = err instanceof HttpError;
  if (status >= 500 && !ours) console.error(err);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen es demasiado grande' : ours || status < 500 ? err.message : 'Error del servidor';
  res.status(status).json({ error: msg });
});

const server = http.createServer(app);
initSocket(server);

await mongoose.connect(config.mongoUri);
console.log('MongoDB conectado');
server.listen(config.port, '127.0.0.1', () => console.log(`API escuchando en http://127.0.0.1:${config.port}`));
