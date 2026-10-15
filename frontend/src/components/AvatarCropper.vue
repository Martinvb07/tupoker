<script setup>
// Recorte circular: arrastra para encuadrar, desliza para hacer zoom. Exporta WebP 320x320.
import { computed, ref, watch } from 'vue';
import Sheet from './Sheet.vue';

const props = defineProps({ file: { type: File, default: null }, loading: Boolean });
const emit = defineEmits(['close', 'done']);

const SIZE = 260;
const img = ref(null);
const url = ref('');
const zoom = ref(1);
const pos = ref({ x: 0, y: 0 });
let drag = null;

watch(
  () => props.file,
  (f) => {
    if (url.value) URL.revokeObjectURL(url.value);
    img.value = null;
    if (!f) return;
    url.value = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      img.value = im;
      zoom.value = 1;
      pos.value = { x: 0, y: 0 };
    };
    im.src = url.value;
  },
);

const base = computed(() => (img.value ? SIZE / Math.min(img.value.width, img.value.height) : 1));
const dims = computed(() => ({ w: (img.value?.width || 0) * base.value * zoom.value, h: (img.value?.height || 0) * base.value * zoom.value }));

function clamp(p) {
  const mx = Math.max(0, (dims.value.w - SIZE) / 2);
  const my = Math.max(0, (dims.value.h - SIZE) / 2);
  return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
}
watch(zoom, () => (pos.value = clamp(pos.value)));

function down(e) {
  drag = { sx: e.clientX, sy: e.clientY, ox: pos.value.x, oy: pos.value.y };
  e.target.setPointerCapture?.(e.pointerId);
}
function move(e) {
  if (!drag) return;
  pos.value = clamp({ x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy });
}
const up = () => (drag = null);
function wheel(e) {
  zoom.value = Math.max(1, Math.min(4, zoom.value - e.deltaY * 0.002));
}

function save() {
  const OUT = 320;
  const k = OUT / SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = OUT;
  const ctx = c.getContext('2d');
  const w = dims.value.w * k, h = dims.value.h * k;
  ctx.drawImage(img.value, OUT / 2 - w / 2 + pos.value.x * k, OUT / 2 - h / 2 + pos.value.y * k, w, h);
  c.toBlob((b) => emit('done', b), 'image/webp', 0.88);
}
</script>

<template>
  <Sheet :open="!!file" title="Ajusta tu foto" :width="420" @close="emit('close')">
    <div class="crop" :style="{ width: SIZE + 'px', height: SIZE + 'px' }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel.prevent="wheel">
      <img
        v-if="img"
        :src="url"
        alt=""
        draggable="false"
        :style="{ width: dims.w + 'px', height: dims.h + 'px', transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }"
      />
      <div class="mask"></div>
    </div>
    <label class="zoom">
      <span>−</span>
      <input v-model.number="zoom" type="range" min="1" max="4" step="0.01" />
      <span>+</span>
    </label>
    <template #footer>
      <button class="btn btn-ghost" @click="emit('close')">Cancelar</button>
      <button class="btn btn-primary grow" :disabled="!img || loading" @click="save">
        <span v-if="loading" class="spinner"></span><template v-else>Guardar foto</template>
      </button>
    </template>
  </Sheet>
</template>

<style scoped>
.crop { position: relative; margin: 6px auto 18px; overflow: hidden; border-radius: 24px; touch-action: none; cursor: grab; background: #000; }
.crop:active { cursor: grabbing; }
.crop img { position: absolute; left: 50%; top: 50%; max-width: none; user-select: none; pointer-events: none; }
.mask { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle, transparent 69.5%, rgba(5, 8, 24, 0.7) 70%); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.15); }
.zoom { display: flex; align-items: center; gap: 12px; font-weight: 800; color: var(--text-2); }
.zoom input { flex: 1; accent-color: var(--gold); }
</style>
