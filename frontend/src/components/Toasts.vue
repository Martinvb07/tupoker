<script setup>
import { toasts } from '@/lib/store.js';
import Icon from './Icon.vue';
</script>

<template>
  <div class="toasts">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
        <Icon :name="t.type === 'error' ? 'x' : t.type === 'success' ? 'check' : 'spade'" :size="16" />
        <span>{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, calc(100% - 32px));
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(22, 31, 69, 0.95);
  border: 1px solid var(--line-2);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
  font-weight: 600;
  font-size: 14px;
}
.toast svg { flex: none; color: var(--gold); }
.toast.error svg { color: var(--red); }
.toast.success svg { color: var(--green); }
.toast-enter-active { transition: transform 0.45s var(--spring), opacity 0.3s; }
.toast-leave-active { transition: transform 0.25s ease, opacity 0.25s; }
.toast-enter-from { transform: translateY(-20px) scale(0.95); opacity: 0; }
.toast-leave-to { transform: translateY(-10px); opacity: 0; }
</style>
