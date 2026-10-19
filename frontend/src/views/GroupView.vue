<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { auth, toast, ask } from '@/lib/store.js';
import { formatChips, timeAgo, modeInfo, noChips } from '@/lib/format.js';
import Icon from '@/components/Icon.vue';
import Avatar from '@/components/Avatar.vue';
import Segmented from '@/components/Segmented.vue';
import SettingsForm from '@/components/SettingsForm.vue';
import RankingList from '@/components/RankingList.vue';
import StatTiles from '@/components/StatTiles.vue';
import ShareSheet from '@/components/ShareSheet.vue';
import PlayingCard from '@/components/PlayingCard.vue';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id);

const g = ref(null);
const tab = ref('mesa');
const ranking = ref(null);
const metric = ref('net');
const history = ref(null);
const myStats = ref(null);
const showInvite = ref(false);
const opening = ref(false);
const addUser = ref('');
const edit = ref(null);

const isAdmin = computed(() => g.value?.myRole === 'admin');
const tabs = computed(() => [
  { value: 'mesa', label: 'Mesa' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'miembros', label: 'Miembros' },
  { value: 'historial', label: 'Historial' },
  ...(isAdmin.value ? [{ value: 'ajustes', label: 'Ajustes' }] : []),
]);
const METRICS = [
  { value: 'net', label: 'Balance' },
  { value: 'won', label: 'Ganado' },
  { value: 'lost', label: 'Perdido' },
  { value: 'wagered', label: 'Apostado' },
  { value: 'winRate', label: '% victorias' },
  { value: 'hands', label: 'Manos' },
  { value: 'biggestPot', label: 'Mayor bote' },
];

async function load() {
  try {
    g.value = (await api.get(`/groups/${id.value}`)).group;
    edit.value = { name: g.value.name, description: g.value.description, defaults: { ...g.value.defaults }, defaultDealerId: g.value.defaultDealerId };
  } catch (e) {
    toast.error(e.message);
    router.replace('/grupos');
  }
}
onMounted(load);

watch([tab, metric], async ([t]) => {
  if (t === 'ranking') ranking.value = (await api.get(`/groups/${id.value}/ranking?sort=${metric.value}`)).ranking;
  if (t === 'historial' && !history.value) history.value = (await api.get(`/groups/${id.value}/history`)).hands;
  if (t === 'mesa' && !myStats.value) myStats.value = (await api.get(`/groups/${id.value}/me`)).stats;
}, { immediate: true });

async function openTable() {
  opening.value = true;
  try {
    const { code } = await api.post(`/groups/${id.value}/open-table`);
    router.push(`/mesa/${code}`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    opening.value = false;
  }
}
async function save() {
  try {
    g.value = (await api.patch(`/groups/${id.value}`, edit.value)).group;
    toast.success('Grupo actualizado');
  } catch (e) {
    toast.error(e.message);
  }
}
async function addMember() {
  try {
    g.value = (await api.post(`/groups/${id.value}/members`, { username: addUser.value })).group;
    addUser.value = '';
    toast.success('Miembro añadido');
  } catch (e) {
    toast.error(e.message);
  }
}
async function setRole(m, role) {
  try {
    g.value = (await api.patch(`/groups/${id.value}/members/${m.id}`, { role })).group;
  } catch (e) {
    toast.error(e.message);
  }
}
async function removeMember(m) {
  const self = m.id === auth.user.id;
  if (!(await ask({ title: self ? '¿Salir del grupo?' : `¿Quitar a ${m.displayName}?`, message: self ? 'Dejarás de ver su mesa y su ranking.' : 'Ya no podrá entrar a la mesa del grupo.', confirmLabel: self ? 'Salir' : 'Quitar', danger: true }))) return;
  try {
    await api.del(`/groups/${id.value}/members/${m.id}`);
    if (self) return router.replace('/grupos');
    load();
  } catch (e) {
    toast.error(e.message);
  }
}
async function regenerate() {
  g.value = (await api.post(`/groups/${id.value}/regenerate-code`)).group;
  toast.success('Nuevo código generado');
}
async function removeGroup() {
  if (!(await ask({ title: `¿Eliminar "${g.value.name}"?`, message: 'Se cierra su mesa y desaparece para todos. Las manos jugadas siguen contando en el ranking general.', confirmLabel: 'Eliminar grupo', danger: true }))) return;
  try {
    await api.del(`/groups/${id.value}`);
    toast.success('Grupo eliminado');
    router.replace('/grupos');
  } catch (e) {
    toast.error(e.message);
  }
}
const isOwner = computed(() => g.value?.ownerId === auth.user.id);
</script>

<template>
  <div class="page" v-if="g">
    <div class="ghead card rise" :style="{ '--gc': g.color }">
      <span class="ge"><Icon :name="g.emoji || 'spade'" :size="34" /></span>
      <div class="grow">
        <h1>{{ g.name }}</h1>
        <p class="muted">{{ g.description || `${g.members.length} miembros` }}</p>
        <div class="faces">
          <Avatar v-for="m in g.members.slice(0, 8)" :key="m.id" :user="m" :size="28" class="face" />
          <span v-if="g.members.length > 8" class="small muted more">+{{ g.members.length - 8 }}</span>
        </div>
      </div>
      <div class="row head-actions">
        <button class="btn btn-sm" @click="showInvite = true"><Icon name="share" :size="16" />Invitar</button>
        <button v-if="isOwner" class="btn btn-sm btn-danger" title="Eliminar grupo" @click="removeGroup"><Icon name="trash" :size="16" />Eliminar</button>
        <button v-else class="btn btn-sm btn-ghost" title="Salir del grupo" @click="removeMember({ id: auth.user.id })"><Icon name="logout" :size="16" />Salir</button>
      </div>
    </div>

    <Segmented v-model="tab" :options="tabs" scroll class="tabs rise rise-1" />

    <Transition name="fade" mode="out-in">
      <section v-if="tab === 'mesa'" key="mesa" class="stack">
        <div class="card tablecard" :class="{ live: g.activeTable }">
          <div class="felt-mini">
            <PlayingCard card="Ah" size="sm" />
            <PlayingCard card="Kh" size="sm" />
            <PlayingCard card="Qh" size="sm" />
          </div>
          <div class="grow">
            <h3>{{ g.activeTable ? 'Mesa en juego' : 'Mesa del grupo' }}</h3>
            <p class="small muted" v-if="g.activeTable">{{ g.activeTable.players }} jugadores · mano {{ g.activeTable.handNo }}</p>
            <p class="small muted" v-else>
              <Icon :name="modeInfo(g.defaults.mode).icon" :size="14" class="inl" /> {{ modeInfo(g.defaults.mode).short }}
              <template v-if="!noChips(g.defaults.mode)">
                · Ciegas {{ formatChips(Math.max(1, Math.floor(g.defaults.minBet / 2))) }}/{{ formatChips(g.defaults.minBet) }} ·
                {{ g.defaults.maxBet ? 'máx ' + formatChips(g.defaults.maxBet) : 'sin límite' }} · {{ formatChips(g.defaults.startingChips) }} fichas
              </template>
            </p>
          </div>
          <button class="btn btn-primary btn-lg" :disabled="opening" @click="openTable">
            <span v-if="opening" class="spinner"></span>
            <template v-else><Icon name="play" :size="18" />{{ g.activeTable ? 'Entrar' : 'Abrir mesa' }}</template>
          </button>
        </div>
        <div v-if="myStats" class="card">
          <div class="card-title"><Icon name="chart" :size="18" />Mis números en {{ g.name }}</div>
          <StatTiles :stats="myStats" />
        </div>
      </section>

      <section v-else-if="tab === 'ranking'" key="ranking">
        <Segmented v-model="metric" :options="METRICS" scroll />
        <div v-if="ranking === null" class="skeleton" style="height: 240px; margin-top: 16px"></div>
        <RankingList v-else :rows="ranking" :metric="metric" />
      </section>

      <section v-else-if="tab === 'miembros'" key="miembros" class="stack">
        <form v-if="isAdmin" class="row" @submit.prevent="addMember">
          <input v-model="addUser" class="input" placeholder="Añadir por usuario" />
          <button class="btn"><Icon name="plus" :size="18" /></button>
        </form>
        <TransitionGroup tag="div" name="list" class="stack">
          <div v-for="m in g.members" :key="m.id" class="member card">
            <RouterLink :to="`/u/${m.username}`" class="row grow">
              <Avatar :user="m" :size="42" />
              <div class="grow">
                <div class="row nm">
                  <b class="ellipsis">{{ m.displayName }}</b>
                  <span v-if="m.role === 'admin'" class="badge badge-gold">Admin</span>
                  <span v-if="m.id === g.defaultDealerId" class="badge"><Icon name="dealer" :size="12" />Dealer</span>
                </div>
                <div class="small faint">@{{ m.username }} · desde {{ timeAgo(m.joinedAt) }}</div>
              </div>
            </RouterLink>
            <div class="row acts" v-if="isAdmin && m.id !== g.ownerId && m.id !== auth.user.id">
              <button class="btn btn-sm btn-ghost" @click="setRole(m, m.role === 'admin' ? 'member' : 'admin')">{{ m.role === 'admin' ? 'Quitar admin' : 'Hacer admin' }}</button>
              <button class="icon-btn" title="Quitar" @click="removeMember(m)"><Icon name="x" :size="16" /></button>
            </div>
          </div>
        </TransitionGroup>
        <button v-if="auth.user.id !== g.ownerId" class="btn btn-danger" @click="removeMember({ id: auth.user.id })">Salir del grupo</button>
      </section>

      <section v-else-if="tab === 'historial'" key="historial" class="stack">
        <div v-if="history === null" class="skeleton" style="height: 200px"></div>
        <div v-else-if="!history.length" class="card empty"><div class="big"><Icon name="scroll" :size="40" :stroke="1.6" /></div>Sin manos jugadas todavía.</div>
        <div v-for="h in history || []" :key="h.id" class="card hand">
          <div class="row-between">
            <div class="small faint">Mano #{{ h.no }} · {{ timeAgo(h.createdAt) }} · {{ h.players }} jugadores</div>
            <b class="num pot">{{ formatChips(h.potTotal) }}</b>
          </div>
          <div class="row hb">
            <div class="row board">
              <PlayingCard v-for="c in h.board" :key="c" :card="c" size="xs" />
              <span v-if="!h.board.length" class="small faint">Sin board (todos se retiraron)</span>
            </div>
          </div>
          <div class="row win">
            <Avatar v-for="(w, i) in h.winners" :key="i" :user="w" :size="24" />
            <span class="small"><b>{{ h.winners.map((w) => w.displayName).join(', ') }}</b><span v-if="h.winningHand" class="muted"> · {{ h.winningHand }}</span></span>
          </div>
        </div>
      </section>

      <section v-else-if="tab === 'ajustes' && edit" key="ajustes" class="stack">
        <div class="card stack">
          <label class="field"><span>Nombre</span><input v-model="edit.name" class="input" maxlength="40" /></label>
          <label class="field"><span>Descripción</span><input v-model="edit.description" class="input" maxlength="200" /></label>
          <label class="field">
            <span>Dealer por defecto</span>
            <select v-model="edit.defaultDealerId" class="input">
              <option :value="null">Quien abra la mesa</option>
              <option v-for="m in g.members" :key="m.id" :value="m.id">{{ m.displayName }}</option>
            </select>
          </label>
        </div>
        <div class="card stack">
          <div class="card-title">Configuración de la mesa del grupo</div>
          <SettingsForm v-model="edit.defaults" />
        </div>
        <button class="btn btn-primary btn-lg" @click="save">Guardar cambios</button>
        <div class="card stack">
          <div class="row-between">
            <div>
              <b>Código de invitación</b>
              <div class="num code">{{ g.inviteCode }}</div>
            </div>
            <button class="btn btn-sm" @click="regenerate"><Icon name="rotate" :size="16" />Regenerar</button>
          </div>
        </div>
        <button v-if="g.ownerId === auth.user.id" class="btn btn-danger" @click="removeGroup">Eliminar grupo</button>
      </section>
    </Transition>

    <ShareSheet
      :open="showInvite"
      :code="g.inviteCode"
      path="/grupos/unirse/"
      title="Invitar al grupo"
      subtitle="Quien escanee el QR entra directo al grupo"
      :group-id="isAdmin ? g.id : null"
      :member-ids="g.members.map((m) => m.id)"
      @added="load"
      @close="showInvite = false"
    />
  </div>
  <div v-else class="page"><div class="skeleton" style="height: 160px"></div></div>
</template>

<style scoped>
.ghead { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--gc) 32%, transparent), transparent 60%), var(--surface); }
.ghead h1 { font-size: clamp(24px, 4vw, 32px); font-weight: 900; }
.ge { width: 70px; height: 70px; border-radius: 22px; display: grid; place-items: center; font-size: 36px; background: color-mix(in srgb, var(--gc) 22%, transparent); border: 1px solid color-mix(in srgb, var(--gc) 45%, transparent); }
.faces { display: flex; align-items: center; margin-top: 10px; }
.face { margin-left: -6px; box-shadow: 0 0 0 2px var(--surface); }
.face:first-child { margin-left: 0; }
.more { margin-left: 8px; }
.head-actions { gap: 8px; flex-wrap: wrap; }
.tabs { margin: 18px 0; }
.tablecard { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; background: radial-gradient(ellipse at 0% 50%, color-mix(in srgb, var(--felt-a) 45%, transparent), transparent 70%), var(--surface); }
.tablecard.live { border-color: rgba(34, 197, 94, 0.45); }
.tablecard h3 { font-size: 20px; font-weight: 800; }
.felt-mini { display: flex; gap: 4px; padding: 14px; border-radius: 50%; background: radial-gradient(var(--felt-a), var(--felt-b)); box-shadow: 0 0 0 5px #3b2a12; }
.member { display: flex; align-items: center; gap: 10px; padding: 12px 14px; flex-wrap: wrap; }
.nm { gap: 6px; min-width: 0; }
.acts { gap: 6px; }
.hand { display: flex; flex-direction: column; gap: 10px; padding: 14px; }
.pot { color: var(--gold-2); }
.board { gap: 3px; }
.win { gap: 6px; }
.code { font-size: 22px; font-weight: 900; letter-spacing: 0.2em; color: var(--gold-2); }
select.input { appearance: none; }
</style>
