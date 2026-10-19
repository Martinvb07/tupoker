// Sonidos y vibración de la mesa, generados con Web Audio (sin archivos).
// Se pueden silenciar; la preferencia se guarda en este navegador.
import { ref, watch } from 'vue';

const KEY = 'tp-sound';
const read = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
export const soundOn = ref(read());
watch(soundOn, (on) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: solo dura esta visita */
  }
});

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iOS solo deja sonar después de un toque: se desbloquea con el primero
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18, to = freq } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// carta que se desliza: un golpe corto de ruido filtrado
function flick(start, gain = 0.25) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.floor(a.sampleRate * 0.05);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400;
  f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const SOUNDS = {
  card: () => flick(0, 0.18),
  deal: () => [0, 0.07, 0.14, 0.21, 0.28].forEach((s) => flick(s)),
  turn: () => {
    tone(660, 0, 0.16, { type: 'triangle' });
    tone(880, 0.13, 0.22, { type: 'triangle' });
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, i === 3 ? 0.5 : 0.16, { type: 'triangle', gain: 0.16 })),
  knock: () => {
    tone(170, 0, 0.12, { gain: 0.45, to: 90 });
    tone(170, 0.16, 0.12, { gain: 0.45, to: 90 });
  },
};
const VIBES = { deal: 15, turn: [30, 40, 30], win: [40, 60, 40, 60, 80], knock: [60, 50, 60] };

/** Suena (y vibra en los móviles que lo permiten) salvo que el jugador lo haya silenciado. */
export function play(name) {
  if (!soundOn.value) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* sin audio en este navegador */
  }
  if (VIBES[name]) vibrate(VIBES[name]);
}

export function vibrate(pattern) {
  if (soundOn.value && navigator.vibrate) navigator.vibrate(pattern);
}
