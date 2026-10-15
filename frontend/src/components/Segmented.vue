<script setup>
// Selector segmentado con indicador animado.
import { computed, nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: [String, Number],
  options: { type: Array, required: true }, // [{ value, label }]
  scroll: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const indicator = ref({ left: 0, width: 0 });
const index = computed(() => props.options.findIndex((o) => o.value === props.modelValue));

function measure() {
  const el = root.value?.querySelectorAll('button')[index.value];
  if (el) indicator.value = { left: el.offsetLeft, width: el.offsetWidth };
}
onMounted(() => nextTick(measure));
watch(() => [props.modelValue, props.options.length], () => nextTick(measure));
</script>

<template>
  <div ref="root" class="seg" :class="{ scroll }">
    <div class="ind" :style="{ transform: `translateX(${indicator.left}px)`, width: indicator.width + 'px' }"></div>
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :class="{ on: o.value === modelValue }"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  position: relative;
  display: inline-flex;
  padding: 4px;
  gap: 2px;
  border-radius: 14px;
  background: rgba(5, 9, 28, 0.55);
  border: 1px solid var(--line);
  max-width: 100%;
}
.seg.scroll { overflow-x: auto; scrollbar-width: none; }
.seg.scroll::-webkit-scrollbar { display: none; }
.ind {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
  box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: transform 0.4s var(--ease), width 0.4s var(--ease);
}
button {
  position: relative;
  z-index: 1;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-2);
  white-space: nowrap;
  transition: color 0.2s;
}
button.on { color: var(--text); }
</style>
