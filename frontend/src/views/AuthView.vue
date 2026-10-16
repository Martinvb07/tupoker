<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { setUser, toast } from '@/lib/store.js';
import { resetSocket } from '@/lib/socket.js';
import PlayingCard from '@/components/PlayingCard.vue';
import Chip from '@/components/Chip.vue';
import Brand from '@/components/Brand.vue';

const route = useRoute();
const router = useRouter();
const isRegister = computed(() => route.name === 'register');

const form = ref({ username: '', password: '', displayName: '' });
const loading = ref(false);
const showPass = ref(false);

async function submit() {
  loading.value = true;
  try {
    const { user } = await api.post(isRegister.value ? '/auth/register' : '/auth/login', form.value);
    setUser(user);
    resetSocket();
    toast.success(isRegister.value ? `¡Bienvenido, ${user.displayName}!` : `Hola de nuevo, ${user.displayName}`);
    router.replace(String(route.query.next || '/'));
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth">
    <div class="hero">
      <div class="deco">
        <div class="c c1"><PlayingCard card="As" size="lg" /></div>
        <div class="c c2"><PlayingCard card="Kh" size="lg" /></div>
        <div class="ch ch1"><Chip :value="5000" :index="0" :size="70" /></div>
        <div class="ch ch2"><Chip :value="25000" :index="1" :size="56" /></div>
        <div class="ch ch3"><Chip :value="1000000" :index="5" :size="48" /></div>
      </div>
      <RouterLink to="/" class="hero-brand"><Brand :size="64" /></RouterLink>
      <p>Lleva las partidas con tus amigos al siguiente nivel: fichas, turnos, probabilidades y rankings en tiempo real.</p>
    </div>

    <form class="panel card" @submit.prevent="submit">
      <Transition name="fade" mode="out-in">
        <div :key="isRegister" class="stack">
          <div>
            <div class="eyebrow">{{ isRegister ? 'Crea tu cuenta' : 'Bienvenido' }}</div>
            <h2>{{ isRegister ? 'Siéntate a la mesa' : 'Entra a jugar' }}</h2>
          </div>
          <label class="field">
            <span>Usuario</span>
            <input v-model.trim="form.username" class="input" autocomplete="username" autocapitalize="none" placeholder="tu_usuario" required />
          </label>
          <label v-if="isRegister" class="field">
            <span>Nombre visible <i class="faint">(opcional)</i></span>
            <input v-model="form.displayName" class="input" maxlength="30" placeholder="Cómo te verán en la mesa" />
          </label>
          <label class="field">
            <span>Contraseña</span>
            <div class="pw">
              <input v-model="form.password" class="input" :type="showPass ? 'text' : 'password'" :autocomplete="isRegister ? 'new-password' : 'current-password'" placeholder="••••••" required />
              <button type="button" class="eye" @click="showPass = !showPass">{{ showPass ? 'Ocultar' : 'Ver' }}</button>
            </div>
          </label>
          <button class="btn btn-primary btn-lg btn-block" :disabled="loading">
            <span v-if="loading" class="spinner"></span>
            <template v-else>{{ isRegister ? 'Crear cuenta' : 'Entrar' }}</template>
          </button>
          <p class="switch muted">
            <template v-if="isRegister">¿Ya tienes cuenta? <RouterLink :to="{ name: 'login', query: route.query }">Inicia sesión</RouterLink></template>
            <template v-else>¿Nuevo por aquí? <RouterLink :to="{ name: 'register', query: route.query }">Crea una cuenta</RouterLink></template>
          </p>
        </div>
      </Transition>
    </form>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100dvh; display: grid; align-items: center; justify-items: center; gap: 28px; padding: 32px 16px;
  grid-template-columns: 1fr;
}
.hero { text-align: center; max-width: 460px; }
.hero-brand { display: inline-block; margin-bottom: 4px; }
.hero-brand :deep(.word) { font-size: clamp(34px, 7vw, 48px) !important; }
.hero h1 { font-size: clamp(40px, 8vw, 64px); font-weight: 900; letter-spacing: -0.03em; }
.hero h1 span { background: linear-gradient(180deg, var(--gold-2), var(--gold-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero p { color: var(--text-2); margin-top: 10px; font-size: 16px; }
.deco { position: relative; height: 150px; margin-bottom: 16px; }
.c, .ch { position: absolute; left: 50%; top: 50%; }
.c1 { transform: translate(-80%, -50%) rotate(-12deg); animation: float 6s ease-in-out infinite; }
.c2 { transform: translate(-10%, -48%) rotate(10deg); animation: float 6s ease-in-out infinite 0.6s; }
.ch1 { transform: translate(60%, 0%); animation: float 5s ease-in-out infinite 0.3s; }
.ch2 { transform: translate(-190%, 10%); animation: float 5.5s ease-in-out infinite 1s; }
.ch3 { transform: translate(140%, -110%); animation: float 7s ease-in-out infinite 0.2s; }
@keyframes float { 0%, 100% { margin-top: 0; } 50% { margin-top: -10px; } }
.panel { width: 100%; max-width: 420px; padding: 26px; animation: rise 0.6s var(--ease); }
.panel h2 { font-size: 26px; font-weight: 800; margin-top: 4px; }
.pw { position: relative; }
.eye { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 13px; font-weight: 700; color: var(--text-2); padding: 6px 10px; border-radius: 8px; }
.eye:hover { background: rgba(255, 255, 255, 0.06); }
.switch { text-align: center; }
.switch a { color: var(--gold-2); font-weight: 700; }
@media (min-width: 900px) {
  .auth { grid-template-columns: 1fr 1fr; max-width: 1100px; margin: 0 auto; gap: 60px; }
  .hero { text-align: left; }
  .deco { height: 200px; }
}
</style>
