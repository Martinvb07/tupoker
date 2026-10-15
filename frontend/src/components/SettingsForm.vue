<script setup>
// Configuración de apuestas: mínima, máxima y fichas iniciales. De aquí salen las fichas de la mesa.
import { computed } from 'vue';
import { chipDenominations } from '@shared/poker.js';
import { formatChips } from '@/lib/format.js';
import Chip from './Chip.vue';

const model = defineModel({ type: Object, required: true });
defineProps({ hideStarting: Boolean });

const MIN_PRESETS = [10, 50, 100, 500, 1000, 5000, 10000];
const chips = computed(() => chipDenominations(Number(model.value.minBet) || 1, Number(model.value.maxBet) || 0, Number(model.value.startingChips) || 0));
const set = (k, v) => (model.value = { ...model.value, [k]: v });
const sb = computed(() => Math.max(1, Math.floor((Number(model.value.minBet) || 0) / 2)));
</script>

<template>
  <div class="sf stack">
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
      <div class="lbl">Fichas de esta mesa</div>
      <TransitionGroup tag="div" name="list" class="chips">
        <Chip v-for="(v, i) in chips" :key="v" :value="v" :index="i" :size="46" />
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.pills { display: flex; gap: 6px; flex-wrap: wrap; }
.pill {
  height: 30px; padding: 0 12px; border-radius: 99px; font-size: 13px; font-weight: 700;
  background: rgba(255, 255, 255, 0.05); border: 1px solid var(--line); color: var(--text-2);
  transition: all 0.2s;
}
.pill:hover { color: var(--text); }
.pill.on { background: rgba(245, 181, 68, 0.16); border-color: rgba(245, 181, 68, 0.5); color: var(--gold-2); }
.preview { padding: 14px; border-radius: 16px; background: radial-gradient(ellipse at top, rgba(99, 102, 241, 0.12), transparent), rgba(5, 9, 28, 0.4); border: 1px solid var(--line); }
.lbl { font-size: 12px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
