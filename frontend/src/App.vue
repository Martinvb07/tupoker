<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, logout, toast } from '@/lib/store.js';
import { getSocket, resetSocket } from '@/lib/socket.js';
import Toasts from '@/components/Toasts.vue';
import Avatar from '@/components/Avatar.vue';
import Icon from '@/components/Icon.vue';

const route = useRoute();
const router = useRouter();

const nav = [
  { to: '/', label: 'Inicio', icon: 'home', name: 'home' },
  { to: '/grupos', label: 'Grupos', icon: 'users', name: 'groups' },
  { to: '/nueva-mesa', label: 'Mesa', icon: 'plus', name: 'create', primary: true },
  { to: '/ranking', label: 'Ranking', icon: 'trophy', name: 'rankings' },
  { to: '/perfil', label: 'Perfil', icon: 'user', name: 'profile' },
];
const showNav = computed(() => auth.user && !route.meta.guest && !route.meta.immersive);
const isActive = (item) => route.name === item.name || (item.name === 'groups' && route.name === 'group');

function onTableOpened(p) {
  toast(`${p.by} abrió la mesa de ${p.group}`, 'info', 6000);
}
watch(
  () => auth.user?.id,
  (id) => {
    if (id) getSocket().on('group:table-opened', onTableOpened);
    else resetSocket();
  },
  { immediate: true },
);

async function doLogout() {
  await logout();
  router.push('/entrar');
}
onMounted(() => document.body.classList.add('ready'));
</script>

<template>
  <div class="app" :class="{ withnav: showNav }">
    <header v-if="showNav" class="topnav">
      <div class="inner">
        <RouterLink to="/" class="brand">
          <span class="logo">♠</span>
          <span class="bname">Royal<b>Flush</b></span>
        </RouterLink>
        <nav class="links">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="lnk" :class="{ on: isActive(n), primary: n.primary }">
            <Icon :name="n.icon" :size="18" />{{ n.primary ? 'Nueva mesa' : n.label }}
          </RouterLink>
        </nav>
        <div class="me">
          <RouterLink to="/perfil" class="row mini-me">
            <Avatar :user="auth.user" :size="34" />
            <span class="ellipsis">{{ auth.user.displayName }}</span>
          </RouterLink>
          <button class="icon-btn" title="Cerrar sesión" @click="doLogout"><Icon name="logout" :size="18" /></button>
        </div>
      </div>
    </header>

    <RouterView v-slot="{ Component, route: r }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="r.name === 'table' ? r.fullPath : r.name" />
      </Transition>
    </RouterView>

    <nav v-if="showNav" class="tabbar">
      <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="tab" :class="{ on: isActive(n), primary: n.primary }">
        <span class="ti"><Icon :name="n.icon" :size="n.primary ? 24 : 21" /></span>
        <span v-if="!n.primary" class="tl">{{ n.label }}</span>
      </RouterLink>
    </nav>

    <Toasts />
  </div>
</template>

<style scoped>
.topnav { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(14px); background: rgba(11, 16, 38, 0.72); border-bottom: 1px solid var(--line); display: none; }
.inner { max-width: 1180px; margin: 0 auto; padding: 0 28px; height: 68px; display: flex; align-items: center; gap: 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 19px; }
.logo {
  width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; font-size: 20px; color: #2a1700;
  background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); box-shadow: 0 6px 16px -6px rgba(245, 181, 68, 0.7);
}
.bname b { color: var(--gold); font-weight: 800; }
.links { display: flex; gap: 4px; flex: 1; justify-content: center; }
.lnk { display: flex; align-items: center; gap: 7px; height: 40px; padding: 0 14px; border-radius: 12px; font-weight: 600; color: var(--text-2); transition: all 0.2s; }
.lnk:hover { color: var(--text); background: rgba(255, 255, 255, 0.05); }
.lnk.on { color: var(--text); background: rgba(255, 255, 255, 0.08); }
.lnk.primary { color: #2a1700; background: linear-gradient(180deg, var(--gold-2), var(--gold)); margin-left: 6px; }
.me { display: flex; align-items: center; gap: 10px; }
.mini-me { font-weight: 600; max-width: 180px; }

.tabbar {
  position: fixed; left: 10px; right: 10px; bottom: calc(10px + var(--safe-b)); z-index: 60;
  height: var(--nav-h); border-radius: 22px; display: grid; grid-template-columns: repeat(5, 1fr); align-items: center;
  background: rgba(17, 24, 56, 0.86); backdrop-filter: blur(16px); border: 1px solid var(--line-2); box-shadow: var(--shadow-lg);
}
.tab { display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--text-3); font-size: 11px; font-weight: 600; transition: color 0.2s; }
.tab .ti { display: grid; place-items: center; transition: transform 0.35s var(--spring); }
.tab.on { color: var(--gold-2); }
.tab.on .ti { transform: translateY(-2px); }
.tab.primary .ti {
  width: 52px; height: 52px; border-radius: 18px; margin-top: -24px; color: #2a1700;
  background: linear-gradient(180deg, var(--gold-2), var(--gold) 50%, var(--gold-deep));
  box-shadow: 0 10px 24px -8px rgba(245, 181, 68, 0.8), 0 0 0 5px var(--bg);
}
.tab.primary:active .ti { transform: scale(0.92); }

@media (min-width: 900px) {
  .topnav { display: block; }
  .tabbar { display: none; }
}
</style>
