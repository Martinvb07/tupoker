<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { toast, ask } from '@/lib/store.js';
import { formatChips, modeInfo, noChips, stakes } from '@/lib/format.js';
import Icon, { GROUP_ICONS } from '@/components/Icon.vue';
import Sheet from '@/components/Sheet.vue';
import SettingsForm from '@/components/SettingsForm.vue';
import QrScanner from '@/components/QrScanner.vue';

const route = useRoute();
const router = useRouter();
const groups = ref(null);
const showCreate = ref(false);
const joinCode = ref('');
const loading = ref(false);
const scanning = ref(false);

async function removeGroup(g) {
  if (!(await ask({ title: `¿Eliminar "${g.name}"?`, message: 'Se cierra su mesa y desaparece para todos. Las manos jugadas siguen en el ranking general.', confirmLabel: 'Eliminar grupo', danger: true }))) return;
  try {
    await api.del('/groups/' + g.id);
    groups.value = groups.value.filter((x) => x.id !== g.id);
    toast.success('Grupo eliminado');
  } catch (e) {
    toast.error(e.message);
  }
}

const EMOJIS = GROUP_ICONS;
const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const form = ref({ name: '', description: '', emoji: 'spade', color: '#10b981', defaults: { minBet: 100, maxBet: 0, startingChips: 10000, mode: 'live', chips: [] } });

async function load() {
  groups.value = (await api.get('/groups')).groups;
}
onMounted(async () => {
  if (route.params.code) {
    try {
      const { id } = await api.post('/groups/join', { code: route.params.code });
      toast.success('¡Te has unido al grupo!');
      return router.replace(`/grupos/${id}`);
    } catch (e) {
      toast.error(e.message);
    }
  }
  load();
});

async function create() {
  loading.value = true;
  try {
    const { group } = await api.post('/groups', form.value);
    router.push(`/grupos/${group.id}`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
async function join() {
  try {
    const { id } = await api.post('/groups/join', { code: joinCode.value });
    router.push(`/grupos/${id}`);
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head rise">
      <div>
        <div class="eyebrow">Grupos de juego</div>
        <h1>Tu gente, tu mesa</h1>
        <p>Guarda la configuración, abre la mesa con un toque y compite en el ranking del grupo.</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = true"><Icon name="plus" :size="18" />Crear grupo</button>
    </div>

    <form class="card joinbar rise rise-1" @submit.prevent="join">
      <Icon name="link" />
      <input v-model="joinCode" class="input input-code grow" maxlength="8" placeholder="CÓDIGO DE GRUPO" />
      <button class="btn">Unirme</button>
      <button type="button" class="icon-btn" title="Escanear QR" @click="scanning = true"><Icon name="camera" :size="18" /></button>
    </form>

    <div v-if="groups === null" class="grid grid-2" style="margin-top: 16px">
      <div class="skeleton" style="height: 150px"></div>
      <div class="skeleton" style="height: 150px"></div>
    </div>
    <div v-else-if="!groups.length" class="card empty" style="margin-top: 16px">
      <div class="big"><Icon name="users" :size="40" :stroke="1.6" /></div>
      Aún no tienes grupos. ¡Crea el primero e invita a tus amigos!
    </div>
    <TransitionGroup v-else tag="div" name="list" class="grid grid-2 list">
      <RouterLink v-for="g in groups" :key="g.id" :to="`/grupos/${g.id}`" class="card hover gcard" :style="{ '--gc': g.color }">
        <div class="row">
          <span class="ge"><Icon :name="g.emoji || 'spade'" :size="24" /></span>
          <div class="grow">
            <h3 class="ellipsis">{{ g.name }}</h3>
            <div class="small muted">{{ g.members }} miembros</div>
          </div>
          <span v-if="g.activeTableCode" class="badge badge-green">● En juego</span>
          <button v-if="g.isOwner" class="icon-btn del" title="Eliminar grupo" @click.prevent.stop="removeGroup(g)"><Icon name="trash" :size="16" /></button>
        </div>
        <p v-if="g.description" class="desc muted small">{{ g.description }}</p>
        <div class="row tags">
          <span class="badge"><Icon :name="modeInfo(g.defaults.mode).icon" :size="12" />{{ modeInfo(g.defaults.mode).short }}</span>
          <template v-if="!noChips(g.defaults.mode)">
            <span class="badge">{{ stakes(g.defaults) }}</span>
            <span class="badge">{{ formatChips(g.defaults.startingChips) }} fichas</span>
          </template>
        </div>
      </RouterLink>
    </TransitionGroup>

    <Sheet :open="showCreate" title="Nuevo grupo" :width="560" @close="showCreate = false">
      <form class="stack" @submit.prevent="create">
        <div class="preview" :style="{ '--gc': form.color }">
          <span class="ge big"><Icon :name="form.emoji" :size="30" /></span>
          <b>{{ form.name || 'Nombre del grupo' }}</b>
        </div>
        <label class="field">
          <span>Nombre</span>
          <input v-model="form.name" class="input" maxlength="40" placeholder="Los del viernes" required />
        </label>
        <label class="field">
          <span>Descripción</span>
          <input v-model="form.description" class="input" maxlength="200" placeholder="Opcional" />
        </label>
        <div class="field">
          <span>Icono</span>
          <div class="picker">
            <button v-for="e in EMOJIS" :key="e" type="button" class="pk" :class="{ on: form.emoji === e }" @click="form.emoji = e"><Icon :name="e" :size="20" /></button>
          </div>
        </div>
        <div class="field">
          <span>Color</span>
          <div class="picker">
            <button v-for="c in COLORS" :key="c" type="button" class="sw" :class="{ on: form.color === c }" :style="{ background: c }" @click="form.color = c"></button>
          </div>
        </div>
        <div class="divider"></div>
        <div class="eyebrow">Mesa por defecto</div>
        <SettingsForm v-model="form.defaults" />
        <button class="btn btn-primary btn-lg btn-block" :disabled="loading">Crear grupo</button>
      </form>
    </Sheet>
    <QrScanner :open="scanning" @close="scanning = false" />
  </div>
</template>

<style scoped>
.joinbar { display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 18px; }
.joinbar .input { height: 44px; font-size: 16px; }
.joinbar svg { color: var(--text-3); flex: none; }
.joinbar .icon-btn svg { color: var(--text); }
.del { width: 34px; height: 34px; border-radius: 10px; flex: none; }
.del:hover { background: rgba(244, 63, 94, 0.2); color: #fecdd3; }
.list { margin-top: 16px; }
.gcard { background: radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--gc) 26%, transparent), transparent 55%), var(--surface); display: flex; flex-direction: column; gap: 10px; }
.gcard h3 { font-size: 18px; font-weight: 800; }
.ge { width: 50px; height: 50px; border-radius: 16px; display: grid; place-items: center; font-size: 26px; flex: none; background: color-mix(in srgb, var(--gc) 22%, transparent); border: 1px solid color-mix(in srgb, var(--gc) 45%, transparent); }
.ge.big { width: 64px; height: 64px; font-size: 32px; }
.tags { flex-wrap: wrap; gap: 6px; }
.preview { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 18px; background: radial-gradient(circle at 0% 50%, color-mix(in srgb, var(--gc) 25%, transparent), transparent 70%); border: 1px solid var(--line); font-size: 18px; transition: background 0.4s; }
.picker { display: flex; flex-wrap: wrap; gap: 8px; }
.pk { width: 44px; height: 44px; border-radius: 12px; font-size: 22px; background: rgba(5, 9, 28, 0.5); border: 1px solid var(--line); transition: all 0.25s var(--spring); }
.pk.on { border-color: var(--gold); transform: scale(1.1); background: rgba(245, 181, 68, 0.12); }
.sw { width: 36px; height: 36px; border-radius: 50%; transition: transform 0.25s var(--spring), box-shadow 0.25s; }
.sw.on { transform: scale(1.12); box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px #fff; }
</style>
