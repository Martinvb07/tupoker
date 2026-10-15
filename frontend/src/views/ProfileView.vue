<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { auth, setUser, logout, toast } from '@/lib/store.js';
import Avatar from '@/components/Avatar.vue';
import Icon from '@/components/Icon.vue';
import AvatarCropper from '@/components/AvatarCropper.vue';
import StatTiles from '@/components/StatTiles.vue';
import PlayingCard from '@/components/PlayingCard.vue';

const router = useRouter();
const form = ref({ displayName: auth.user.displayName, bio: auth.user.bio, avatarColor: auth.user.avatarColor });
const file = ref(null);
const uploading = ref(false);
const saving = ref(false);
const stats = ref(null);
const pw = ref({ current: '', next: '' });
const fileInput = ref(null);

const COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];
const FELTS = [
  { value: 'emerald', label: 'Esmeralda', a: '#1d7a52', b: '#0b4a32' },
  { value: 'royal', label: 'Real', a: '#1e4fa8', b: '#0d2763' },
  { value: 'crimson', label: 'Carmesí', a: '#9b1c34', b: '#560b1b' },
  { value: 'violet', label: 'Violeta', a: '#5b2ea6', b: '#2c1263' },
  { value: 'midnight', label: 'Noche', a: '#2a3352', b: '#121830' },
];

onMounted(async () => {
  stats.value = (await api.get('/stats/me')).stats;
});

function pickFile(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) return toast.error('Elige una imagen');
  file.value = f;
}
async function upload(blob) {
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.webp');
    setUser((await api.post('/users/me/avatar', fd)).user);
    file.value = null;
    toast.success('Foto actualizada');
  } catch (e) {
    toast.error(e.message);
  } finally {
    uploading.value = false;
  }
}
async function removeAvatar() {
  setUser((await api.del('/users/me/avatar')).user);
}
async function save() {
  saving.value = true;
  try {
    setUser((await api.patch('/users/me', form.value)).user);
    toast.success('Perfil guardado');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
async function setPref(key, value) {
  try {
    setUser((await api.patch('/users/me', { prefs: { ...auth.user.prefs, [key]: value } })).user);
  } catch (e) {
    toast.error(e.message);
  }
}
async function changePassword() {
  try {
    await api.post('/users/me/password', pw.value);
    pw.value = { current: '', next: '' };
    toast.success('Contraseña cambiada');
  } catch (e) {
    toast.error(e.message);
  }
}
async function doLogout() {
  await logout();
  router.push('/entrar');
}
</script>

<template>
  <div class="page">
    <div class="hero card rise">
      <button class="ava" @click="fileInput.click()" aria-label="Cambiar foto">
        <Avatar :user="{ ...auth.user, avatarColor: form.avatarColor }" :size="108" />
        <span class="cam"><Icon name="camera" :size="18" /></span>
      </button>
      <input ref="fileInput" type="file" accept="image/*" hidden @change="pickFile" />
      <div class="grow">
        <h1>{{ auth.user.displayName }}</h1>
        <p class="muted">@{{ auth.user.username }}</p>
        <p v-if="auth.user.bio" class="bio">{{ auth.user.bio }}</p>
        <div class="row" style="margin-top: 10px; gap: 8px; flex-wrap: wrap">
          <button class="btn btn-sm" @click="fileInput.click()"><Icon name="image" :size="16" />Cambiar foto</button>
          <button v-if="auth.user.avatarUrl" class="btn btn-sm btn-ghost" @click="removeAvatar">Quitar</button>
          <RouterLink :to="`/u/${auth.user.username}`" class="btn btn-sm btn-ghost">Ver perfil público</RouterLink>
        </div>
      </div>
    </div>

    <div class="grid cols">
      <div class="stack">
        <form class="card stack rise rise-1" @submit.prevent="save">
          <div class="card-title"><Icon name="edit" :size="18" />Personaliza tu perfil</div>
          <label class="field"><span>Nombre visible</span><input v-model="form.displayName" class="input" maxlength="30" /></label>
          <label class="field"><span>Bio</span><textarea v-model="form.bio" class="input" maxlength="160" placeholder="All-in con 7-2 desde 2019"></textarea></label>
          <div class="field">
            <span>Color de avatar</span>
            <div class="swatches">
              <button v-for="c in COLORS" :key="c" type="button" class="sw" :class="{ on: form.avatarColor === c }" :style="{ background: c }" @click="form.avatarColor = c"></button>
            </div>
          </div>
          <button class="btn btn-primary" :disabled="saving">Guardar</button>
        </form>

        <div class="card stack rise rise-2">
          <div class="card-title"><Icon name="spade" :size="18" />Mesa y cartas</div>
          <div class="field">
            <span>Color del tapete</span>
            <div class="felts">
              <button
                v-for="f in FELTS"
                :key="f.value"
                class="felt"
                :class="{ on: auth.user.prefs?.felt === f.value }"
                :style="{ background: `radial-gradient(${f.a}, ${f.b})` }"
                @click="setPref('felt', f.value)"
              >
                <span>{{ f.label }}</span>
              </button>
            </div>
          </div>
          <label class="toggle">
            <div>
              <b>Baraja de 4 colores</b>
              <div class="row small" style="gap: 4px; margin-top: 6px">
                <PlayingCard card="As" size="xs" /><PlayingCard card="Kh" size="xs" /><PlayingCard card="Qd" size="xs" /><PlayingCard card="Jc" size="xs" />
              </div>
            </div>
            <input type="checkbox" :checked="auth.user.prefs?.fourColor" @change="setPref('fourColor', $event.target.checked)" />
            <span class="knob"></span>
          </label>
        </div>

        <form class="card stack rise rise-3" @submit.prevent="changePassword">
          <div class="card-title"><Icon name="key" :size="18" />Contraseña</div>
          <input v-model="pw.current" class="input" type="password" placeholder="Contraseña actual" autocomplete="current-password" />
          <input v-model="pw.next" class="input" type="password" placeholder="Nueva contraseña" autocomplete="new-password" />
          <button class="btn" :disabled="!pw.current || !pw.next">Cambiar contraseña</button>
        </form>
        <button class="btn btn-danger" @click="doLogout"><Icon name="logout" :size="18" />Cerrar sesión</button>
      </div>

      <div class="card rise rise-2 statscard">
        <div class="card-title"><Icon name="chart" :size="18" />Mis estadísticas globales</div>
        <StatTiles v-if="stats" :stats="stats" />
        <div v-else class="skeleton" style="height: 260px"></div>
      </div>
    </div>

    <AvatarCropper :file="file" :loading="uploading" @close="file = null" @done="upload" />
  </div>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; background: radial-gradient(circle at 0% 0%, rgba(245, 181, 68, 0.14), transparent 55%), var(--surface); }
.hero h1 { font-size: 28px; font-weight: 900; }
.bio { margin-top: 6px; }
.ava { position: relative; border-radius: 50%; padding: 4px; background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); transition: transform 0.3s var(--spring); }
.ava:hover { transform: scale(1.04) rotate(-2deg); }
.cam { position: absolute; right: 2px; bottom: 2px; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-3); border: 3px solid var(--surface); }
.cols { margin-top: 16px; grid-template-columns: 1fr; }
@media (min-width: 960px) { .cols { grid-template-columns: 1fr 1.1fr; align-items: start; } .statscard { position: sticky; top: 90px; } }
.swatches { display: flex; gap: 10px; flex-wrap: wrap; }
.sw { width: 34px; height: 34px; border-radius: 50%; transition: transform 0.25s var(--spring), box-shadow 0.2s; }
.sw.on { transform: scale(1.15); box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px #fff; }
.felts { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
.felt { height: 60px; border-radius: 30px; display: grid; place-items: end center; padding-bottom: 6px; box-shadow: inset 0 0 0 4px #3b2a12; transition: transform 0.25s var(--spring), box-shadow 0.25s; }
.felt span { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: rgba(0, 0, 0, 0.4); }
.felt.on { transform: translateY(-3px); box-shadow: inset 0 0 0 4px #3b2a12, 0 0 0 2px var(--gold), 0 8px 20px -6px rgba(245, 181, 68, 0.5); }
</style>
