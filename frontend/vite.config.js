import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const API = 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // motor de póker compartido con el backend
      '@shared': fileURLToPath(new URL('../backend/shared', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': API,
      '/uploads': API,
      '/socket.io': { target: API, ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 800 },
});
