<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/lib/api.js';
import Avatar from '@/components/Avatar.vue';
import StatTiles from '@/components/StatTiles.vue';

const route = useRoute();
const data = ref(null);
const error = ref('');

watch(
  () => route.params.username,
  async (u) => {
    if (!u) return;
    data.value = null;
    try {
      data.value = await api.get(`/users/${u}`);
    } catch (e) {
      error.value = e.message;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="page">
    <div v-if="error" class="card empty">{{ error }}</div>
    <template v-else-if="data">
      <div class="hero card rise">
        <Avatar :user="data.user" :size="96" ring />
        <div>
          <h1>{{ data.user.displayName }}</h1>
          <p class="muted">@{{ data.user.username }}</p>
          <p v-if="data.user.bio" class="bio">{{ data.user.bio }}</p>
        </div>
      </div>
      <div class="card rise rise-1" style="margin-top: 16px">
        <div class="card-title">Estadísticas</div>
        <StatTiles :stats="data.stats" />
      </div>
    </template>
    <div v-else class="skeleton" style="height: 200px"></div>
  </div>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; background: radial-gradient(circle at 0% 0%, color-mix(in srgb, v-bind('data?.user?.avatarColor || "#6366f1"') 30%, transparent), transparent 55%), var(--surface); }
.hero h1 { font-size: 28px; font-weight: 900; }
.bio { margin-top: 6px; }
</style>
