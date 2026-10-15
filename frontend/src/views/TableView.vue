<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSocket, emit, connected } from '@/lib/socket.js';
import { toast } from '@/lib/store.js';
import { formatChips, STAGE_LABEL } from '@/lib/format.js';
import Icon from '@/components/Icon.vue';
import Seat from '@/components/Seat.vue';
import PlayingCard from '@/components/PlayingCard.vue';
import CardPicker from '@/components/CardPicker.vue';
import ChipBetPad from '@/components/ChipBetPad.vue';
import EquityPanel from '@/components/EquityPanel.vue';
import ShareSheet from '@/components/ShareSheet.vue';
import ShowdownSheet from '@/components/ShowdownSheet.vue';
import TableMenu from '@/components/TableMenu.vue';

const route = useRoute();
const router = useRouter();
const code = computed(() => String(route.params.code).toUpperCase());

const s = ref(null); // estado de la mesa
const busy = ref(false);
const showShare = ref(route.query.share === '1');
const showMenu = ref(false);
const showShowdown = ref(false);
const picker = ref({ open: false, mode: null });

const hand = computed(() => s.value?.hand);
const live = computed(() => hand.value && hand.value.stage !== 'done');
const me = computed(() => hand.value?.players.find((p) => p.userId === s.value.me) || null);
const mySeat = computed(() => s.value?.seats.find((x) => x.userId === s.value.me));
const myTurn = computed(() => !!s.value?.legal);
const myCards = computed(() => me.value?.cards || []);
const seatsById = computed(() => Object.fromEntries((s.value?.seats || []).map((x) => [x.userId, x])));
const nameOf = (id) => (id === s.value?.me ? 'Tú' : seatsById.value[id]?.displayName || '—');
const opponents = computed(() => (hand.value ? hand.value.players.filter((p) => !p.folded && p.userId !== s.value.me).length : 0));
const totalPot = computed(() => (hand.value ? hand.value.players.reduce((a, p) => a + p.total, 0) : 0));
const potForBet = computed(() => totalPot.value);

// asientos alrededor de la mesa, conmigo abajo
const layout = computed(() => {
  if (!s.value) return [];
  const seats = [...s.value.seats];
  const myIdx = seats.findIndex((x) => x.userId === s.value.me);
  const ordered = myIdx >= 0 ? [...seats.slice(myIdx), ...seats.slice(0, myIdx)] : seats;
  const n = ordered.length;
  return ordered.map((seat, i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cos = Math.cos(a), sin = Math.sin(a);
    return {
      seat,
      x: 50 + cos * 47,
      y: 50 + sin * 45,
      dir: { x: -cos, y: -sin },
    };
  });
});

const handNames = computed(() => hand.value?.handNames || {});
const winnerText = computed(() => {
  const r = hand.value?.result;
  if (!r || hand.value.stage !== 'done') return '';
  const ws = Object.entries(r.payout).filter(([, v]) => v > 0);
  if (!ws.length) return '';
  return ws
    .map(([id, v]) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'} ${formatChips(v)}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`)
    .join(' · ');
});

// ---------- socket ----------
let sock;
async function subscribe() {
  try {
    await emit('table:subscribe', { code: code.value });
  } catch (e) {
    if (e.message === 'not-seated') router.replace(`/unirse/${code.value}`);
    else {
      toast.error(e.message);
      router.replace('/');
    }
  }
}
function onState(st) {
  if (st.code !== code.value) return;
  const wasMyTurn = myTurn.value;
  s.value = st;
  if (st.legal && !wasMyTurn) {
    navigator.vibrate?.([30, 40, 30]);
  }
  if (st.status === 'closed') {
    toast('El dealer cerró la mesa');
    router.replace('/');
  }
}
function onKicked(p) {
  if (p.code !== code.value) return;
  toast.error('Has sido expulsado de la mesa');
  router.replace('/');
}
onMounted(() => {
  sock = getSocket();
  sock.on('table:state', onState);
  sock.on('table:kicked', onKicked);
  sock.on('connect', subscribe);
  if (sock.connected) subscribe();
});
onUnmounted(() => {
  sock.off('table:state', onState);
  sock.off('table:kicked', onKicked);
  sock.off('connect', subscribe);
  sock.emit('table:unsubscribe', { code: code.value });
});

async function run(event, payload = {}) {
  if (busy.value) return;
  busy.value = true;
  try {
    await emit(event, { code: code.value, ...payload });
    return true;
  } catch (e) {
    toast.error(e.message);
    return false;
  } finally {
    busy.value = false;
  }
}

const doAction = (a) => run('table:action', a);

// ---------- cartas ----------
const pickerConfig = computed(() => {
  const h = hand.value;
  if (picker.value.mode === 'hole') {
    return { count: 2, title: 'Tus cartas', initial: myCards.value, disabled: h?.board || [], label: 'Guardar mis cartas' };
  }
  if (picker.value.mode === 'board' && h?.awaiting) {
    const need = { flop: 3, turn: 1, river: 1 }[h.awaiting];
    return { count: need, title: `Cartas del ${STAGE_LABEL[h.awaiting]}`, initial: [], disabled: h.board, label: `Poner ${STAGE_LABEL[h.awaiting]}` };
  }
  return { count: 1, title: '', initial: [], disabled: [], label: '' };
});
async function onPicked(cards) {
  const ok = picker.value.mode === 'hole' ? await run('table:cards', { cards }) : await run('dealer:board', { cards });
  if (ok) picker.value.open = false;
}
const openPicker = (mode) => (picker.value = { open: true, mode });

// el dealer abre el selector directamente cuando toca poner cartas
watch(
  () => hand.value?.awaiting,
  (aw) => {
    if (aw && s.value?.isDealer) setTimeout(() => openPicker('board'), 450);
  },
);
watch(
  () => hand.value?.stage,
  (st) => {
    if (st === 'showdown' && s.value?.isDealer) showShowdown.value = true;
    if (st === 'preflop' && me.value && !myCards.value.length) toast('Nueva mano: registra tus cartas para ver tu probabilidad', 'info', 3000);
  },
);

const canStart = computed(() => s.value?.isDealer && !live.value && (s.value?.seats.filter((x) => x.status === 'active' && x.chips > 0).length || 0) >= 2);
const boardSlots = computed(() => Array.from({ length: 5 }, (_, i) => hand.value?.board[i] || ''));
const toActName = computed(() => (hand.value?.toAct ? nameOf(hand.value.toAct) : ''));
const statusLine = computed(() => {
  const h = hand.value;
  if (!s.value) return '';
  if (!h || h.stage === 'done') return s.value.isDealer ? 'Listo para repartir' : 'Esperando al dealer';
  if (h.awaiting) return `El dealer pone el ${STAGE_LABEL[h.awaiting]}`;
  if (h.stage === 'showdown') return 'Showdown: el dealer reparte el bote';
  if (h.toAct === s.value.me) return '¡Es tu turno!';
  return `Turno de ${toActName.value}`;
});
</script>

<template>
  <div class="tp" v-if="s">
    <!-- barra superior -->
    <header class="bar">
      <button class="icon-btn" aria-label="Volver" @click="router.push(s.groupId ? `/grupos/${s.groupId}` : '/')"><Icon name="left" /></button>
      <div class="title grow">
        <div class="ellipsis tname">{{ s.name }}</div>
        <div class="sub small">
          <span class="dotc" :class="{ on: connected }"></span>
          <template v-if="hand">Mano #{{ hand.no }} · {{ STAGE_LABEL[hand.stage] }}</template>
          <template v-else>Ciegas {{ formatChips(Math.max(1, Math.floor(s.settings.minBet / 2))) }}/{{ formatChips(s.settings.minBet) }}</template>
        </div>
      </div>
      <button class="codebtn" @click="showShare = true"><Icon name="qr" :size="16" />{{ s.code }}</button>
      <button class="icon-btn" aria-label="Menú" @click="showMenu = true"><Icon name="menu" /></button>
    </header>

    <!-- mesa -->
    <section class="felt-zone">
      <div class="felt">
        <div class="rail"></div>
        <div class="center">
          <Transition name="pop">
            <div v-if="totalPot > 0" class="pot num" :key="'pot'">
              <span class="pot-chip"></span>Bote {{ formatChips(totalPot) }}
            </div>
          </Transition>
          <div class="board">
            <PlayingCard v-for="(c, i) in boardSlots" :key="i" :card="c" :placeholder="!c" size="md" class="bslot"><span></span></PlayingCard>
          </div>
          <Transition name="fade" mode="out-in">
            <div :key="statusLine + winnerText" class="status" :class="{ mine: myTurn, win: winnerText }">
              {{ winnerText || statusLine }}
            </div>
          </Transition>
        </div>

        <div
          v-for="l in layout"
          :key="l.seat.userId"
          class="seat-pos"
          :style="{ left: l.x + '%', top: l.y + '%' }"
        >
          <Seat
            :seat="l.seat"
            :player="hand?.players.find((p) => p.userId === l.seat.userId)"
            :hand="hand"
            :is-me="l.seat.userId === s.me"
            :is-dealer="l.seat.userId === s.dealerId"
            :hand-name="handNames[l.seat.userId]"
            :bet-dir="l.dir"
          />
        </div>
      </div>
    </section>

    <!-- dock inferior -->
    <section class="dock">
      <!-- controles del dealer -->
      <div v-if="s.isDealer" class="dealer">
        <div class="dl-tag"><span>🎩</span> Dealer</div>
        <template v-if="!live">
          <button class="btn btn-primary btn-lg grow" :disabled="!canStart || busy" @click="run('dealer:start')">
            <Icon name="play" :size="18" />Repartir mano {{ (s.handNo || 0) + 1 }}
          </button>
        </template>
        <template v-else-if="hand.awaiting">
          <button class="btn btn-primary btn-lg grow glow" @click="openPicker('board')">
            <Icon name="cards" :size="18" />Poner el {{ STAGE_LABEL[hand.awaiting] }}
          </button>
        </template>
        <template v-else-if="hand.stage === 'showdown'">
          <button class="btn btn-success btn-lg grow glow" @click="showShowdown = true"><Icon name="trophy" :size="18" />Repartir el bote</button>
        </template>
        <template v-else>
          <div class="grow small muted">Turno de <b class="txt">{{ toActName }}</b></div>
          <button v-if="hand.toAct !== s.me" class="btn btn-sm" :disabled="busy" @click="run('dealer:forceFold', { userId: hand.toAct })">Forzar</button>
          <button v-if="hand.stage !== 'preflop'" class="btn btn-sm btn-ghost" :disabled="busy" @click="run('dealer:undoBoard')" title="Corregir cartas"><Icon name="undo" :size="16" /></button>
        </template>
      </div>
      <p v-if="s.isDealer && !canStart && !live" class="hint center">Se necesitan al menos 2 jugadores activos con fichas.</p>

      <!-- jugador -->
      <div v-if="me && live" class="player">
        <div class="mine">
          <button class="hole" @click="openPicker('hole')" :aria-label="'Elegir mis cartas'">
            <PlayingCard :card="myCards[0] || ''" placeholder size="lg" :dim="me.folded">?</PlayingCard>
            <PlayingCard :card="myCards[1] || ''" placeholder size="lg" :dim="me.folded">?</PlayingCard>
            <span class="edit"><Icon name="edit" :size="13" /></span>
          </button>
          <EquityPanel v-if="!me.folded" class="grow" :hole="myCards" :board="hand.board" :opponents="opponents" :compact="myTurn" />
          <div v-else class="grow folded-msg">Te has retirado de esta mano</div>
        </div>
        <Transition name="slide">
          <div v-if="myTurn" class="padwrap">
            <ChipBetPad :legal="s.legal" :chips="s.chips" :pot="potForBet" :busy="busy" @action="doAction" />
          </div>
        </Transition>
      </div>
      <div v-else-if="mySeat && !s.isDealer" class="waiting">
        <template v-if="mySeat.status === 'sitout'">
          <span>Estás fuera de la mesa</span>
          <button class="btn btn-sm btn-primary" @click="run('table:sitout', { sitout: false })">Volver a jugar</button>
        </template>
        <template v-else-if="mySeat.chips <= 0">Sin fichas · pide al dealer una recompra</template>
        <template v-else-if="live">Entrarás en la siguiente mano</template>
        <template v-else>Esperando a que el dealer reparta…</template>
      </div>
      <div v-else-if="mySeat && s.isDealer && mySeat.status === 'sitout' && !live" class="waiting small">
        Solo repartes. <button class="linkbtn" @click="run('table:sitout', { sitout: false })">Jugar también</button>
      </div>
    </section>

    <CardPicker
      :open="picker.open"
      :count="pickerConfig.count"
      :title="pickerConfig.title"
      :initial="pickerConfig.initial"
      :disabled="pickerConfig.disabled"
      :confirm-label="pickerConfig.label"
      :loading="busy"
      @confirm="onPicked"
      @close="picker.open = false"
    />
    <ShareSheet :open="showShare" :code="s.code" @close="showShare = false" />
    <ShowdownSheet v-if="hand?.stage === 'showdown'" :open="showShowdown && s.isDealer" :state="s" :busy="busy" @close="showShowdown = false" @resolve="(w) => run('dealer:resolve', { winners: w }).then((ok) => ok && (showShowdown = false))" />
    <TableMenu :open="showMenu" :state="s" :run="run" @close="showMenu = false" />
  </div>
  <div v-else class="loading-page"><div class="spinner"></div></div>
</template>

<style scoped>
.tp {
  height: 100dvh; display: flex; flex-direction: column; overflow: hidden;
  background: radial-gradient(ellipse at 50% 30%, #18224d, #0b1026 70%);
}
.bar { display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 8px; }
.tname { font-weight: 800; font-size: 17px; }
.sub { display: flex; align-items: center; gap: 6px; color: var(--text-2); }
.dotc { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
.dotc.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.codebtn {
  display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border-radius: 12px;
  font-weight: 900; letter-spacing: 0.12em; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); border: 1px solid rgba(245, 181, 68, 0.35);
}

.felt-zone { flex: 1; min-height: 0; display: grid; place-items: center; padding: 34px 40px 40px; }
.felt {
  position: relative; width: 100%; height: 100%; max-width: 1000px; max-height: 560px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--felt-a) 100%, #fff 8%), var(--felt-a) 35%, var(--felt-b) 100%);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.55), 0 0 0 12px #1a1206, 0 0 0 14px #3b2a12, 0 30px 80px -20px rgba(0, 0, 0, 0.9);
  transition: background 0.6s;
}
.rail { position: absolute; inset: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.08); pointer-events: none; }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 12%; }
.pot {
  display: flex; align-items: center; gap: 8px; padding: 5px 14px 5px 6px; border-radius: 99px;
  background: rgba(0, 0, 0, 0.45); font-weight: 800; font-size: 15px; color: #fff;
}
.pot-chip { width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle, var(--gold-2) 35%, var(--gold) 36% 60%, #fff 61% 68%, var(--gold) 69%); }
.board { display: flex; gap: 6px; }
.bslot :deep(.phc) { border-color: rgba(255, 255, 255, 0.14); background: rgba(0, 0, 0, 0.12); }
.status {
  font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.75); text-align: center; max-width: 92%;
  padding: 4px 12px; border-radius: 99px; background: rgba(0, 0, 0, 0.25);
}
.status.mine { color: #2a1700; background: var(--gold); animation: winpop 0.6s var(--spring); }
.status.win { color: #052e16; background: linear-gradient(90deg, #4ade80, #22c55e); }
@keyframes winpop { 0% { transform: scale(0.85); } 100% { transform: scale(1); } }
.seat-pos { position: absolute; transform: translate(-50%, -50%); z-index: 5; transition: left 0.6s var(--ease), top 0.6s var(--ease); }

.dock {
  flex: none; padding: 10px 14px calc(12px + var(--safe-b)); display: flex; flex-direction: column; gap: 10px;
  background: linear-gradient(180deg, rgba(11, 16, 38, 0), rgba(11, 16, 38, 0.95) 22%);
  max-height: 64dvh; overflow-y: auto;
}
.dealer {
  display: flex; align-items: center; gap: 10px; padding: 8px; padding-left: 12px; border-radius: 18px;
  background: rgba(22, 31, 69, 0.85); border: 1px solid rgba(245, 181, 68, 0.25); width: 100%; max-width: 640px; margin: 0 auto;
}
.dl-tag { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-2); white-space: nowrap; }
.txt { color: var(--text); }
.glow { animation: glow 1.8s infinite; }
@keyframes glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 181, 68, 0.5); } 50% { box-shadow: 0 0 0 8px rgba(245, 181, 68, 0); } }
.center { text-align: center; }
.player { width: 100%; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.mine { display: flex; gap: 12px; align-items: center; }
.hole { position: relative; display: flex; gap: 6px; padding: 0; }
.hole .edit { position: absolute; right: -6px; bottom: -6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #2a1700; box-shadow: 0 3px 8px rgba(0,0,0,.5); }
.folded-msg { color: var(--text-3); font-weight: 600; }
.padwrap { padding: 12px 0 2px; border-top: 1px solid var(--line); }
.waiting { text-align: center; color: var(--text-2); font-weight: 600; padding: 12px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; }
.linkbtn { color: var(--gold-2); font-weight: 700; text-decoration: underline; }
.loading-page { height: 100dvh; display: grid; place-items: center; }

.slide-enter-active { transition: transform 0.5s var(--ease), opacity 0.35s; }
.slide-leave-active { transition: transform 0.25s ease, opacity 0.2s; }
.slide-enter-from, .slide-leave-to { transform: translateY(40px); opacity: 0; }

@media (max-width: 700px) {
  .felt-zone { padding: 40px 34px 44px; }
  .felt { border-radius: 46% / 40%; max-height: none; }
  .center { padding: 0 6%; }
  .board { gap: 4px; }
  .board :deep(.pcard.md) { --w: 44px; }
  .codebtn { padding: 0 9px; letter-spacing: 0.06em; }
}
@media (min-width: 1100px) {
  .tp { display: grid; grid-template-columns: 1fr 440px; grid-template-rows: auto 1fr; }
  .bar { grid-column: 1 / -1; }
  .dock { max-height: none; background: rgba(11, 16, 38, 0.6); border-left: 1px solid var(--line); justify-content: center; }
}
</style>
