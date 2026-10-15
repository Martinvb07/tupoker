<script setup>
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { dialog, answerDialog } from '@/lib/store.js';
import Icon from './Icon.vue';

const okBtn = ref(null);
const onKey = (e) => {
  if (!dialog.open) return;
  if (e.key === 'Escape') answerDialog(false);
  if (e.key === 'Enter') answerDialog(true);
};
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
watch(
  () => dialog.open,
  (o) => o && nextTick(() => okBtn.value?.focus()),
);
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div v-if="dialog.open" class="dlg-overlay" @click.self="answerDialog(false)">
        <div class="dlg" :class="{ danger: dialog.danger }" role="alertdialog" aria-modal="true">
          <div class="dlg-icon"><Icon :name="dialog.icon" :size="30" :stroke="2.2" /></div>
          <h3>{{ dialog.title }}</h3>
          <p v-if="dialog.message">{{ dialog.message }}</p>
          <div class="dlg-actions">
            <button class="btn btn-lg grow" @click="answerDialog(false)">{{ dialog.cancelLabel }}</button>
            <button ref="okBtn" class="btn btn-lg grow" :class="dialog.danger ? 'btn-danger-solid' : 'btn-primary'" @click="answerDialog(true)">
              {{ dialog.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-overlay {
  position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px;
  background: rgba(3, 6, 20, 0.7); backdrop-filter: blur(8px);
}
.dlg {
  width: min(400px, 100%); padding: 26px 22px 20px; border-radius: 26px; text-align: center;
  background: radial-gradient(circle at 50% 0%, rgba(245, 181, 68, 0.16), transparent 60%), linear-gradient(180deg, #1c2655, #131b3e);
  border: 1px solid var(--line-2); box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.85);
}
.dlg.danger { background: radial-gradient(circle at 50% 0%, rgba(244, 63, 94, 0.18), transparent 60%), linear-gradient(180deg, #1c2655, #131b3e); }
.dlg-icon {
  width: 64px; height: 64px; margin: -58px auto 12px; border-radius: 22px; display: grid; place-items: center; font-size: 30px;
  background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); box-shadow: 0 12px 30px -8px rgba(245, 181, 68, 0.7), 0 0 0 6px #131b3e;
  animation: bob 0.6s var(--spring) both 0.1s;
}
.danger .dlg-icon { background: linear-gradient(135deg, #fb7185, #be123c); box-shadow: 0 12px 30px -8px rgba(244, 63, 94, 0.7), 0 0 0 6px #131b3e; }
@keyframes bob { from { transform: translateY(14px) scale(0.6) rotate(-12deg); opacity: 0; } }
h3 { font-size: 20px; font-weight: 800; }
p { color: var(--text-2); margin-top: 8px; line-height: 1.5; }
.dlg-actions { display: flex; gap: 10px; margin-top: 22px; }
.btn-danger-solid { background: linear-gradient(180deg, #fb7185, #e11d48); color: #fff; border-color: transparent; box-shadow: 0 10px 24px -10px rgba(244, 63, 94, 0.8); }

.dlg-enter-active { transition: background 0.3s, backdrop-filter 0.3s; }
.dlg-enter-active .dlg { transition: transform 0.45s var(--spring), opacity 0.25s; }
.dlg-leave-active { transition: background 0.2s, backdrop-filter 0.2s; }
.dlg-leave-active .dlg { transition: transform 0.2s ease-in, opacity 0.2s; }
.dlg-enter-from, .dlg-leave-to { background: transparent; backdrop-filter: blur(0); }
.dlg-enter-from .dlg { transform: translateY(30px) scale(0.9); opacity: 0; }
.dlg-leave-to .dlg { transform: scale(0.95); opacity: 0; }
</style>
