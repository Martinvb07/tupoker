<script setup>
import { ref, watch } from 'vue';
import QRCode from 'qrcode';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { toast } from '@/lib/store.js';

const props = defineProps({
  open: Boolean,
  code: String,
  path: { type: String, default: '/unirse/' },
  title: { type: String, default: 'Invita a la mesa' },
  subtitle: { type: String, default: 'Escanea el QR o comparte el código' },
});
defineEmits(['close']);

const qr = ref('');
const link = ref('');
watch(
  () => [props.open, props.code],
  async () => {
    if (!props.open || !props.code) return;
    link.value = `${location.origin}${props.path}${props.code}`;
    qr.value = await QRCode.toDataURL(link.value, { margin: 1, width: 520, color: { dark: '#0b1026', light: '#ffffff' } });
  },
  { immediate: true },
);

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado');
  } catch {
    toast.error('No se pudo copiar');
  }
}
async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Únete a mi mesa de póker', text: `Código: ${props.code}`, url: link.value });
    } catch { /* cancelado */ }
  } else copy(link.value);
}
</script>

<template>
  <Sheet :open="open" :title="title" :width="420" @close="$emit('close')">
    <p class="muted center">{{ subtitle }}</p>
    <div class="qr-wrap">
      <img v-if="qr" :src="qr" alt="Código QR" class="qr" />
    </div>
    <button class="code" @click="copy(code)">
      <span v-for="(ch, i) in code" :key="i" :style="{ animationDelay: i * 60 + 'ms' }">{{ ch }}</span>
    </button>
    <div class="row">
      <button class="btn grow" @click="copy(link)"><Icon name="link" :size="18" />Copiar enlace</button>
      <button class="btn btn-primary grow" @click="share"><Icon name="share" :size="18" />Compartir</button>
    </div>
  </Sheet>
</template>

<style scoped>
.center { text-align: center; }
.qr-wrap { display: grid; place-items: center; margin: 16px 0; }
.qr {
  width: min(260px, 70vw); border-radius: 22px; padding: 12px; background: #fff;
  box-shadow: 0 0 0 6px rgba(245, 181, 68, 0.25), 0 20px 50px -20px rgba(0, 0, 0, 0.8);
  animation: rise 0.5s var(--ease);
}
.code { display: flex; justify-content: center; gap: 6px; margin: 0 auto 18px; width: 100%; }
.code span {
  width: 42px; height: 52px; display: grid; place-items: center; border-radius: 12px;
  background: rgba(5, 9, 28, 0.6); border: 1px solid var(--line-2); font-size: 24px; font-weight: 900; color: var(--gold-2);
  animation: rise 0.45s var(--spring) both;
}
</style>
