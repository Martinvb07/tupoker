<script setup>
import { computed } from 'vue';

const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 40 },
  ring: { type: Boolean, default: false },
});

const initials = computed(() => {
  const n = props.user?.displayName || props.user?.username || '?';
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
});
</script>

<template>
  <div
    class="avatar"
    :class="{ ring }"
    :style="{ width: size + 'px', height: size + 'px', '--c': user?.avatarColor || '#6366f1', fontSize: size * 0.38 + 'px' }"
  >
    <img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="user.displayName" loading="lazy" />
    <span v-else>{{ initials }}</span>
  </div>
</template>

<style scoped>
.avatar {
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 55%, color-mix(in srgb, var(--c) 60%, #000));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  letter-spacing: 0.02em;
}
.avatar.ring { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--c); }
img { width: 100%; height: 100%; object-fit: cover; }
</style>
