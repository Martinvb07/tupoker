<script setup>
// Abanico para elegir el valor de la ficha (panel de apuesta del póker y del blackjack).
import Chip from './Chip.vue';

const props = defineProps({
  open: Boolean,
  chips: { type: Array, required: true },
  selected: { type: Number, default: 0 },
});
const emit = defineEmits(['pick', 'close']);

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
  emit('pick', i);
  setTimeout(() => emit('close'), 120);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fan">
      <div v-if="open" class="fan-overlay" @click.self="emit('close')">
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
</template>

<style scoped>
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
