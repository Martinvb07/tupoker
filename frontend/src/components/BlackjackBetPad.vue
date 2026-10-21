<script setup>
// Apuestas del blackjack con el mismo sistema que el póker: eliges ficha en el abanico y tocas
// la casilla para apilarla. Tres casillas: Par, la apuesta principal y 21+3.
import { computed, ref, watch } from 'vue';
import Chip from './Chip.vue';
import ChipFan from './ChipFan.vue';
import Icon from './Icon.vue';
import { formatChips } from '@/lib/format.js';
import { vibrate } from '@/lib/sfx.js';

const props = defineProps({
  chips: { type: Array, required: true },
  min: { type: Number, required: true },
  max: { type: Number, default: 0 }, // 0 = sin límite
  stack: { type: Number, required: true },
  last: { type: Object, default: null }, // apuestas de la ronda anterior (para repetir)
  busy: Boolean,
  compact: Boolean,
});
const emit = defineEmits(['confirm']);

const SPOTS = computed(() => [
  { key: 'pair', label: 'Par', sub: 'hasta 25:1', side: true },
  { key: 'main', label: 'Apuesta', sub: `mín. ${formatChips(props.min)}` },
  { key: 't21', label: '21+3', sub: 'hasta 100:1', side: true },
]);
const placed = ref({ pair: [], main: [], t21: [] });
const order = ref([]); // en qué casilla cayó cada ficha (para deshacer)
const selected = ref(0);
const fanOpen = ref(false);
let uid = 0;
watch(() => props.chips, () => (selected.value = 0), { immediate: true });

const amount = computed(() => Object.fromEntries(SPOTS.value.map((s) => [s.key, placed.value[s.key].reduce((a, c) => a + c.value, 0)])));
const total = computed(() => amount.value.pair + amount.value.main + amount.value.t21);
const cap = computed(() => (props.max > 0 ? props.max : Infinity));

function add(spot) {
  if (props.busy) return;
  const room = Math.min(cap.value - amount.value[spot], props.stack - total.value);
  if (room <= 0) return vibrate(40);
  const value = Math.min(props.chips[selected.value], room);
  placed.value[spot].push({ value, index: selected.value, id: ++uid });
  order.value.push(spot);
  vibrate(10);
}
function undo() {
  const spot = order.value.pop();
  if (spot) placed.value[spot].pop();
}
function clear() {
  placed.value = { pair: [], main: [], t21: [] };
  order.value = [];
}
/** Convierte una cantidad en fichas (de mayor a menor). */
function toChips(n) {
  const out = [];
  let rest = n;
  for (let i = props.chips.length - 1; i >= 0 && rest > 0; i--) {
    while (rest >= props.chips[i] && out.length < 30) {
      out.push({ value: props.chips[i], index: i, id: ++uid });
      rest -= props.chips[i];
    }
  }
  if (rest > 0) out.push({ value: rest, index: 0, id: ++uid });
  return out;
}
function setAll(next) {
  // se recorta para no pasarse de la máxima ni de tus fichas
  let left = props.stack;
  const fixed = {};
  for (const k of ['main', 'pair', 't21']) {
    fixed[k] = Math.max(0, Math.min(next[k] || 0, cap.value, left));
    left -= fixed[k];
  }
  placed.value = { pair: toChips(fixed.pair), main: toChips(fixed.main), t21: toChips(fixed.t21) };
  order.value = SPOTS.value.flatMap((s) => placed.value[s.key].map(() => s.key));
}
const double = () => setAll({ main: amount.value.main * 2, pair: amount.value.pair * 2, t21: amount.value.t21 * 2 });
const repeat = () => props.last && setAll(props.last);
const canRepeat = computed(() => !!props.last?.main && props.last.main + (props.last.pair || 0) + (props.last.t21 || 0) <= props.stack);

const verdict = computed(() => {
  const a = amount.value;
  if (!total.value) return { label: 'Apila fichas en «Apuesta»', ok: false };
  if (a.main < props.min) return { label: `Mín. ${formatChips(props.min)} a la apuesta`, ok: false };
  if (a.pair > a.main || a.t21 > a.main) return { label: 'Par y 21+3 no superan la apuesta', ok: false };
  return { label: `Apostar ${formatChips(total.value)}`, ok: true };
});
function confirm() {
  if (!verdict.value.ok || props.busy) return;
  emit('confirm', { ...amount.value });
}
const chipSize = computed(() => (props.compact ? { main: 54, side: 40 } : { main: 62, side: 46 }));
const prevIdx = computed(() => (selected.value - 1 + props.chips.length) % props.chips.length);
const nextIdx = computed(() => (selected.value + 1) % props.chips.length);
</script>

<template>
  <div class="bjpad" :class="{ compact }">
    <div class="spots">
      <button v-for="sp in SPOTS" :key="sp.key" class="spot" :class="[sp.key, { side: sp.side, has: amount[sp.key] }]" :aria-label="`Apostar a ${sp.label}`" @click="add(sp.key)">
        <div class="ring"></div>
        <div class="pile">
          <TransitionGroup name="drop">
            <div v-for="(c, i) in placed[sp.key].slice(-6)" :key="c.id" class="pile-chip" :style="{ transform: `translateY(${-i * 4}px)`, zIndex: i }">
              <Chip :value="c.value" :index="c.index" :size="sp.side ? chipSize.side : chipSize.main" />
            </div>
          </TransitionGroup>
        </div>
        <span v-if="!amount[sp.key]" class="lbl"><b>{{ sp.label }}</b><small>{{ sp.sub }}</small></span>
        <Transition name="fade">
          <span v-if="amount[sp.key]" class="amt num">{{ formatChips(amount[sp.key]) }}</span>
        </Transition>
        <span v-if="amount[sp.key]" class="tag">{{ sp.label }}</span>
      </button>
    </div>

    <div class="controls">
      <div class="side">
        <button class="sq" :disabled="!order.length" aria-label="Deshacer" @click="undo"><Icon name="undo" /></button>
        <button class="sq" :disabled="!order.length" aria-label="Limpiar" @click="clear"><Icon name="trash" /></button>
      </div>
      <button class="selector" aria-label="Elegir ficha" @click="fanOpen = true">
        <div class="mini l"><Chip :value="chips[prevIdx]" :index="prevIdx" :size="compact ? 42 : 48" /></div>
        <div class="mini r"><Chip :value="chips[nextIdx]" :index="nextIdx" :size="compact ? 42 : 48" /></div>
        <div class="main"><Chip :value="chips[selected]" :index="selected" :size="compact ? 58 : 64" /></div>
      </button>
      <div class="side">
        <button class="sq" :disabled="!order.length" aria-label="Doblar" @click="double"><b>x2</b></button>
        <button class="sq" :disabled="!canRepeat" aria-label="Repetir la apuesta anterior" title="Repetir la apuesta anterior" @click="repeat"><Icon name="repeat" /></button>
      </div>
    </div>

    <button class="go" :class="{ ok: verdict.ok }" :disabled="!verdict.ok || busy" @click="confirm">
      <span v-if="busy" class="spinner"></span>
      <span v-else>{{ verdict.label }}</span>
    </button>

    <ChipFan :open="fanOpen" :chips="chips" :selected="selected" @pick="(i) => ((selected = i), vibrate(10))" @close="fanOpen = false" />
  </div>
</template>

<style scoped>
.bjpad { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
.spots { display: flex; align-items: center; justify-content: center; gap: 14px; width: 100%; }
.spot {
  --d: 120px;
  position: relative; width: var(--d); height: var(--d); border-radius: 50%; padding: 0; flex: none;
  display: grid; place-items: center;
  background: radial-gradient(circle, rgba(10, 60, 40, 0.55) 58%, rgba(5, 30, 20, 0.6) 60%);
  box-shadow: 0 0 0 6px #0d1330, 0 0 0 7px rgba(255, 255, 255, 0.06), 0 16px 34px -14px rgba(0, 0, 0, 0.8);
  transition: transform 0.2s var(--ease), box-shadow 0.3s;
}
.spot.side { --d: 84px; }
.spot:active { transform: scale(0.95); }
.ring { position: absolute; inset: 5px; border-radius: 50%; border: 2px dashed rgba(255, 255, 255, 0.28); transition: border-color 0.3s; }
.spot.main .ring { border: 3px solid rgba(245, 181, 68, 0.55); }
.spot.has .ring { border-color: var(--gold); border-style: solid; }
.spot.has { box-shadow: 0 0 0 6px #0d1330, 0 0 0 7px rgba(245, 181, 68, 0.35), 0 0 30px -6px rgba(245, 181, 68, 0.5); }
.lbl {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  text-align: center; line-height: 1; pointer-events: none;
}
.lbl b { font-size: 15px; font-weight: 900; letter-spacing: 0.04em; color: #fff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); }
.lbl small { font-size: 10.5px; font-weight: 700; color: rgba(255, 255, 255, 0.55); }
.spot.main .lbl b { font-size: 17px; color: var(--gold-2); }
.spot.side .lbl b { font-size: 14px; }
.spot.side .lbl small { font-size: 9.5px; }
.pile { position: absolute; inset: 0; display: grid; place-items: center; }
.pile-chip { position: absolute; transition: transform 0.3s var(--ease); }
.amt {
  position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%); z-index: 9; white-space: nowrap;
  padding: 2px 10px; border-radius: 99px; font-weight: 800; font-size: 14px;
  background: linear-gradient(180deg, var(--gold-2), var(--gold)); color: #2a1700; box-shadow: 0 6px 18px -6px rgba(245, 181, 68, 0.7);
}
.tag { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); z-index: 9; font-size: 10.5px; font-weight: 800; padding: 1px 8px; border-radius: 99px; background: #0d1330; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
.drop-enter-active { transition: transform 0.4s var(--spring), opacity 0.2s; }
.drop-enter-from { transform: translateY(70px) scale(0.6) !important; opacity: 0; }
.drop-leave-active { transition: transform 0.2s ease, opacity 0.2s; }
.drop-leave-to { opacity: 0; transform: translateY(30px) scale(0.7) !important; }

.controls { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 440px; margin-top: 6px; }
.side { display: flex; gap: 8px; }
.sq {
  width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center; padding: 0;
  background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-2); color: var(--text-2); transition: all 0.2s var(--ease);
}
.sq b { font-weight: 800; font-size: 15px; }
.sq:hover:not(:disabled) { color: var(--text); background: rgba(255, 255, 255, 0.08); }
.sq:active:not(:disabled) { transform: scale(0.9); }
.sq:disabled { opacity: 0.35; }
.selector { position: relative; width: 130px; height: 74px; display: grid; place-items: center; }
.selector .mini { position: absolute; top: 12px; transition: transform 0.3s var(--ease); }
.selector .mini.l { left: 6px; }
.selector .mini.r { right: 6px; }
.selector .main { position: relative; z-index: 2; transition: transform 0.3s var(--spring); }
.selector:hover .main { transform: translateY(-3px); }
.go {
  width: 100%; max-width: 520px; height: 54px; border-radius: 16px; font-weight: 800; font-size: 15px;
  border: 1px solid var(--line-2); background: var(--surface-2); color: var(--text-2);
  display: flex; align-items: center; justify-content: center; transition: transform 0.15s var(--ease), background 0.2s, box-shadow 0.3s;
}
.go:active:not(:disabled) { transform: scale(0.97); }
.go.ok {
  background: linear-gradient(180deg, var(--gold-2), var(--gold) 45%, var(--gold-deep)); color: #2a1700; border-color: transparent; font-size: 16px;
  box-shadow: 0 10px 26px -10px rgba(245, 181, 68, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.compact { gap: 10px; }
.compact .spots { gap: 10px; }
.compact .spot { --d: 104px; }
.compact .spot.side { --d: 74px; }
.compact .controls { margin-top: 2px; }
.compact .selector { width: 112px; height: 66px; }
.compact .selector .mini { top: 10px; }
.compact .sq { width: 42px; height: 42px; border-radius: 13px; }
.compact .go { height: 50px; }
/* móviles bajos (Android pequeños, iPhone SE, horizontal): casillas más pequeñas para que quepa todo */
@media (max-height: 720px) {
  .compact .spot { --d: 90px; }
  .compact .spot.side { --d: 66px; }
  .compact .go { height: 46px; }
}
@media (max-width: 360px) {
  .compact .spot { --d: 92px; }
  .compact .spot.side { --d: 66px; }
}
</style>
