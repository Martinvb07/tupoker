<script setup>
// Modal que en móvil se comporta como bottom-sheet.
import { onMounted, onUnmounted, watch } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  open: Boolean,
  title: String,
  width: { type: Number, default: 520 },
});
const emit = defineEmits(['close']);

const onKey = (e) => e.key === 'Escape' && props.open && emit('close');
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
watch(
  () => props.open,
  (o) => (document.body.style.overflow = o ? 'hidden' : ''),
);
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="sheet" :style="{ '--w': width + 'px' }" role="dialog" aria-modal="true">
          <div class="grab"></div>
          <header v-if="title || $slots.head">
            <slot name="head"><h3>{{ title }}</h3></slot>
            <button class="icon-btn" aria-label="Cerrar" @click="emit('close')"><Icon name="x" /></button>
          </header>
          <div class="body"><slot /></div>
          <footer v-if="$slots.footer"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(3, 6, 20, 0.62);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1b2550, #131b3e);
  border: 1px solid var(--line-2);
  border-bottom: 0;
  border-radius: 26px 26px 0 0;
  box-shadow: var(--shadow-lg);
  padding-bottom: var(--safe-b);
}
.grab { width: 42px; height: 5px; border-radius: 9px; background: rgba(255, 255, 255, 0.2); margin: 10px auto 0; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px 6px; }
header h3 { font-size: 19px; font-weight: 800; }
.body { padding: 12px 20px 20px; overflow-y: auto; overscroll-behavior: contain; }
footer { padding: 12px 20px 18px; border-top: 1px solid var(--line); display: flex; gap: 10px; }
@media (min-width: 700px) {
  .overlay { align-items: center; padding: 24px; }
  .sheet { width: min(var(--w), 100%); border-radius: 26px; border-bottom: 1px solid var(--line-2); padding-bottom: 0; }
  .grab { display: none; }
  header { padding-top: 20px; }
}

.sheet-enter-active, .sheet-leave-active { transition: background 0.3s, backdrop-filter 0.3s; }
.sheet-enter-active .sheet { transition: transform 0.5s var(--ease), opacity 0.3s; }
.sheet-leave-active .sheet { transition: transform 0.25s ease-in, opacity 0.2s; }
.sheet-enter-from, .sheet-leave-to { background: transparent; backdrop-filter: blur(0); }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(100%); }
@media (min-width: 700px) {
  .sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(24px) scale(0.96); opacity: 0; }
}
</style>
