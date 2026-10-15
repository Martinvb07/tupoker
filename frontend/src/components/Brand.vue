<script setup>
// Logo de TuPoker: la ficha con la pica + el nombre.
defineProps({ size: { type: Number, default: 36 }, text: { type: Boolean, default: true } });
</script>

<template>
  <span class="brand-mark">
    <img src="/favicon.svg" :width="size" :height="size" alt="" class="mark" />
    <span v-if="text" class="word" :style="{ fontSize: size * 0.56 + 'px' }">Tu<b>Poker</b></span>
  </span>
</template>

<style scoped>
.brand-mark { display: inline-flex; align-items: center; gap: 10px; }
.mark { border-radius: 26%; box-shadow: 0 8px 20px -8px rgba(245, 181, 68, 0.55); flex: none; }
.word { font-weight: 800; letter-spacing: -0.02em; color: var(--text); line-height: 1; }
.word b { font-weight: 900; background: linear-gradient(180deg, var(--gold-2), var(--gold) 55%, var(--gold-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
</style>
