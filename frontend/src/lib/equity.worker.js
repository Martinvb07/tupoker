// Calcula probabilidades fuera del hilo principal para no cortar las animaciones.
import { equity, equityVs } from '@shared/poker.js';

self.onmessage = (e) => {
  const { id, hole, board, opponents, hands } = e.data;
  // manos conocidas (all-in / showdown): % de cada una
  if (hands) {
    self.postMessage({ id, result: equityVs(hands, board, 5000) });
    return;
  }
  const iterations = opponents > 4 ? 3000 : 5000;
  const result = equity({ hole, board, opponents, iterations });
  self.postMessage({ id, result });
};
