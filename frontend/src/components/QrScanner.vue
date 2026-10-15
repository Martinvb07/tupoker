<script setup>
// Escáner de QR con la cámara trasera. Usa BarcodeDetector si el navegador lo trae
// (Chrome/Android) y jsQR como respaldo (Safari/iPhone).
import { onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import jsQR from 'jsqr';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { toast } from '@/lib/store.js';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['close']);
const router = useRouter();

const video = ref(null);
const error = ref('');
const starting = ref(false);
let stream = null;
let raf = 0;
let detector = null;
let lastScan = 0;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

/** Convierte lo leído en una ruta de la app (mesa, grupo o código suelto). */
function routeFor(text) {
  const t = String(text || '').trim();
  let m = t.match(/\/grupos\/unirse\/([A-Z0-9]{4,10})/i);
  if (m) return `/grupos/unirse/${m[1].toUpperCase()}`;
  m = t.match(/\/(?:unirse|mesa)\/([A-Z0-9]{4,10})/i);
  if (m) return `/unirse/${m[1].toUpperCase()}`;
  if (/^[A-Z0-9]{6}$/i.test(t)) return `/unirse/${t.toUpperCase()}`;
  return null;
}

async function start() {
  error.value = '';
  starting.value = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.value.srcObject = stream;
    await video.value.play();
    if ('BarcodeDetector' in window) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }
    loop();
  } catch (e) {
    error.value =
      e.message === 'insecure'
        ? 'La cámara solo funciona en https. Abre la web desde tupoker.online.'
        : e.name === 'NotAllowedError'
          ? 'No diste permiso a la cámara. Actívalo en los ajustes del navegador.'
          : 'No se pudo abrir la cámara.';
  } finally {
    starting.value = false;
  }
}

async function loop() {
  raf = requestAnimationFrame(loop);
  const v = video.value;
  if (!v || v.readyState < 2) return;
  const t = performance.now();
  if (t - lastScan < 160) return;
  lastScan = t;
  let text = null;
  try {
    if (detector) {
      const codes = await detector.detect(v);
      text = codes[0]?.rawValue || null;
    } else {
      const w = 480;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || w;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      text = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
    }
  } catch {
    return;
  }
  if (!text) return;
  const to = routeFor(text);
  if (!to) {
    toast.error('Ese QR no es de una mesa de TuPoker');
    lastScan = t + 1500;
    return;
  }
  navigator.vibrate?.(40);
  stop();
  emit('close');
  router.push(to);
}

function stop() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((tr) => tr.stop());
  stream = null;
}

watch(
  () => props.open,
  (o) => (o ? setTimeout(start, 350) : stop()),
);
onUnmounted(stop);
</script>

<template>
  <Sheet :open="open" title="Escanear QR" :width="440" @close="emit('close')">
    <div class="cam">
      <video ref="video" playsinline muted></video>
      <div class="frame"><i></i><i></i><i></i><i></i></div>
      <div class="laser"></div>
      <div v-if="starting" class="msg"><span class="spinner"></span></div>
      <div v-if="error" class="msg err">
        <Icon name="camera" :size="28" />
        <p>{{ error }}</p>
        <button class="btn btn-sm" @click="start">Reintentar</button>
      </div>
    </div>
    <p class="hint center">Apunta al QR de la mesa o del grupo. Entrarás automáticamente.</p>
  </Sheet>
</template>

<style scoped>
.cam { position: relative; aspect-ratio: 1; border-radius: 22px; overflow: hidden; background: #000; }
video { width: 100%; height: 100%; object-fit: cover; }
.frame { position: absolute; inset: 14%; }
.frame i { position: absolute; width: 34px; height: 34px; border: 4px solid var(--gold); }
.frame i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; border-radius: 12px 0 0 0; }
.frame i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; border-radius: 0 12px 0 0; }
.frame i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; border-radius: 0 0 0 12px; }
.frame i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; border-radius: 0 0 12px 0; }
.laser {
  position: absolute; left: 16%; right: 16%; height: 2px; top: 20%;
  background: linear-gradient(90deg, transparent, var(--gold-2), transparent); box-shadow: 0 0 12px var(--gold);
  animation: scan 2s ease-in-out infinite alternate;
}
@keyframes scan { to { top: 80%; } }
.msg { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 10px; padding: 24px; text-align: center; background: rgba(5, 8, 24, 0.75); }
.msg.err p { color: var(--text-2); font-weight: 600; }
.center { text-align: center; margin-top: 12px; }
</style>
