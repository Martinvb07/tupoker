import { reactive, watch } from 'vue';
import { api } from './api.js';

export const auth = reactive({ user: null, ready: false });

export async function loadMe() {
  try {
    const { user } = await api.get('/auth/me');
    auth.user = user;
  } catch {
    auth.user = null;
  }
  auth.ready = true;
}

export function setUser(user) {
  auth.user = user;
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  auth.user = null;
}

// Aplica el color de tapete elegido por el usuario
watch(
  () => auth.user?.prefs?.felt,
  (felt) => document.documentElement.setAttribute('data-felt', felt || 'emerald'),
  { immediate: true },
);

// ---------- Toasts ----------
export const toasts = reactive([]);
let tid = 0;
export function toast(message, type = 'info', ms = 3200) {
  const id = ++tid;
  toasts.push({ id, message, type });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}
toast.error = (m) => toast(m, 'error', 4200);
toast.success = (m) => toast(m, 'success');
