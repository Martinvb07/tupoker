// Escaneo de cartas con la cámara: reduce la foto y la manda al servidor (Claude, visión).
import { ref } from 'vue';
import { api } from './api.js';

export const scanEnabled = ref(false);
let checked = false;
export async function checkScan() {
  if (checked) return scanEnabled.value;
  checked = true;
  try {
    scanEnabled.value = (await api.get('/vision/status')).enabled;
  } catch {
    scanEnabled.value = false;
  }
  return scanEnabled.value;
}

/** Reduce la imagen a 1600px como máximo y la pasa a JPEG (fotos de móvil pesan mucho). */
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

/** Devuelve [{ code, confident }] con las cartas vistas en la foto. */
export async function scanCards(file, { expected, exclude = [] }) {
  const fd = new FormData();
  fd.append('photo', await shrink(file), 'cartas.jpg');
  fd.append('expected', String(expected));
  fd.append('exclude', exclude.join(','));
  return (await api.post('/vision/cards', fd)).cards;
}
