<script setup>
import { useRouter } from 'vue-router';
import { toasts, dismissToast } from '@/lib/store.js';
import Icon from './Icon.vue';

const router = useRouter();
function go(t) {
  dismissToast(t.id);
  router.push(t.action.to);
}
</script>

<template>
  <div class="toasts">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="[t.type, { act: t.action }]">
        <Icon :name="t.type === 'error' ? 'x' : t.type === 'success' ? 'check' : 'spade'" :size="16" />
        <span class="grow">{{ t.message }}</span>
        <button v-if="t.action" class="tbtn" @click="go(t)">{{ t.action.label }}</button>
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
.toast.act { pointer-events: auto; border-color: rgba(245, 181, 68, 0.5); padding: 8px 8px 8px 16px; }
.toast svg { flex: none; color: var(--gold); }
.toast.error svg { color: var(--red); }
.toast.success svg { color: var(--green); }
.tbtn {
  flex: none; height: 34px; padding: 0 14px; border-radius: 10px; font-weight: 800; color: #2a1700;
  background: linear-gradient(180deg, var(--gold-2), var(--gold));
}
.toast-enter-active { transition: transform 0.45s var(--spring), opacity 0.3s; }
.toast-leave-active { transition: transform 0.25s ease, opacity 0.25s; }
.toast-enter-from { transform: translateY(-20px) scale(0.95); opacity: 0; }
.toast-leave-to { transform: translateY(-10px); opacity: 0; }
</style>
