<script setup>
// Selector de cartas: elige palo y luego rango. Pensado para tocar rápido con una mano.
import { computed, ref, watch } from 'vue';
import { RANKS, SUITS, SUIT_SYMBOL, SUIT_NAME } from '@shared/poker.js';
import Sheet from './Sheet.vue';
import { vibrate } from '@/lib/sfx.js';
import PlayingCard from './PlayingCard.vue';
import ScanButton from './ScanButton.vue';

const props = defineProps({
  open: Boolean,
  count: { type: Number, default: 1 },
  title: { type: String, default: 'Elige las cartas' },
  disabled: { type: Array, default: () => [] },
  initial: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: 'Confirmar' },
  loading: Boolean,
  scan: Boolean, // la mesa tiene activado el escaneo con cámara
});
const emit = defineEmits(['confirm', 'close']);

const picked = ref([]);
const suit = ref('s');
watch(
  () => props.open,
  (o) => {
    if (o) {
      picked.value = [...props.initial].slice(0, props.count);
      suit.value = 's';
    }
  },
);

const blocked = computed(() => new Set(props.disabled));
const ranksDesc = [...RANKS].reverse();
const SUIT_COLOR = { s: '#e5e7eb', h: '#fb7185', d: '#fb7185', c: '#e5e7eb' };
const INK = { s: '#111827', h: '#e11d48', d: '#e11d48', c: '#111827' };

function toggle(rank) {
  const c = rank + suit.value;
  if (blocked.value.has(c)) return;
  const i = picked.value.indexOf(c);
  if (i >= 0) picked.value.splice(i, 1);
  else if (picked.value.length < props.count) picked.value.push(c);
  else picked.value.splice(picked.value.length - 1, 1, c);
  vibrate(8);
}
const remove = (i) => picked.value.splice(i, 1);
const full = computed(() => picked.value.length === props.count);
</script>

<template>
  <Sheet :open="open" :title="title" :width="560" @close="emit('close')">
    <div class="slots">
      <button v-for="i in count" :key="i" class="slot" @click="picked[i - 1] && remove(i - 1)">
        <PlayingCard :card="picked[i - 1] || ''" placeholder size="lg">{{ i }}</PlayingCard>
      </button>
    </div>

    <div v-if="scan" class="scan"><ScanButton :expected="count" :exclude="disabled" @cards="(c) => (picked = c.filter((x) => !blocked.has(x)))" /></div>

    <div class="suits">
      <button
        v-for="s in SUITS"
        :key="s"
        class="suit"
        :class="{ on: suit === s }"
        :style="{ '--sc': SUIT_COLOR[s] }"
        @click="suit = s"
      >
        <span class="sym">{{ SUIT_SYMBOL[s] }}</span>
        <span class="nm">{{ SUIT_NAME[s] }}</span>
      </button>
    </div>

    <TransitionGroup tag="div" name="list" class="ranks" :key="suit">
      <button
        v-for="(r, i) in ranksDesc"
        :key="r + suit"
        class="rank"
        :class="{ on: picked.includes(r + suit), off: blocked.has(r + suit) }"
        :style="{ '--sc': INK[suit], animationDelay: i * 18 + 'ms' }"
        :disabled="blocked.has(r + suit)"
        @click="toggle(r)"
      >
        <b>{{ r === 'T' ? '10' : r }}</b>
        <i>{{ SUIT_SYMBOL[suit] }}</i>
      </button>
    </TransitionGroup>

    <template #footer>
      <button class="btn btn-ghost" @click="picked = []">Limpiar</button>
      <button class="btn btn-primary grow" :disabled="!full || loading" @click="emit('confirm', [...picked])">
        <span v-if="loading" class="spinner"></span>
        <template v-else>{{ confirmLabel }} ({{ picked.length }}/{{ count }})</template>
      </button>
    </template>
  </Sheet>
</template>

<style scoped>
.scan { margin-bottom: 14px; }
.scan:empty { display: none; }
.slots { display: flex; justify-content: center; gap: 10px; margin-bottom: 18px; min-height: 104px; }
.slot { padding: 0; }
.suits { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.suit {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 4px; border-radius: 14px; background: rgba(5, 9, 28, 0.5); border: 1px solid var(--line);
  transition: transform 0.2s var(--ease), border-color 0.2s, background 0.2s;
}
.suit .sym { font-size: 26px; line-height: 1; color: var(--sc); }
.suit .nm { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
.suit.on { border-color: var(--gold); background: rgba(245, 181, 68, 0.1); transform: translateY(-2px); }
.suit.on .nm { color: var(--gold-2); }
.ranks { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
@media (min-width: 480px) { .ranks { grid-template-columns: repeat(7, 1fr); } }
.rank {
  aspect-ratio: 5 / 6;
  border-radius: 12px;
  background: linear-gradient(160deg, #fff, #e8ebf3);
  color: #111827;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.6);
  transition: transform 0.25s var(--spring), box-shadow 0.25s, opacity 0.2s;
  animation: rise 0.35s var(--ease) both;
}
.rank b { font-size: 20px; font-weight: 800; line-height: 1; }
.rank i { font-style: normal; font-size: 16px; color: var(--sc); }
.rank:hover { transform: translateY(-2px); }
.rank:active { transform: scale(0.94); }
.rank.on { box-shadow: 0 0 0 3px var(--gold), 0 8px 20px -6px rgba(245, 181, 68, 0.6); transform: translateY(-3px); }
.rank.off { opacity: 0.18; pointer-events: none; }
</style>
