/* Proceso de producción en el VPS — lo consume el deploy de GitHub Actions
   con `pm2 startOrReload ecosystem.config.cjs`.

   El frontend es estático (frontend/dist) y lo sirve nginx; solo la API corre en pm2.
   IMPORTANTE: una sola instancia en modo fork — el estado de las mesas vive en memoria
   y socket.io no está configurado para cluster.

   Los secretos NO van aquí: el backend lee backend/.env (dotenv). */
module.exports = {
  apps: [
    {
      name: 'tupoker-api',
      cwd: './backend',
      script: 'src/index.js',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production', PORT: 4000 },
      max_memory_restart: '400M',
      kill_timeout: 5000,
      time: true,
    },
  ],
};
