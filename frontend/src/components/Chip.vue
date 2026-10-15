<script setup>
import { computed } from 'vue';
import { CHIP_COLORS, formatChips } from '@/lib/format.js';

const props = defineProps({
  value: { type: Number, required: true },
  index: { type: Number, default: 0 },
  size: { type: Number, default: 56 },
  selected: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
});

const c = computed(() => CHIP_COLORS[props.index % CHIP_COLORS.length]);
const label = computed(() => formatChips(props.value));
</script>

<template>
  <div
    class="chip"
    :class="{ selected, muted }"
    :style="{ '--s': size + 'px', '--base': c.base, '--edge': c.edge, '--txt': c.text }"
  >
    <div class="rim"></div>
    <div class="inner">
      <span :style="{ fontSize: size * (label.length > 3 ? 0.24 : 0.3) + 'px' }">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.chip {
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  position: relative;
  flex: none;
  background: var(--base);
  box-shadow:
    0 calc(var(--s) * 0.06) 0 color-mix(in srgb, var(--base) 55%, #000),
    0 calc(var(--s) * 0.14) calc(var(--s) * 0.22) -4px rgba(0, 0, 0, 0.55);
  transition: transform 0.35s var(--spring), filter 0.25s, opacity 0.25s;
}
/* marcas del canto, como una ficha de casino */
.rim {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-conic-gradient(var(--edge) 0 14deg, transparent 14deg 45deg);
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%, #000 92%, transparent 93%);
  mask: radial-gradient(circle, transparent 62%, #000 63%, #000 92%, transparent 93%);
  opacity: 0.9;
}
.inner {
  position: absolute;
  inset: 17%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--base) 75%, #fff), var(--base) 60%);
  box-shadow: inset 0 0 0 calc(var(--s) * 0.025) rgba(255, 255, 255, 0.35), inset 0 -2px 6px rgba(0, 0, 0, 0.25);
}
.inner span {
  color: var(--txt);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.28);
  line-height: 1;
}
.chip.muted { filter: saturate(0.55) brightness(0.8); }
.chip.muted .inner span { opacity: 0.75; }
.chip.selected {
  box-shadow:
    0 0 0 3px #0b1026,
    0 0 0 6px var(--gold),
    0 0 26px 4px rgba(245, 181, 68, 0.45),
    0 calc(var(--s) * 0.06) 0 color-mix(in srgb, var(--base) 55%, #000);
}
</style>
