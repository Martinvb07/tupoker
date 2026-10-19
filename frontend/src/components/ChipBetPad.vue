<script setup>
// Panel de apuesta estilo casino: elige ficha en el abanico, toca el círculo para apilar,
// deshaz / limpia / dobla, y confirma. Retirarse / Pasar / Igualar siempre a mano.
import { computed, ref, watch } from 'vue';
import Chip from './Chip.vue';
import Icon from './Icon.vue';
import { formatChips } from '@/lib/format.js';

const props = defineProps({
  legal: { type: Object, required: true },
  chips: { type: Array, required: true },
  pot: { type: Number, default: 0 },
  busy: Boolean,
  compact: Boolean, // móvil: todo más pequeño para que quepa sin deslizar
  large: Boolean, // en vivo, jugador: el panel ocupa la pantalla, todo más grande
});
const emit = defineEmits(['action']);

const placed = ref([]); // [{ value, index, id }]
const selected = ref(0);
const expanded = ref(false);
let uid = 0;

const pending = computed(() => placed.value.reduce((s, c) => s + c.value, 0));
const stack = computed(() => props.legal.stack);
const toCall = computed(() => props.legal.toCall);
const to = computed(() => props.legal.myBet + pending.value);
const maxAdd = computed(() => Math.min(stack.value, props.legal.maxTo - props.legal.myBet, stack.value));

// reinicia el montón cuando cambia la situación de apuesta
watch(() => [props.legal.currentBet, props.legal.myBet, props.legal.stack], () => (placed.value = []));
// ficha seleccionada por defecto: la menor
watch(() => props.chips, () => (selected.value = 0), { immediate: true });

const verdict = computed(() => {
  const L = props.legal;
  const p = pending.value;
  if (p === 0) return L.canCheck ? { kind: 'check', label: 'Pasar', ok: true } : { kind: null, label: 'Apila fichas', ok: false };
  if (p >= stack.value) {
    const ok = to.value <= L.currentBet || (L.canRaise && to.value <= L.maxTo) || p <= toCall.value;
    return { kind: 'allin', label: `All-in ${formatChips(stack.value)}`, ok };
  }
  if (p < toCall.value) return { kind: null, label: `Faltan ${formatChips(toCall.value - p)}`, ok: false };
  if (p === toCall.value) return { kind: 'call', label: `Igualar ${formatChips(p)}`, ok: true };
  if (!L.canRaise) return { kind: null, label: 'No puedes subir', ok: false };
  if (to.value < L.minTo) return { kind: null, label: `Mín. ${L.isBet ? 'apuesta' : 'subida a'} ${formatChips(L.minTo)}`, ok: false };
  if (to.value > L.maxTo) return { kind: null, label: `Máx. ${formatChips(L.maxTo)}`, ok: false };
  return { kind: 'raise', label: `${L.isBet ? 'Apostar' : 'Subir a'} ${formatChips(to.value)}`, ok: true };
});

function vibrate(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function addChip() {
  if (props.busy) return;
  const value = props.chips[selected.value];
  const room = maxAdd.value - pending.value;
  if (room <= 0) return vibrate(40);
  if (value > room) {
    // completa hasta el máximo posible con lo que queda
    placed.value.push({ value: room, index: selected.value, id: ++uid });
  } else placed.value.push({ value, index: selected.value, id: ++uid });
  vibrate();
}

const undo = () => placed.value.pop();
const clear = () => (placed.value = []);
function double() {
  if (!placed.value.length) return;
  setAmount(pending.value * 2);
}

/** Convierte una cantidad en fichas (de mayor a menor). */
function setAmount(amount) {
  amount = Math.max(0, Math.min(amount, maxAdd.value));
  const out = [];
  let rest = amount;
  for (let i = props.chips.length - 1; i >= 0 && rest > 0; i--) {
    while (rest >= props.chips[i] && out.length < 40) {
      out.push({ value: props.chips[i], index: i, id: ++uid });
      rest -= props.chips[i];
    }
  }
  if (rest > 0) out.push({ value: rest, index: 0, id: ++uid });
  placed.value = out;
}

const presets = computed(() => {
  const L = props.legal;
  const list = [];
  if (toCall.value > 0) list.push({ label: 'Igualar', amount: toCall.value });
  if (L.canRaise) {
    list.push({ label: 'Mín', amount: L.minTo - L.myBet });
    const potAfterCall = props.pot + toCall.value;
    const half = L.currentBet + Math.floor(potAfterCall / 2) - L.myBet;
    const full = L.currentBet + potAfterCall - L.myBet;
    if (half > L.minTo - L.myBet) list.push({ label: '½ Bote', amount: half });
    if (full > L.minTo - L.myBet) list.push({ label: 'Bote', amount: full });
  }
  list.push({ label: 'All-in', amount: stack.value });
  return list.filter((p) => p.amount > 0 && p.amount <= maxAdd.value || p.label === 'All-in');
});

function confirm() {
  const v = verdict.value;
  if (!v.ok || props.busy) return;
  if (v.kind === 'check') emit('action', { type: 'check' });
  else if (v.kind === 'call') emit('action', { type: 'call' });
  else if (v.kind === 'allin') emit('action', { type: 'allin' });
  else emit('action', { type: 'raise', amount: to.value });
}

// ---- Abanico ----
const ARC_START = 200;
const ARC_END = -20;
function arcPos(i) {
  const n = props.chips.length;
  const a = n === 1 ? 90 : ARC_START - (i * (ARC_START - ARC_END)) / (n - 1);
  const r = 128;
  const rad = (a * Math.PI) / 180;
  return { x: Math.cos(rad) * r * 1.05, y: -Math.sin(rad) * r };
}
function pick(i) {
  selected.value = i;
  vibrate();
  setTimeout(() => (expanded.value = false), 120);
}
const prevIdx = computed(() => (selected.value - 1 + props.chips.length) % props.chips.length);
const nextIdx = computed(() => (selected.value + 1) % props.chips.length);
const visibleStack = computed(() => placed.value.slice(-8));
const sz = computed(() =>
  props.large ? { pile: 76, mini: 56, main: 78 } : props.compact ? { pile: 56, mini: 44, main: 60 } : { pile: 64, mini: 50, main: 66 },
);
</script>

<template>
  <div class="pad" :class="{ compact, large }">
    <!-- presets -->
    <div class="presets">
      <button v-for="p in presets" :key="p.label" class="preset" @click="setAmount(p.amount)">{{ p.label }}</button>
    </div>

    <!-- círculo de apuesta -->
    <div class="table-zone">
      <button class="circle" :class="{ has: placed.length }" aria-label="Añadir ficha" @click="addChip">
        <div class="ring"></div>
        <div class="pile">
          <TransitionGroup name="drop">
            <div
              v-for="(c, i) in visibleStack"
              :key="c.id"
              class="pile-chip"
              :style="{ transform: `translateY(${-i * 5}px)`, zIndex: i }"
            >
              <Chip :value="c.value" :index="c.index" :size="sz.pile" />
            </div>
          </TransitionGroup>
        </div>
        <span v-if="!placed.length" class="tap">Toca para<br />apostar</span>
      </button>
      <Transition name="fade">
        <div v-if="pending" class="amount num">{{ formatChips(pending) }}</div>
      </Transition>
    </div>

    <!-- controles -->
    <div class="controls">
      <div class="side left">
        <button class="sq" :disabled="!placed.length" aria-label="Deshacer" @click="undo"><Icon name="undo" /></button>
        <button class="sq" :disabled="!placed.length" aria-label="Limpiar" @click="clear"><Icon name="trash" /></button>
      </div>

      <button class="selector" aria-label="Elegir ficha" @click="expanded = true">
        <div class="mini l"><Chip :value="chips[prevIdx]" :index="prevIdx" :size="sz.mini" /></div>
        <div class="mini r"><Chip :value="chips[nextIdx]" :index="nextIdx" :size="sz.mini" /></div>
        <div class="main"><Chip :value="chips[selected]" :index="selected" :size="sz.main" /></div>
      </button>

      <div class="side right">
        <button class="sq" :disabled="!placed.length" aria-label="Doblar" @click="double"><b>x2</b></button>
        <button class="sq dark" aria-label="Fichas" @click="expanded = true"><Icon name="menu" /></button>
      </div>
    </div>

    <!-- acciones -->
    <div class="actions">
      <button class="act fold" :disabled="busy" @click="emit('action', { type: 'fold' })">Retirarse</button>
      <!-- al apilar fichas, el botón de Pasar / Igualar se convierte en el de apostar -->
      <template v-if="!pending">
        <button v-if="legal.canCheck" class="act check" :disabled="busy" @click="emit('action', { type: 'check' })">Pasar</button>
        <button v-else class="act call" :disabled="busy" @click="emit('action', { type: 'call' })">
          Igualar <span class="num">{{ formatChips(toCall) }}</span>
        </button>
      </template>
      <button v-else class="act go" :class="{ ok: verdict.ok }" :disabled="!verdict.ok || busy" @click="confirm">
        <span v-if="busy" class="spinner"></span>
        <span v-else>{{ verdict.label }}</span>
      </button>
    </div>

    <!-- abanico de fichas -->
    <Teleport to="body">
      <Transition name="fan">
        <div v-if="expanded" class="fan-overlay" @click.self="expanded = false">
          <div class="fan">
            <button
              v-for="(v, i) in chips"
              :key="v"
              class="fan-chip"
              :style="{ '--x': arcPos(i).x + 'px', '--y': arcPos(i).y + 'px', '--d': i * 28 + 'ms' }"
              @click="pick(i)"
            >
              <Chip :value="v" :index="i" :size="62" :selected="i === selected" :muted="i !== selected" />
            </button>
            <div class="fan-center">
              <div class="halo"></div>
              <Chip :value="chips[selected]" :index="selected" :size="104" />
            </div>
          </div>
          <p class="fan-hint">Elige el valor de la ficha</p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.pad { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }

.presets { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.preset {
  height: 30px; padding: 0 12px; border-radius: 99px; font-size: 13px; font-weight: 700;
  background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); color: var(--text-2);
  transition: all 0.2s;
}
.preset:hover { color: var(--gold-2); border-color: rgba(245, 181, 68, 0.4); }
.preset:active { transform: scale(0.94); }

.table-zone { position: relative; display: flex; flex-direction: column; align-items: center; }
.circle {
  width: 132px; height: 132px; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; padding: 0;
  background: radial-gradient(circle, #0e1430 58%, #0a0f26 60%);
  box-shadow: 0 0 0 7px #0d1330, 0 0 0 8px rgba(255, 255, 255, 0.06), 0 18px 40px -16px rgba(0, 0, 0, 0.8);
  transition: transform 0.2s var(--ease);
}
.circle:active { transform: scale(0.96); }
.ring {
  position: absolute; inset: 6px; border-radius: 50%;
  border: 5px solid transparent;
  background: linear-gradient(145deg, #f8fafc, #9ca3af 40%, #e5e7eb 60%, #6b7280) border-box;
  -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0.85;
}
.ring::after {
  content: ''; position: absolute; inset: 10px; border-radius: 50%;
  background: repeating-conic-gradient(rgba(255,255,255,.35) 0 12deg, transparent 12deg 60deg);
  -webkit-mask: radial-gradient(circle, transparent 78%, #000 80%);
  mask: radial-gradient(circle, transparent 78%, #000 80%);
}
.circle.has .ring { opacity: 1; filter: drop-shadow(0 0 10px rgba(245, 181, 68, 0.35)); }
.tap { position: relative; font-size: 12px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.25; }
.pile { position: absolute; inset: 0; display: grid; place-items: center; }
.pile-chip { position: absolute; transition: transform 0.3s var(--ease); }
.amount {
  margin-top: -10px; z-index: 2; padding: 4px 14px; border-radius: 99px; font-weight: 800; font-size: 17px;
  background: linear-gradient(180deg, var(--gold-2), var(--gold)); color: #2a1700;
  box-shadow: 0 6px 18px -6px rgba(245, 181, 68, 0.7);
}

.drop-enter-active { transition: transform 0.4s var(--spring), opacity 0.2s; }
.drop-enter-from { transform: translateY(70px) scale(0.6) !important; opacity: 0; }
.drop-leave-active { transition: transform 0.2s ease, opacity 0.2s; }
.drop-leave-to { opacity: 0; transform: translateY(30px) scale(0.7) !important; }

.controls { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 440px; }
.side { display: flex; gap: 8px; }
.sq {
  width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center; padding: 0;
  background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-2); color: var(--text-2);
  transition: all 0.2s var(--ease);
}
.sq b { font-weight: 800; font-size: 15px; }
.sq:hover:not(:disabled) { color: var(--text); background: rgba(255, 255, 255, 0.08); }
.sq:active:not(:disabled) { transform: scale(0.9); }
.sq:disabled { opacity: 0.35; }
.sq.dark { background: #0e1430; border-color: rgba(255, 255, 255, 0.35); color: #fff; }

.selector { position: relative; width: 130px; height: 74px; display: grid; place-items: center; }
.selector .mini { position: absolute; top: 12px; transition: transform 0.3s var(--ease); }
.selector .mini.l { left: 6px; }
.selector .mini.r { right: 6px; }
.selector .main { position: relative; z-index: 2; transition: transform 0.3s var(--spring); }
.selector:hover .main { transform: translateY(-3px); }
.selector:hover .mini.l { transform: translateX(-4px); }
.selector:hover .mini.r { transform: translateX(4px); }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; max-width: 520px; }
.act {
  height: 52px; border-radius: 15px; font-weight: 800; font-size: 15px; padding: 0 8px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--line-2); background: var(--surface-2);
  transition: transform 0.15s var(--ease), background 0.2s, opacity 0.2s, box-shadow 0.3s;
}
.act:active:not(:disabled) { transform: scale(0.95); }
.act:disabled { opacity: 0.45; }
.act.fold { background: rgba(244, 63, 94, 0.13); border-color: rgba(244, 63, 94, 0.35); color: #fecdd3; }
.act.check, .act.call { background: rgba(96, 165, 250, 0.14); border-color: rgba(96, 165, 250, 0.38); color: #dbeafe; }
.act.go { color: var(--text-2); font-size: 14px; }
.act.go.ok {
  background: linear-gradient(180deg, var(--gold-2), var(--gold) 45%, var(--gold-deep));
  color: #2a1700; border-color: transparent; font-size: 15px;
  box-shadow: 0 10px 26px -10px rgba(245, 181, 68, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

@media (max-height: 860px) {
  .circle { width: 112px; height: 112px; }
  .pad { gap: 8px; }
  .act { height: 48px; }
}

/* grande (en vivo, jugador): sin mesa, el panel llena la pantalla */
.pad.large { gap: 12px; }
.large .presets { gap: 8px; }
.large .preset { height: 40px; padding: 0 12px; font-size: 14.5px; }
.large .presets { flex-wrap: nowrap; gap: 6px; }
.large .circle { width: 156px; height: 156px; box-shadow: 0 0 0 9px #0d1330, 0 0 0 10px rgba(255, 255, 255, 0.06), 0 24px 50px -16px rgba(0, 0, 0, 0.8); }
.large .ring { inset: 8px; border-width: 6px; }
.large .tap { font-size: 14px; }
.large .amount { font-size: 20px; padding: 5px 18px; }
.large .controls { max-width: none; }
.large .selector { width: 150px; height: 84px; }
.large .sq { width: 52px; height: 52px; border-radius: 16px; }
.large .actions { max-width: none; gap: 10px; }
.large .act { height: 54px; font-size: 17px; border-radius: 18px; }
.large .act.go { font-size: 16px; }
.large .act.go.ok { font-size: 17px; }

/* compacto (móvil): círculo y selector en la misma fila, botones a los lados */
.pad.compact {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  grid-template-areas: 'p p p p' 'l z s r' 'a a a a';
  gap: 8px;
  align-items: center;
}
.compact .presets { grid-area: p; }
.compact .table-zone { grid-area: z; }
.compact .controls { display: contents; }
.compact .side { flex-direction: column; gap: 6px; }
.compact .side.left { grid-area: l; }
.compact .side.right { grid-area: r; }
.compact .selector { grid-area: s; justify-self: center; width: 104px; height: 66px; }
.compact .selector .mini { top: 10px; }
.compact .actions { grid-area: a; max-width: none; }
.compact .circle { width: 104px; height: 104px; box-shadow: 0 0 0 5px #0d1330, 0 0 0 6px rgba(255, 255, 255, 0.06); }
.compact .ring { inset: 4px; border-width: 4px; }
.compact .tap { font-size: 10.5px; }
.compact .amount { font-size: 14px; margin-top: -10px; padding: 2px 10px; }
.compact .sq { width: 44px; height: 44px; border-radius: 13px; }
.compact .act { height: 50px; font-size: 15.5px; border-radius: 14px; }
.compact .act.go.ok { font-size: 15.5px; }
.compact .preset { height: 32px; font-size: 13.5px; padding: 0 11px; }

/* abanico */
.fan-overlay {
  position: fixed; inset: 0; z-index: 150;
  background: radial-gradient(ellipse at 50% 100%, rgba(30, 40, 90, 0.92), rgba(5, 8, 24, 0.94));
  backdrop-filter: blur(4px);
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
  padding-bottom: calc(70px + var(--safe-b));
}
.fan { position: relative; width: 320px; height: 250px; }
.fan-chip {
  position: absolute; left: 50%; bottom: 52px; margin-left: -31px; margin-bottom: -31px;
  transform: translate(var(--x), var(--y));
  transition: transform 0.55s var(--spring) var(--d), opacity 0.3s var(--d);
}
.fan-chip:hover :deep(.chip) { filter: none; transform: scale(1.08); }
.fan-center { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); display: grid; place-items: center; }
.halo {
  position: absolute; width: 150px; height: 150px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.07); box-shadow: 0 0 0 10px rgba(255, 255, 255, 0.04), 0 0 60px 10px rgba(245, 181, 68, 0.15);
}
.fan-hint { margin-top: 26px; color: var(--text-3); font-weight: 600; font-size: 14px; }

.fan-enter-active, .fan-leave-active { transition: opacity 0.3s var(--ease); }
.fan-enter-from, .fan-leave-to { opacity: 0; }
.fan-enter-from .fan-chip, .fan-leave-to .fan-chip { transform: translate(0, 0) scale(0.3); opacity: 0; }
.fan-enter-from .fan-center { transform: translateX(-50%) scale(0.6); }
.fan-center { transition: transform 0.45s var(--spring); }
</style>
