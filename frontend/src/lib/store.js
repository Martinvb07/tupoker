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
/** action opcional: { label, to } → botón en el aviso que lleva a esa ruta */
export function toast(message, type = 'info', ms = 3200, action = null) {
  const id = ++tid;
  toasts.push({ id, message, type, action });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}
toast.error = (m) => toast(m, 'error', 4200);
toast.success = (m) => toast(m, 'success');
export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

// ---------- Confirmaciones (modal propio en vez del confirm() del navegador) ----------
export const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Aceptar', cancelLabel: 'Cancelar', danger: false, icon: '' });
let resolveDialog = null;
/** Muestra el modal y resuelve true/false según lo que elija el usuario. */
export function ask({ title, message = '', confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false, icon = '' }) {
  if (resolveDialog) resolveDialog(false);
  Object.assign(dialog, { open: true, title, message, confirmLabel, cancelLabel, danger, icon: icon || (danger ? 'alert' : 'spade') });
  return new Promise((res) => (resolveDialog = res));
}
export function answerDialog(value) {
  dialog.open = false;
  resolveDialog?.(value);
  resolveDialog = null;
}

// solicitudes de amistad pendientes (insignia en la navegación)
export const social = reactive({ incoming: 0 });
