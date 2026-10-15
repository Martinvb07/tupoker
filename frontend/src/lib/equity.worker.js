// Calcula probabilidades fuera del hilo principal para no cortar las animaciones.
import { equity } from '@shared/poker.js';

self.onmessage = (e) => {
  const { id, hole, board, opponents } = e.data;
  const iterations = opponents > 4 ? 3000 : 5000;
  const result = equity({ hole, board, opponents, iterations });
  self.postMessage({ id, result });
};
