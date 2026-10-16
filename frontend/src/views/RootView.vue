<script setup>
// La portada "/": landing para visitantes (lo que indexa Google) e inicio para quien ya tiene sesión.
import { defineAsyncComponent } from 'vue';
import { auth } from '@/lib/store.js';

const HomeView = defineAsyncComponent(() => import('./HomeView.vue'));
const LandingView = defineAsyncComponent(() => import('./LandingView.vue'));
</script>

<template>
  <HomeView v-if="auth.user" />
  <LandingView v-else />
</template>
