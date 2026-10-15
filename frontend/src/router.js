import { createRouter, createWebHistory } from 'vue-router';
import { auth } from './lib/store.js';

const routes = [
  { path: '/entrar', name: 'login', component: () => import('./views/AuthView.vue'), meta: { guest: true } },
  { path: '/registro', name: 'register', component: () => import('./views/AuthView.vue'), meta: { guest: true } },
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/nueva-mesa', name: 'create', component: () => import('./views/CreateTableView.vue') },
  { path: '/unirse/:code', name: 'join', component: () => import('./views/JoinView.vue') },
  { path: '/mesa/:code', name: 'table', component: () => import('./views/TableView.vue'), meta: { immersive: true } },
  { path: '/grupos', name: 'groups', component: () => import('./views/GroupsView.vue') },
  { path: '/grupos/unirse/:code', name: 'group-join', component: () => import('./views/GroupsView.vue') },
  { path: '/grupos/:id', name: 'group', component: () => import('./views/GroupView.vue') },
  { path: '/ranking', name: 'rankings', component: () => import('./views/RankingsView.vue') },
  { path: '/perfil', name: 'profile', component: () => import('./views/ProfileView.vue') },
  { path: '/u/:username', name: 'user', component: () => import('./views/UserView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
});

router.beforeEach((to) => {
  if (!to.meta.guest && !auth.user) return { name: 'login', query: { next: to.fullPath } };
  if (to.meta.guest && auth.user) return { path: '/' };
});
