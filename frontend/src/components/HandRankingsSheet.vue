<script setup>
// Jugadas del póker de mejor a peor, con un ejemplo de cada una.
// Las cartas que forman la jugada se ven enteras; las que solo acompañan, apagadas.
import Sheet from './Sheet.vue';
import PlayingCard from './PlayingCard.vue';

defineProps({ open: Boolean });
const emit = defineEmits(['close']);

const HANDS = [
  { name: 'Escalera real', desc: 'A, K, Q, J y 10 del mismo palo', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts'], used: 5 },
  { name: 'Escalera de color', desc: 'Cinco cartas seguidas del mismo palo', cards: ['9h', '8h', '7h', '6h', '5h'], used: 5 },
  { name: 'Póker', desc: 'Cuatro cartas del mismo número', cards: ['Qc', 'Qd', 'Qh', 'Qs', '7d'], used: 4 },
  { name: 'Full', desc: 'Un trío y una pareja', cards: ['Ts', 'Th', 'Td', '4c', '4h'], used: 5 },
  { name: 'Color', desc: 'Cinco cartas del mismo palo, no seguidas', cards: ['Ad', 'Jd', '8d', '6d', '2d'], used: 5 },
  { name: 'Escalera', desc: 'Cinco cartas seguidas de distinto palo', cards: ['8s', '7d', '6c', '5h', '4s'], used: 5 },
  { name: 'Trío', desc: 'Tres cartas del mismo número', cards: ['7c', '7h', '7s', 'Kd', '3c'], used: 3 },
  { name: 'Doble pareja', desc: 'Dos parejas distintas', cards: ['Jh', 'Jc', '5s', '5d', 'Ah'], used: 4 },
  { name: 'Pareja', desc: 'Dos cartas del mismo número', cards: ['Ac', 'Ad', '9s', '6h', '3d'], used: 2 },
  { name: 'Carta alta', desc: 'Nada de lo anterior: manda la carta más alta', cards: ['Kh', 'Ts', '8c', '5d', '2s'], used: 1 },
];
</script>

<template>
  <Sheet :open="open" title="Manos de póker" :width="560" @close="emit('close')">
    <p class="intro muted small">De la mejor a la peor. Gana la mejor jugada de 5 cartas entre las tuyas y las de la mesa.</p>
    <ol class="hr">
      <li v-for="(h, i) in HANDS" :key="h.name" class="hrow rise" :style="{ animationDelay: i * 35 + 'ms' }">
        <span class="no num">{{ i + 1 }}</span>
        <div class="info">
          <b>{{ h.name }}</b>
          <small>{{ h.desc }}</small>
        </div>
        <div class="cards">
          <PlayingCard v-for="(c, j) in h.cards" :key="c" :card="c" size="sm" :dim="j >= h.used" />
        </div>
      </li>
    </ol>
  </Sheet>
</template>

<style scoped>
.intro { margin: 0 0 12px; }
.hr { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hrow {
  display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 14px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line);
}
.hrow:first-child { border-color: rgba(245, 181, 68, 0.45); background: radial-gradient(circle at 0% 50%, rgba(245, 181, 68, 0.14), transparent 60%), rgba(5, 9, 28, 0.4); }
.no {
  width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  font-weight: 900; font-size: 13px; color: var(--gold-2); background: rgba(245, 181, 68, 0.12);
}
.info { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.info b { font-size: 15px; }
.info small { color: var(--text-3); font-size: 12px; line-height: 1.3; }
.cards { display: flex; gap: 3px; }
.cards :deep(.pcard.dim) { opacity: 0.35; }
@media (max-width: 480px) {
  .hrow { grid-template-columns: 26px 1fr; row-gap: 6px; }
  .cards { grid-column: 2; }
  .cards :deep(.pcard.sm) { --w: 40px; }
}
</style>
