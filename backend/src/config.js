import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pokerapp',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  uploadsDir: path.resolve(__dirname, '../uploads'),
  clientDist: path.resolve(__dirname, '../../frontend/dist'),
};

if (config.isProd && config.jwtSecret === 'dev-secret-change-me') {
  console.warn('[aviso] JWT_SECRET no está definido: configúralo en server/.env');
}
