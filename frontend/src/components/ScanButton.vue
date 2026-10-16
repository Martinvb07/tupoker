<script setup>
// Botón "Escanear con la cámara": abre la cámara del móvil, lee las cartas y emite las encontradas.
import { onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { toast } from '@/lib/store.js';
import { scanEnabled, checkScan, scanCards } from '@/lib/vision.js';

const props = defineProps({
  expected: { type: Number, required: true },
  exclude: { type: Array, default: () => [] },
  label: { type: String, default: 'Escanear con la cámara' },
  big: Boolean,
});
const emit = defineEmits(['cards']);
const input = ref(null);
const busy = ref(false);
onMounted(checkScan);

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  busy.value = true;
  try {
    const cards = await scanCards(file, { expected: props.expected, exclude: props.exclude });
    if (!cards.length) return toast.error('No vi ninguna carta. Acércate un poco y que haya buena luz.');
    if (cards.some((c) => !c.confident)) toast('Revisa las cartas: alguna no se veía del todo clara', 'info', 4500);
    else if (cards.length < props.expected) toast(`Solo vi ${cards.length} de ${props.expected}: completa las que faltan`, 'info', 4500);
    emit('cards', cards.map((c) => c.code).slice(0, props.expected));
  } catch (err) {
    toast.error(err.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="scanEnabled">
    <input ref="input" type="file" accept="image/*" capture="environment" hidden @change="onFile" />
    <button type="button" class="btn scan-btn" :class="{ 'btn-primary btn-lg': big }" :disabled="busy" @click="input.click()">
      <span v-if="busy" class="spinner"></span>
      <Icon v-else name="camera" :size="18" />
      {{ busy ? 'Leyendo cartas…' : label }}
    </button>
  </template>
</template>

<style scoped>
.scan-btn { width: 100%; }
</style>
