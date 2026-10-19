<script setup>
// Botones de chat y reacciones en línea (barra del jugador en vivo y barra de tu asiento en móvil).
import { ref } from 'vue';
import Icon from './Icon.vue';

defineProps({
  emojis: { type: Array, required: true },
  unread: { type: Number, default: 0 },
  chat: { type: Boolean, default: true }, // en PC el chat ya está fijo a la derecha
  up: Boolean, // el menú de emojis se abre hacia arriba
});
const emit = defineEmits(['chat', 'react']);
const open = ref(false);
function pick(e) {
  open.value = false;
  emit('react', e);
}
</script>

<template>
  <div class="rbtns">
    <button v-if="chat" class="icon-btn rb chat-btn" aria-label="Abrir chat" @click="emit('chat')">
      <Icon name="mail" :size="19" />
      <Transition name="pop"><i v-if="unread" class="chat-badge">{{ unread > 9 ? '9+' : unread }}</i></Transition>
    </button>
    <button class="icon-btn rb" :class="{ on: open }" aria-label="Enviar reacción" @click="open = !open">
      <Icon :name="open ? 'x' : 'smile'" :size="19" />
    </button>
    <Transition name="pop">
      <div v-if="open" class="pop" :class="{ up }">
        <button v-for="e in emojis" :key="e" class="opt" @click="pick(e)">{{ e }}</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.rbtns { position: relative; display: flex; gap: 8px; flex: none; }
.rb { width: 42px; height: 42px; border-radius: 50%; background: rgba(22, 31, 69, 0.9); border-color: var(--line-2); }
.rb.on { background: var(--surface-3); }
.chat-btn { position: relative; }
.chat-badge {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 99px; font-style: normal;
  background: var(--red); color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 0 0 2px var(--bg);
}
.pop {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 40;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 8px; border-radius: 18px;
  background: rgba(22, 31, 69, 0.97); border: 1px solid var(--line-2); box-shadow: var(--shadow-lg); backdrop-filter: blur(10px);
  transform-origin: top right;
}
.pop.up { top: auto; bottom: calc(100% + 8px); transform-origin: bottom right; }
.opt { width: 46px; height: 46px; border-radius: 12px; font-size: 26px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; transition: transform 0.2s var(--spring), background 0.2s; }
.opt:hover { background: rgba(255, 255, 255, 0.08); }
.opt:active { transform: scale(0.85); }
</style>
