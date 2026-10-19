<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { auth, toast, ask } from '@/lib/store.js';
import { formatChips, modeInfo, noChips } from '@/lib/format.js';
import Icon from '@/components/Icon.vue';
import Avatar from '@/components/Avatar.vue';
import StatTiles from '@/components/StatTiles.vue';
import QrScanner from '@/components/QrScanner.vue';

const router = useRouter();
const tables = ref(null);
const groups = ref(null);
const stats = ref(null);
const playingFriends = ref([]);
const joinCode = ref('');
const scanning = ref(false);

const hour = new Date().getHours();
const greet = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

onMounted(async () => {
  const [t, g, s, f] = await Promise.allSettled([api.get('/tables/mine'), api.get('/groups'), api.get('/stats/me'), api.get('/friends')]);
  playingFriends.value = (f.value?.friends || []).map((x) => x.user).filter((u) => u.playing);
  tables.value = t.value?.tables || [];
  groups.value = g.value?.groups || [];
  stats.value = s.value?.stats || null;
});

async function closeTable(t) {
  if (!(await ask({ title: `¿Cerrar "${t.name}"?`, message: 'Se cierra para todos los jugadores. Las manos jugadas se guardan.', confirmLabel: 'Cerrar mesa', danger: true }))) return;
  try {
    await api.post(`/tables/${t.code}/close`);
    tables.value = tables.value.filter((x) => x.code !== t.code);
    toast.success('Mesa cerrada');
  } catch (e) {
    toast.error(e.message);
  }
}

function join() {
  const c = joinCode.value.trim().toUpperCase();
  if (c.length < 4) return toast.error('Escribe el código de la mesa');
  router.push(`/unirse/${c}`);
}
</script>

<template>
  <div class="page">
    <div class="page-head rise">
      <div>
        <div class="eyebrow">{{ greet }}</div>
        <h1>{{ auth.user.displayName }}</h1>
        <p>¿Listo para la próxima mano?</p>
      </div>
      <RouterLink to="/perfil" class="me-link" aria-label="Mi perfil"><Avatar :user="auth.user" :size="46" ring /></RouterLink>
    </div>

    <div class="grid quick">
      <RouterLink to="/nueva-mesa" class="qa qa-create card hover rise rise-1">
        <div class="qi"><Icon name="plus" :size="26" /></div>
        <div>
          <h3>Crear mesa</h3>
          <p class="muted small">Define ciegas, fichas y comparte el QR</p>
        </div>
      </RouterLink>
      <form class="qa card rise rise-2" @submit.prevent="join">
        <div class="qi blue"><Icon name="qr" :size="24" /></div>
        <div class="grow">
          <h3>Unirse con código</h3>
          <div class="row join">
            <input v-model="joinCode" class="input input-code" maxlength="6" placeholder="ABC123" />
            <button class="btn btn-primary" aria-label="Unirse"><Icon name="right" /></button>
          </div>
          <button type="button" class="btn btn-sm scan" @click="scanning = true"><Icon name="camera" :size="16" />Escanear QR</button>
        </div>
      </form>
    </div>

    <section v-if="playingFriends.length" class="sec rise rise-2">
      <div class="row-between sh">
        <h2 class="row" style="gap: 8px"><span class="live-dot"></span>Amigos jugando ahora</h2>
        <RouterLink to="/amigos" class="btn btn-sm btn-ghost">Ver amigos <Icon name="right" :size="16" /></RouterLink>
      </div>
      <div class="hscroll">
        <div v-for="u in playingFriends" :key="u.id" class="card pf">
          <Avatar :user="u" :size="42" ring />
          <div class="grow">
            <b class="ellipsis">{{ u.displayName }}</b>
            <div class="small muted ellipsis"><Icon :name="modeInfo(u.playing.mode).icon" :size="12" class="inl" /> {{ u.playing.name }} · {{ u.playing.players }} jug.</div>
          </div>
          <RouterLink :to="'/unirse/' + u.playing.code" class="btn btn-sm btn-primary">Unirme</RouterLink>
        </div>
      </div>
    </section>

    <section class="sec rise rise-3">
      <div class="row-between sh">
        <h2>Mesas abiertas</h2>
      </div>
      <div v-if="tables === null" class="grid grid-2"><div class="skeleton" style="height: 110px"></div></div>
      <div v-else-if="!tables.length" class="card empty">
        <div class="big">🃏</div>
        No hay mesas abiertas. Crea una o abre la mesa de tu grupo.
      </div>
      <TransitionGroup v-else tag="div" name="list" class="grid grid-2">
        <RouterLink v-for="t in tables" :key="t.code" :to="t.seated ? `/mesa/${t.code}` : `/unirse/${t.code}`" class="card hover tcard">
          <div class="row-between">
            <div class="row grow">
              <span v-if="t.group" class="gemoji" :style="{ background: t.group.color + '33' }"><Icon :name="t.group.emoji || 'spade'" :size="20" /></span>
              <div class="grow">
                <h3 class="ellipsis">{{ t.name }}</h3>
                <div class="small muted">
                  <Icon :name="modeInfo(t.settings.mode).icon" :size="13" class="inl" /> {{ modeInfo(t.settings.mode).short }}
                  <template v-if="!noChips(t.settings.mode)">· Ciegas {{ formatChips(Math.max(1, Math.floor(t.settings.minBet / 2))) }}/{{ formatChips(t.settings.minBet) }}</template>
                  · {{ t.players }} jugadores
                </div>
              </div>
            </div>
            <button v-if="t.canClose" class="close-t" title="Cerrar mesa" @click.prevent.stop="closeTable(t)"><Icon name="x" :size="16" /></button>
            <span class="badge" :class="t.status === 'playing' ? 'badge-green' : 'badge-gold'">
              {{ t.status === 'playing' ? `Mano ${t.handNo}` : 'Esperando' }}
            </span>
          </div>
          <div class="row-between foot">
            <div class="faces">
              <Avatar v-for="(s, i) in t.seats" :key="i" :user="s" :size="30" class="face" />
            </div>
            <span class="go">{{ t.seated ? 'Volver a la mesa' : 'Unirme' }} <Icon name="right" :size="16" /></span>
          </div>
        </RouterLink>
      </TransitionGroup>
    </section>

    <section class="sec rise rise-4">
      <div class="row-between sh">
        <h2>Mis grupos</h2>
        <RouterLink to="/grupos" class="btn btn-sm btn-ghost">Ver todos <Icon name="right" :size="16" /></RouterLink>
      </div>
      <div v-if="groups && !groups.length" class="card empty">
        <div class="big"><Icon name="users" :size="40" :stroke="1.6" /></div>
        Crea un grupo con tus amigos para guardar la mesa y tener ranking propio.
      </div>
      <div v-else class="hscroll">
        <RouterLink v-for="g in groups || []" :key="g.id" :to="`/grupos/${g.id}`" class="gcard card hover" :style="{ '--gc': g.color }">
          <span class="ge"><Icon :name="g.emoji || 'spade'" :size="28" /></span>
          <b class="ellipsis">{{ g.name }}</b>
          <span class="small muted">{{ g.members }} miembros</span>
          <span v-if="g.activeTableCode" class="badge badge-green live">● En juego</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="stats" class="sec">
      <div class="row-between sh">
        <h2>Mis estadísticas</h2>
      </div>
      <StatTiles :stats="stats" />
    </section>
    <QrScanner :open="scanning" @close="scanning = false" />
  </div>
</template>

<style scoped>
.quick { grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); }
.qa { display: flex; align-items: center; gap: 16px; }
.qa h3 { font-size: 18px; font-weight: 800; margin-bottom: 3px; }
.qi { width: 56px; height: 56px; flex: none; border-radius: 18px; display: grid; place-items: center; color: #2a1700; background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); box-shadow: 0 10px 24px -10px rgba(245, 181, 68, 0.8); }
.qi.blue { color: #fff; background: linear-gradient(135deg, #818cf8, #4f46e5); box-shadow: 0 10px 24px -10px rgba(99, 102, 241, 0.8); }
.qa-create { background: radial-gradient(circle at 0% 0%, rgba(245, 181, 68, 0.16), transparent 60%), var(--surface); }
.join { margin-top: 8px; }
.scan { margin-top: 8px; width: 100%; }
.page-head { flex-wrap: nowrap; align-items: center; }
.me-link { flex: none; transition: transform 0.3s var(--spring); }
.me-link:hover { transform: scale(1.06); }
@media (min-width: 900px) { .me-link { display: none; } }
.join .input { height: 44px; font-size: 17px; }
.join .btn { height: 44px; width: 48px; padding: 0; }
.sec { margin-top: 30px; }
.sh { margin-bottom: 12px; }
.sh h2 { font-size: 20px; font-weight: 800; }
.tcard h3 { font-size: 17px; font-weight: 700; }
.gemoji { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; flex: none; }
.foot { margin-top: 14px; }
.faces { display: flex; }
.face { margin-left: -8px; box-shadow: 0 0 0 2px var(--surface); }
.face:first-child { margin-left: 0; }
.go { display: flex; align-items: center; gap: 4px; color: var(--gold-2); font-weight: 700; font-size: 14px; }
.live-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 10px var(--gold); animation: pulse-l 1.5s infinite; }
@keyframes pulse-l { 50% { transform: scale(1.4); opacity: 0.6; } }
.pf { flex: 0 0 300px; scroll-snap-align: start; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-color: rgba(245, 181, 68, 0.35); }
.close-t { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0; color: var(--text-3); background: rgba(255, 255, 255, 0.05); margin-right: 6px; flex: none; transition: all 0.2s; }
.close-t:hover { color: #fecdd3; background: rgba(244, 63, 94, 0.2); }
.hscroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x mandatory; scrollbar-width: none; }
.hscroll::-webkit-scrollbar { display: none; }
.gcard {
  flex: 0 0 180px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 4px; position: relative;
  background: radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--gc) 30%, transparent), transparent 60%), var(--surface);
}
.ge { font-size: 30px; margin-bottom: 6px; }
.live { position: absolute; top: 14px; right: 12px; }
</style>
