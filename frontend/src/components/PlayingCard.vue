<script setup>
import { computed } from 'vue';
import { SUIT_SYMBOL } from '@shared/poker.js';
import { auth } from '@/lib/store.js';

const props = defineProps({
  card: { type: String, default: '' }, // vacío = reverso
  size: { type: String, default: 'md' }, // xs | sm | md | lg
  placeholder: { type: Boolean, default: false },
  highlight: { type: Boolean, default: false },
  dim: { type: Boolean, default: false },
  delay: { type: Number, default: 0 }, // segundos antes de destaparse (repartir una a una)
});

const rank = computed(() => (props.card ? (props.card[0] === 'T' ? '10' : props.card[0]) : ''));
const suit = computed(() => props.card?.[1]);
const color = computed(() => {
  const four = auth.user?.prefs?.fourColor;
  if (suit.value === 'h') return '#e11d48';
  if (suit.value === 'd') return four ? '#2563eb' : '#e11d48';
  if (suit.value === 'c') return four ? '#15803d' : '#111827';
  return '#111827';
});
</script>

<template>
  <div class="pcard" :class="[size, { back: !card && !placeholder, ph: placeholder && !card, hl: highlight, dim }]" :style="{ '--fd': delay + 's' }">
    <Transition name="flip" mode="out-in">
      <div v-if="card" :key="card" class="face" :style="{ color }">
        <div class="corner">
          <b>{{ rank }}</b>
          <i>{{ SUIT_SYMBOL[suit] }}</i>
        </div>
        <div class="pip">{{ SUIT_SYMBOL[suit] }}</div>
      </div>
      <div v-else-if="placeholder" key="ph" class="phc"><slot>+</slot></div>
      <div v-else key="back" class="backface"></div>
    </Transition>
  </div>
</template>

<style scoped>
.pcard {
  --w: 54px;
  width: var(--w);
  aspect-ratio: 5 / 7;
  border-radius: calc(var(--w) * 0.12);
  position: relative;
  flex: none;
  perspective: 600px;
  transition: transform 0.3s var(--ease), box-shadow 0.3s, opacity 0.3s;
}
.pcard.xs { --w: 26px; }
.pcard.sm { --w: 38px; }
.pcard.md { --w: 54px; }
.pcard.lg { --w: 74px; }
@media (min-width: 900px) {
  .pcard.md { --w: 62px; }
  .pcard.lg { --w: 86px; }
}
.face, .backface, .phc {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.face {
  background: linear-gradient(160deg, #ffffff, #eef0f6);
  box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  padding: calc(var(--w) * 0.08);
  overflow: hidden;
}
.corner { display: flex; flex-direction: column; align-items: center; width: max-content; line-height: 0.9; }
.corner b { font-weight: 800; font-size: calc(var(--w) * 0.36); letter-spacing: -0.04em; }
.corner i { font-style: normal; font-size: calc(var(--w) * 0.26); }
.pip {
  position: absolute;
  right: calc(var(--w) * 0.06);
  bottom: calc(var(--w) * -0.02);
  font-size: calc(var(--w) * 0.62);
  line-height: 1;
  opacity: 0.95;
}
.backface {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.09) 0 3px, transparent 3px 7px),
    radial-gradient(circle at 50% 50%, #3a46a8, #1e2766);
  border: calc(var(--w) * 0.06) solid #f2f4ff;
  box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.7);
}
.phc {
  display: grid;
  place-items: center;
  border: 2px dashed rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
  font-weight: 700;
  font-size: calc(var(--w) * 0.3);
  transition: background 0.2s, border-color 0.2s;
}
.pcard.ph:hover .phc { background: rgba(255, 255, 255, 0.09); border-color: var(--gold); color: var(--gold); }
.pcard.hl { transform: translateY(-6px); }
.pcard.hl .face { box-shadow: 0 0 0 2px var(--gold), 0 10px 24px -6px rgba(245, 181, 68, 0.55); }
.pcard.dim { opacity: 0.4; }

.flip-enter-active { transition: transform 0.45s var(--spring) var(--fd, 0s), opacity 0.2s var(--fd, 0s); }
.flip-leave-active { transition: transform 0.15s ease-in, opacity 0.15s; }
.flip-enter-from { transform: rotateY(90deg) scale(0.9); opacity: 0; }
.flip-leave-to { transform: rotateY(-90deg); opacity: 0; }
</style>
