<script setup>
// Reglas del blackjack de la mesa y tabla de pagos de las apuestas laterales.
import Sheet from './Sheet.vue';
import { PAIR_PAYS, T21_PAYS } from '@shared/blackjack.js';

defineProps({ open: Boolean });
const emit = defineEmits(['close']);

const MAIN = [
  { label: 'Blackjack', desc: 'As + figura o 10 con las dos primeras', pays: '3 a 2' },
  { label: 'Ganar a la banca', desc: 'Más cerca de 21 sin pasarte, o la banca se pasa', pays: '1 a 1' },
  { label: 'Empate', desc: 'Mismo total que la banca', pays: 'Se devuelve' },
];
</script>

<template>
  <Sheet :open="open" title="Blackjack · reglas y pagos" :width="520" @close="emit('close')">
    <ul class="rules small">
      <li>Gana quien se acerque más a 21 sin pasarse. Las figuras valen 10 y el As 1 u 11.</li>
      <li>La banca pide hasta 17 y se planta con 17 blando. Si enseña As o figura y tiene blackjack, la ronda acaba al repartir.</li>
      <li><b>Doblar</b>: con tus dos primeras cartas, doblas la apuesta y recibes una sola carta.</li>
      <li><b>Dividir</b>: con dos cartas del mismo valor las separas en dos manos (hasta 4). Con ases divididos sale una carta a cada uno.</li>
    </ul>

    <h4>Apuesta principal</h4>
    <div class="tbl">
      <div v-for="r in MAIN" :key="r.label" class="tr">
        <div><b>{{ r.label }}</b><small>{{ r.desc }}</small></div>
        <span class="pay">{{ r.pays }}</span>
      </div>
    </div>

    <h4>Par <small>· con tus dos primeras cartas</small></h4>
    <div class="tbl">
      <div v-for="r in PAIR_PAYS" :key="r.kind" class="tr">
        <div><b>{{ r.label }}</b><small>{{ r.desc }}</small></div>
        <span class="pay">{{ r.pays }} a 1</span>
      </div>
    </div>

    <h4>21+3 <small>· tus dos cartas + la visible de la banca</small></h4>
    <div class="tbl">
      <div v-for="r in T21_PAYS" :key="r.kind" class="tr">
        <div><b>{{ r.label }}</b><small>{{ r.desc }}</small></div>
        <span class="pay">{{ r.pays }} a 1</span>
      </div>
    </div>
    <p class="hint">Las apuestas laterales se pagan nada más repartir y no pueden superar a la principal.</p>
  </Sheet>
</template>

<style scoped>
.rules { margin: 0 0 6px; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; color: var(--text-2); }
h4 { margin: 16px 0 8px; font-size: 14px; font-weight: 800; color: var(--gold-2); text-transform: uppercase; letter-spacing: 0.08em; }
h4 small { text-transform: none; letter-spacing: 0; color: var(--text-3); font-weight: 600; }
.tbl { display: flex; flex-direction: column; gap: 4px; }
.tr { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 12px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line); }
.tr > div { display: flex; flex-direction: column; min-width: 0; }
.tr small { color: var(--text-3); font-size: 12px; }
.pay { font-weight: 900; color: #86efac; white-space: nowrap; }
.hint { margin-top: 12px; }
</style>
