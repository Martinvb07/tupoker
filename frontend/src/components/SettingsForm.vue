<script setup>
// Configuración de la mesa: modo de juego, mínima, máxima, fichas iniciales y valores de las fichas.
import { computed, ref } from 'vue';
import { chipDenominations } from '@shared/poker.js';
import { formatChips, MODES } from '@/lib/format.js';
import Chip from './Chip.vue';
import Icon from './Icon.vue';

const model = defineModel({ type: Object, required: true });
defineProps({ hideStarting: Boolean, hideMode: Boolean });

const MIN_PRESETS = [10, 50, 100, 500, 1000, 5000, 10000];
const set = (k, v) => (model.value = { ...model.value, [k]: v });
const mode = computed(() => model.value.mode || 'live');
const custom = computed(() => (model.value.chips || []).length > 0);
const autoChips = computed(() =>
  chipDenominations(Number(model.value.minBet) || 1, Number(model.value.maxBet) || 0, Number(model.value.startingChips) || 0),
);
const chips = computed(() => (custom.value ? model.value.chips : autoChips.value));
const sb = computed(() => Math.max(1, Math.floor((Number(model.value.minBet) || 0) / 2)));

const newChip = ref('');
function toggleCustom(on) {
  set('chips', on ? [...autoChips.value] : []);
}
function addChip() {
  const v = Math.floor(Number(newChip.value));
  if (!(v >= 1)) return;
  const list = [...new Set([...(model.value.chips || []), v])].sort((a, b) => a - b).slice(0, 10);
  set('chips', list);
  newChip.value = '';
}
function removeChip(v) {
  const list = (model.value.chips || []).filter((x) => x !== v);
  set('chips', list.length ? list : [v]); // siempre al menos una ficha
}
</script>

<template>
  <div class="sf stack">
    <div v-if="!hideMode" class="field">
      <span>Modo de juego</span>
      <div class="modes">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          class="mode"
          :class="{ on: mode === m.value }"
          @click="set('mode', m.value)"
        >
          <span class="mi">{{ m.icon }}</span>
          <b>{{ m.label }}</b>
          <small>{{ m.desc }}</small>
          <span class="check"><Icon name="check" :size="14" /></span>
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="mode !== 'offline'" class="stack">
        <label class="field">
          <span>Apuesta mínima (ciega grande)</span>
          <input class="input num" type="number" min="1" inputmode="numeric" :value="model.minBet" @input="set('minBet', Number($event.target.value))" />
          <div class="pills">
            <button v-for="p in MIN_PRESETS" :key="p" type="button" class="pill" :class="{ on: model.minBet === p }" @click="set('minBet', p)">
              {{ formatChips(p) }}
            </button>
          </div>
          <span class="hint">Ciega pequeña: {{ formatChips(sb) }} · Ciega grande: {{ formatChips(model.minBet || 0) }}</span>
        </label>

        <label class="field">
          <span>Apuesta máxima por jugada</span>
          <input class="input num" type="number" min="0" inputmode="numeric" :value="model.maxBet" placeholder="0 = sin límite" @input="set('maxBet', Number($event.target.value))" />
          <span class="hint">{{ model.maxBet > 0 ? `Nadie podrá subir más de ${formatChips(model.maxBet)} de una vez` : 'Sin límite (No-Limit)' }}</span>
        </label>

        <label v-if="!hideStarting" class="field">
          <span>Fichas iniciales por jugador</span>
          <input class="input num" type="number" min="1" inputmode="numeric" :value="model.startingChips" @input="set('startingChips', Number($event.target.value))" />
          <div class="pills">
            <button v-for="m in [50, 100, 200]" :key="m" type="button" class="pill" @click="set('startingChips', (model.minBet || 1) * m)">
              {{ m }} ciegas · {{ formatChips((model.minBet || 1) * m) }}
            </button>
          </div>
        </label>

        <div class="preview">
          <div class="row-between head">
            <div class="lbl">Fichas de esta mesa</div>
            <div class="seg-mini">
              <button type="button" :class="{ on: !custom }" @click="toggleCustom(false)">Automáticas</button>
              <button type="button" :class="{ on: custom }" @click="toggleCustom(true)">Elegir valores</button>
            </div>
          </div>
          <TransitionGroup tag="div" name="list" class="chips">
            <div v-for="(v, i) in chips" :key="v" class="chipwrap">
              <Chip :value="v" :index="i" :size="50" />
              <button v-if="custom" type="button" class="rm" :aria-label="`Quitar ${v}`" @click="removeChip(v)"><Icon name="x" :size="12" /></button>
            </div>
          </TransitionGroup>
          <div v-if="custom" class="row add">
            <input v-model="newChip" class="input num" type="number" min="1" inputmode="numeric" placeholder="Valor de la ficha, p. ej. 25000" @keydown.enter.prevent="addChip" />
            <button type="button" class="btn" :disabled="(model.chips || []).length >= 10" @click="addChip"><Icon name="plus" :size="18" />Añadir</button>
          </div>
          <p class="hint">
            {{ custom ? 'Hasta 10 fichas. Son las que verán los jugadores en el abanico para apostar.' : 'Se calculan a partir de la apuesta mínima y la máxima.' }}
          </p>
        </div>
      </div>
      <p v-else class="hint offline-note">En este modo no hay fichas ni apuestas: el dealer pone las cartas comunes y la app dice qué lleva cada uno y quién gana.</p>
    </Transition>
  </div>
</template>

<style scoped>
.modes { display: grid; grid-template-columns: 1fr; gap: 8px; }
@media (min-width: 560px) { .modes { grid-template-columns: repeat(3, 1fr); } }
.mode {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left;
  padding: 14px; border-radius: 16px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line);
  transition: border-color 0.25s, background 0.25s, transform 0.3s var(--spring);
}
.mode:hover { border-color: var(--line-2); }
.mode.on { border-color: var(--gold); background: rgba(245, 181, 68, 0.09); transform: translateY(-2px); }
.mi { font-size: 24px; line-height: 1; margin-bottom: 4px; }
.mode b { font-size: 15px; }
.mode small { color: var(--text-2); font-size: 12.5px; line-height: 1.35; }
.check {
  position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  border: 2px solid var(--line-2); color: transparent; transition: all 0.25s var(--spring);
}
.mode.on .check { background: var(--gold); border-color: var(--gold); color: #2a1700; }
.pills { display: flex; gap: 6px; flex-wrap: wrap; }
.pill {
  height: 30px; padding: 0 12px; border-radius: 99px; font-size: 13px; font-weight: 700;
  background: rgba(255, 255, 255, 0.05); border: 1px solid var(--line); color: var(--text-2);
  transition: all 0.2s;
}
.pill:hover { color: var(--text); }
.pill.on { background: rgba(245, 181, 68, 0.16); border-color: rgba(245, 181, 68, 0.5); color: var(--gold-2); }
.preview { padding: 14px; border-radius: 16px; background: radial-gradient(ellipse at top, rgba(99, 102, 241, 0.12), transparent), rgba(5, 9, 28, 0.4); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
.head { flex-wrap: wrap; }
.lbl { font-size: 12px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.1em; }
.seg-mini { display: inline-flex; padding: 3px; border-radius: 11px; background: rgba(5, 9, 28, 0.6); border: 1px solid var(--line); }
.seg-mini button { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; font-weight: 700; color: var(--text-2); transition: all 0.2s; }
.seg-mini button.on { background: var(--surface-3); color: var(--text); }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chipwrap { position: relative; }
.rm {
  position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
  background: var(--red); color: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); transition: transform 0.2s var(--spring);
}
.rm:hover { transform: scale(1.15); }
.add .input { height: 44px; }
.add .btn { height: 44px; }
.offline-note { padding: 12px 14px; border-radius: 14px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line); color: var(--text-2); }
</style>
