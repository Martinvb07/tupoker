<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '@/lib/api.js';
import { toast, social, ask } from '@/lib/store.js';
import { getSocket } from '@/lib/socket.js';
import Avatar from '@/components/Avatar.vue';
import Icon from '@/components/Icon.vue';
import Segmented from '@/components/Segmented.vue';

const data = ref(null);
const q = ref('');
const results = ref([]);
const tab = ref('friends');
const busy = ref(null);

async function load() {
  data.value = await api.get('/friends');
  social.incoming = data.value.incoming.length;
  if (data.value.incoming.length && tab.value === 'friends' && !data.value.friends.length) tab.value = 'requests';
}
const reload = () => load().catch(() => {});
onMounted(() => {
  load();
  const s = getSocket();
  s.on('friend:request', reload);
  s.on('friend:accepted', reload);
});
onUnmounted(() => {
  const s = getSocket();
  s.off('friend:request', reload);
  s.off('friend:accepted', reload);
});

// búsqueda por usuario
let timer;
watch(q, (v) => {
  clearTimeout(timer);
  if (v.trim().length < 2) return (results.value = []);
  timer = setTimeout(async () => {
    results.value = (await api.get(`/users/search?q=${encodeURIComponent(v.trim().replace(/^@/, ''))}`)).users;
  }, 250);
});
const relation = computed(() => {
  const m = {};
  if (!data.value) return m;
  for (const f of data.value.friends) m[f.user.id] = 'friend';
  for (const f of data.value.outgoing) m[f.user.id] = 'sent';
  for (const f of data.value.incoming) m[f.user.id] = 'incoming';
  return m;
});

async function request(username) {
  busy.value = username;
  try {
    const r = await api.post('/friends/request', { username });
    toast.success(r.status === 'accepted' ? '¡Ahora sois amigos!' : 'Solicitud enviada');
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = null;
  }
}
async function accept(f) {
  busy.value = f.requestId;
  try {
    await api.post(`/friends/${f.requestId}/accept`);
    toast.success(`${f.user.displayName} ya es tu amigo`);
    await load();
  } finally {
    busy.value = null;
  }
}
async function remove(f, msg) {
  if (msg && !(await ask({ title: msg, confirmLabel: 'Eliminar', danger: true, icon: 'user' }))) return;
  busy.value = f.requestId;
  try {
    await api.del(`/friends/${f.requestId}`);
    await load();
  } finally {
    busy.value = null;
  }
}
const tabs = computed(() => [
  { value: 'friends', label: `Amigos${data.value ? ` · ${data.value.friends.length}` : ''}` },
  { value: 'requests', label: `Solicitudes${data.value?.incoming.length ? ` · ${data.value.incoming.length}` : ''}` },
]);
const onlineCount = computed(() => data.value?.friends.filter((f) => f.user.online).length || 0);
</script>

<template>
  <div class="page">
    <div class="page-head rise">
      <div>
        <div class="eyebrow">Tu gente</div>
        <h1>Amigos</h1>
        <p v-if="data">{{ onlineCount }} conectado{{ onlineCount === 1 ? '' : 's' }} ahora · invítalos a tus mesas con un toque</p>
      </div>
    </div>

    <div class="card search rise rise-1">
      <div class="row">
        <Icon name="user" class="faint" />
        <input v-model="q" class="input" placeholder="Buscar por usuario, p. ej. @pokermaikol" autocapitalize="none" />
      </div>
      <TransitionGroup tag="div" name="list" class="results">
        <div v-for="u in results" :key="u.id" class="urow">
          <RouterLink :to="`/u/${u.username}`" class="row grow">
            <Avatar :user="u" :size="38" />
            <div class="grow">
              <b class="ellipsis">{{ u.displayName }}</b>
              <div class="small faint">@{{ u.username }}</div>
            </div>
          </RouterLink>
          <span v-if="relation[u.id] === 'friend'" class="badge badge-green">Amigos</span>
          <span v-else-if="relation[u.id] === 'sent'" class="badge">Enviada</span>
          <button v-else class="btn btn-sm" :class="relation[u.id] === 'incoming' ? 'btn-primary' : ''" :disabled="busy === u.username" @click="request(u.username)">
            <Icon name="plus" :size="16" />{{ relation[u.id] === 'incoming' ? 'Aceptar' : 'Agregar' }}
          </button>
        </div>
      </TransitionGroup>
      <p v-if="q.trim().length >= 2 && !results.length" class="hint">No hay usuarios con ese nombre.</p>
    </div>

    <Segmented v-model="tab" :options="tabs" class="tabs rise rise-2" />

    <div v-if="!data" class="skeleton" style="height: 200px"></div>
    <Transition v-else name="fade" mode="out-in">
      <div v-if="tab === 'friends'" key="f" class="list">
        <div v-if="!data.friends.length" class="card empty">
          <div class="big"><Icon name="handshake" :size="40" :stroke="1.6" /></div>
          Aún no tienes amigos agregados. Búscalos arriba por su usuario.
        </div>
        <TransitionGroup tag="div" name="list" class="list">
          <div v-for="f in data.friends" :key="f.requestId" class="card frow" :class="{ playing: f.user.playing }">
            <RouterLink :to="`/u/${f.user.username}`" class="row grow">
              <div class="ava">
                <Avatar :user="f.user" :size="44" />
                <span class="dot" :class="{ on: f.user.online, play: f.user.playing }"></span>
              </div>
              <div class="grow">
                <b class="ellipsis">{{ f.user.displayName }}</b>
                <div v-if="f.user.playing" class="small playing-line">
                  <Icon name="spade" :size="13" />
                  {{ f.user.playing.inHand ? 'Jugando' : 'En la mesa' }} · <b class="ellipsis">{{ f.user.playing.name }}</b>
                </div>
                <div v-else class="small" :class="f.user.online ? 'pos' : 'faint'">{{ f.user.online ? 'Conectado' : '@' + f.user.username }}</div>
              </div>
            </RouterLink>
            <RouterLink v-if="f.user.playing" :to="`/unirse/${f.user.playing.code}`" class="btn btn-sm btn-primary">Unirme</RouterLink>
            <button class="icon-btn" title="Eliminar amigo" @click="remove(f, `¿Eliminar a ${f.user.displayName} de tus amigos?`)"><Icon name="x" :size="16" /></button>
          </div>
        </TransitionGroup>
      </div>

      <div v-else key="r" class="list">
        <div v-if="!data.incoming.length && !data.outgoing.length" class="card empty"><div class="big"><Icon name="inbox" :size="40" :stroke="1.6" /></div>No tienes solicitudes pendientes.</div>
        <div v-for="f in data.incoming" :key="f.requestId" class="card frow incoming">
          <Avatar :user="f.user" :size="44" />
          <div class="grow">
            <b class="ellipsis">{{ f.user.displayName }}</b>
            <div class="small faint">quiere ser tu amigo</div>
          </div>
          <button class="btn btn-sm btn-primary" :disabled="busy === f.requestId" @click="accept(f)"><Icon name="check" :size="16" />Aceptar</button>
          <button class="icon-btn" title="Rechazar" :disabled="busy === f.requestId" @click="remove(f)"><Icon name="x" :size="16" /></button>
        </div>
        <template v-if="data.outgoing.length">
          <div class="eyebrow sent-title">Enviadas</div>
          <div v-for="f in data.outgoing" :key="f.requestId" class="card frow">
            <Avatar :user="f.user" :size="40" />
            <div class="grow">
              <b class="ellipsis">{{ f.user.displayName }}</b>
              <div class="small faint">Esperando respuesta</div>
            </div>
            <button class="btn btn-sm btn-ghost" @click="remove(f)">Cancelar</button>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.search { display: flex; flex-direction: column; gap: 10px; }
.search .input { height: 46px; }
.results { display: flex; flex-direction: column; gap: 6px; }
.urow { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 14px; background: rgba(5, 9, 28, 0.4); }
.tabs { margin: 18px 0 12px; }
.list { display: flex; flex-direction: column; gap: 8px; }
.frow { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
.frow.incoming { border-color: rgba(245, 181, 68, 0.4); }
.ava { position: relative; }
.dot { position: absolute; right: 0; bottom: 0; width: 13px; height: 13px; border-radius: 50%; background: #475569; border: 2.5px solid var(--surface); }
.dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.dot.play { background: var(--gold); box-shadow: 0 0 10px var(--gold); animation: pulse-dot 1.6s infinite; }
@keyframes pulse-dot { 50% { transform: scale(1.25); } }
.frow.playing { border-color: rgba(245, 181, 68, 0.45); background: radial-gradient(circle at 0% 50%, rgba(245, 181, 68, 0.1), transparent 60%), var(--surface); }
.playing-line { display: flex; align-items: center; gap: 5px; color: var(--gold-2); font-weight: 600; min-width: 0; }
.sent-title { margin-top: 12px; }
</style>
