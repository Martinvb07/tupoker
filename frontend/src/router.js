import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './lib/store.js';

// meta.title / meta.description: SEO por página. meta.index: solo esas se pueden indexar.
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('./views/RootView.vue'),
    meta: { public: true, index: true },
  },
  { path: '/bienvenido', redirect: '/' },
  {
    path: '/entrar',
    name: 'login',
    component: () => import('./views/AuthView.vue'),
    meta: { guest: true, index: true, title: 'Entrar', description: 'Entra en TuPoker y vuelve a tu mesa de póker con amigos.' },
  },
  {
    path: '/registro',
    name: 'register',
    component: () => import('./views/AuthView.vue'),
    meta: { guest: true, index: true, title: 'Crear cuenta gratis', description: 'Crea tu cuenta gratis en TuPoker y monta tu mesa de póker con amigos en un minuto.' },
  },
  { path: '/nueva-mesa', name: 'create', component: () => import('./views/CreateTableView.vue'), meta: { title: 'Nueva mesa' } },
  { path: '/unirse/:code', name: 'join', component: () => import('./views/JoinView.vue'), meta: { title: 'Unirse a la mesa' } },
  { path: '/mesa/:code', name: 'table', component: () => import('./views/TableView.vue'), meta: { immersive: true, title: 'Mesa' } },
  { path: '/grupos', name: 'groups', component: () => import('./views/GroupsView.vue'), meta: { title: 'Grupos' } },
  { path: '/grupos/unirse/:code', name: 'group-join', component: () => import('./views/GroupsView.vue'), meta: { title: 'Unirse al grupo' } },
  { path: '/grupos/:id', name: 'group', component: () => import('./views/GroupView.vue'), meta: { title: 'Grupo' } },
  { path: '/ranking', name: 'rankings', component: () => import('./views/RankingsView.vue'), meta: { title: 'Ranking' } },
  { path: '/amigos', name: 'friends', component: () => import('./views/FriendsView.vue'), meta: { title: 'Amigos' } },
  { path: '/perfil', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: 'Mi perfil' } },
  { path: '/u/:username', name: 'user', component: () => import('./views/UserView.vue'), meta: { title: 'Perfil' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
});

router.beforeEach((to) => {
  // la portada es pública (landing); el resto de páginas privadas piden entrar y vuelven después
  if (!to.meta.guest && !to.meta.public && !auth.user) return { name: 'login', query: { next: to.fullPath } };
  if (to.meta.guest && auth.user) return { path: '/' };
});

// ---------- SEO por página ----------
const DEFAULT_TITLE = document.title;
const DEFAULT_DESC = document.querySelector('meta[name="description"]')?.content || '';
const setMeta = (sel, attr, value) => {
  const el = document.querySelector(sel);
  if (el) el.setAttribute(attr, value);
};
router.afterEach((to) => {
  const title = to.meta.title ? `${to.meta.title} · TuPoker` : DEFAULT_TITLE;
  const desc = to.meta.description || DEFAULT_DESC;
  const url = `https://tupoker.online${to.path === '/' ? '/' : to.path}`;
  document.title = title;
  setMeta('meta[name="description"]', 'content', desc);
  setMeta('link[rel="canonical"]', 'href', url);
  setMeta('meta[property="og:url"]', 'content', url);
  // las páginas privadas (mesas, perfiles, grupos...) no deben salir en buscadores
  setMeta('meta[name="robots"]', 'content', to.meta.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
});
