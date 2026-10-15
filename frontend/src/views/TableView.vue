<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSocket, emit, connected } from '@/lib/socket.js';
import { toast } from '@/lib/store.js';
import { formatChips, STAGE_LABEL, modeInfo } from '@/lib/format.js';
import Icon from '@/components/Icon.vue';
import Seat from '@/components/Seat.vue';
import Avatar from '@/components/Avatar.vue';
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
const menu = ref({ open: false, tab: 'players' });
const showShowdown = ref(false);
const picker = ref({ open: false, mode: null });

const hand = computed(() => s.value?.hand);
const live = computed(() => !!hand.value && hand.value.stage !== 'done');
// el modo de la mano en curso manda; entre manos, el de la mesa
const mode = computed(() => (live.value ? hand.value.mode : s.value?.settings.mode) || 'live');
const offline = computed(() => mode.value === 'offline');
const random = computed(() => mode.value === 'random');
const me = computed(() => hand.value?.players.find((p) => p.userId === s.value.me) || null);
const mySeat = computed(() => s.value?.seats.find((x) => x.userId === s.value.me));
const myTurn = computed(() => !!s.value?.legal);
const myCards = computed(() => me.value?.cards || []);
const seatsById = computed(() => Object.fromEntries((s.value?.seats || []).map((x) => [x.userId, x])));
const nameOf = (id) => (id === s.value?.me ? 'Tú' : seatsById.value[id]?.displayName || '—');
const opponents = computed(() => (hand.value ? hand.value.players.filter((p) => !p.folded && p.userId !== s.value.me).length : 0));
const totalPot = computed(() => (hand.value ? hand.value.players.reduce((a, p) => a + p.total, 0) : 0));

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
    return { seat, x: 50 + cos * 47, y: 50 + sin * 45, dir: { x: -cos, y: -sin } };
  });
});

const handNames = computed(() => hand.value?.handNames || {});
const winnerText = computed(() => {
  const h = hand.value;
  const r = h?.result;
  if (!r || h.stage !== 'done') return '';
  if (h.mode === 'offline') {
    return r.winners.map((id) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`).join(' · ');
  }
  const ws = Object.entries(r.payout).filter(([, v]) => v > 0);
  return ws
    .map(([id, v]) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'} ${formatChips(v)}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`)
    .join(' · ');
});

// ---------- partida terminada (alguien se quedó con todas las fichas) ----------
const activeSeats = computed(() => (s.value?.seats || []).filter((x) => x.status === 'active'));
const withChips = computed(() => activeSeats.value.filter((x) => x.chips > 0));
const gameOver = computed(() => !!s.value && !offline.value && !live.value && activeSeats.value.length >= 2 && withChips.value.length < 2);
const champion = computed(() => (gameOver.value && withChips.value.length === 1 ? withChips.value[0] : null));
const canStart = computed(() => {
  if (!s.value?.isDealer || live.value) return false;
  return (offline.value ? activeSeats.value.length : withChips.value.length) >= 2;
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
  if (st.legal && !wasMyTurn) navigator.vibrate?.([30, 40, 30]);
  if (st.status === 'closed') {
    toast('El dealer cerró la mesa');
    closeOverlays();
    router.replace('/');
  }
}
function onKicked(p) {
  if (p.code !== code.value) return;
  toast.error('Has sido expulsado de la mesa');
  closeOverlays();
  router.replace('/');
}
function closeOverlays() {
  picker.value.open = false;
  menu.value.open = false;
  showShowdown.value = false;
  showShare.value = false;
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
  document.body.style.overflow = '';
});

async function run(event, payload = {}) {
  if (busy.value) return false;
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
const openMenu = (tab = 'players') => (menu.value = { open: true, tab });
async function newGame() {
  if (await run('dealer:resetChips')) toast.success('Nueva partida: fichas repartidas de nuevo');
}
async function resolve(winners) {
  if (await run('dealer:resolve', { winners })) showShowdown.value = false;
}

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
const openPicker = (m) => {
  if (m === 'hole' && random.value) return;
  picker.value = { open: true, mode: m };
};

// el dealer abre el selector directamente cuando toca poner cartas (no en aleatorio, que reparte la app)
watch(
  () => hand.value?.awaiting,
  (aw) => {
    if (aw && s.value?.isDealer && !random.value && !offline.value) setTimeout(() => openPicker('board'), 450);
    if (!aw && picker.value.mode === 'board') picker.value.open = false;
  },
);
watch(
  () => hand.value?.stage,
  (st) => {
    if (st === 'showdown' && s.value?.isDealer) showShowdown.value = true;
    if (st !== 'showdown') showShowdown.value = false;
    if (st === 'preflop' && me.value && !myCards.value.length && !random.value) {
      toast('Nueva mano: registra tus cartas para ver tu probabilidad', 'info', 3000);
    }
  },
);

const boardSlots = computed(() => Array.from({ length: 5 }, (_, i) => hand.value?.board[i] || ''));
const toActName = computed(() => (hand.value?.toAct ? nameOf(hand.value.toAct) : ''));
const statusLine = computed(() => {
  const h = hand.value;
  if (!s.value) return '';
  if (gameOver.value) return champion.value ? `🏆 ${nameOf(champion.value.userId)} ganó la partida` : 'Partida terminada';
  if (!h || h.stage === 'done') return s.value.isDealer ? 'Listo para repartir' : 'Esperando al dealer';
  if (h.awaiting) return `El dealer pone el ${STAGE_LABEL[h.awaiting]}`;
  if (h.stage === 'showdown') return offline.value ? 'Showdown: el dealer confirma quién gana' : 'Showdown: el dealer reparte el bote';
  if (h.toAct === s.value.me) return '¡Es tu turno!';
  if (h.toAct) return `Turno de ${toActName.value}`;
  return STAGE_LABEL[h.stage];
});
const info = computed(() => modeInfo(mode.value));
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
          <span class="mbadge">{{ info.icon }} {{ info.short }}</span>
          <template v-if="hand">· Mano #{{ hand.no }}</template>
          <template v-if="!offline">· {{ formatChips(Math.max(1, Math.floor(s.settings.minBet / 2))) }}/{{ formatChips(s.settings.minBet) }}</template>
        </div>
      </div>
      <button class="codebtn" @click="showShare = true"><Icon name="qr" :size="16" />{{ s.code }}</button>
      <button class="icon-btn" aria-label="Menú" @click="openMenu()"><Icon name="menu" /></button>
    </header>

    <!-- mesa -->
    <section class="felt-zone">
      <div class="felt">
        <div class="rail"></div>
        <div class="center">
          <Transition name="pop">
            <div v-if="totalPot > 0 && !offline" class="pot num" key="pot">
              <span class="pot-chip"></span>Bote {{ formatChips(totalPot) }}
            </div>
          </Transition>
          <div class="board">
            <PlayingCard v-for="(c, i) in boardSlots" :key="i" :card="c" :placeholder="!c" size="md" class="bslot"><span></span></PlayingCard>
          </div>
          <Transition name="fade" mode="out-in">
            <div :key="statusLine + winnerText" class="status" :class="{ mine: myTurn, win: winnerText || gameOver }">
              {{ winnerText || statusLine }}
            </div>
          </Transition>
        </div>

        <div v-for="l in layout" :key="l.seat.userId" class="seat-pos" :style="{ left: l.x + '%', top: l.y + '%' }">
          <Seat
            :seat="l.seat"
            :player="hand?.players.find((p) => p.userId === l.seat.userId)"
            :hand="hand"
            :mode="mode"
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
      <!-- partida terminada -->
      <Transition name="slide">
        <div v-if="gameOver" class="gameover">
          <div class="go-head">
            <Avatar v-if="champion" :user="champion" :size="52" ring />
            <div class="grow">
              <div class="eyebrow">Partida terminada</div>
              <b class="go-name">{{ champion ? `${nameOf(champion.userId)} se queda con todo` : 'Nadie más tiene fichas' }}</b>
              <div v-if="champion" class="small muted num">{{ formatChips(champion.chips) }} fichas</div>
            </div>
          </div>
          <template v-if="s.isDealer">
            <div class="row go-actions">
              <button class="btn btn-primary btn-lg grow" :disabled="busy" @click="newGame"><Icon name="rotate" :size="18" />Nueva partida</button>
              <button class="btn btn-lg" @click="openMenu('players')"><Icon name="coins" :size="18" />Recompras</button>
            </div>
            <p class="hint">"Nueva partida" devuelve a todos {{ formatChips(s.settings.startingChips) }} fichas. Con "Recompras" das fichas solo a algunos.</p>
          </template>
          <p v-else class="hint">Espera a que el dealer empiece una nueva partida o te haga una recompra.</p>
        </div>
      </Transition>

      <!-- controles del dealer -->
      <div v-if="s.isDealer && !gameOver && !myTurn" class="dealer">
        <div class="dl-tag"><span>🎩</span> Dealer</div>
        <template v-if="!live">
          <button class="btn btn-primary btn-lg grow" :disabled="!canStart || busy" @click="run('dealer:start')">
            <Icon name="play" :size="18" />Repartir mano {{ (s.handNo || 0) + 1 }}
          </button>
          <button class="icon-btn big" title="Ajustes de la mesa" @click="openMenu('settings')"><Icon name="settings" /></button>
        </template>
        <template v-else-if="hand.awaiting && !random">
          <button class="btn btn-primary btn-lg grow glow" @click="openPicker('board')">
            <Icon name="cards" :size="18" />Poner el {{ STAGE_LABEL[hand.awaiting] }}
          </button>
          <button v-if="offline && hand.stage !== 'preflop'" class="btn btn-sm btn-ghost" :disabled="busy" title="Corregir cartas" @click="run('dealer:undoBoard')"><Icon name="undo" :size="16" /></button>
        </template>
        <template v-else-if="hand.stage === 'showdown'">
          <button class="btn btn-success btn-lg grow glow" @click="showShowdown = true">
            <Icon name="trophy" :size="18" />{{ offline ? 'Elegir ganador' : 'Repartir el bote' }}
          </button>
        </template>
        <template v-else>
          <div class="grow small muted">Turno de <b class="txt">{{ toActName }}</b></div>
          <button v-if="hand.toAct && hand.toAct !== s.me" class="btn btn-sm" :disabled="busy" @click="run('dealer:forceFold', { userId: hand.toAct })">Forzar</button>
          <button v-if="hand.stage !== 'preflop' && !random" class="btn btn-sm btn-ghost" :disabled="busy" title="Corregir cartas" @click="run('dealer:undoBoard')"><Icon name="undo" :size="16" /></button>
        </template>
      </div>
      <p v-if="s.isDealer && !canStart && !live && !gameOver" class="hint center">
        {{ offline ? 'Se necesitan al menos 2 jugadores activos.' : 'Se necesitan al menos 2 jugadores activos con fichas.' }}
      </p>

      <!-- jugador -->
      <div v-if="me && live" class="player">
        <div class="mine">
          <button class="hole" :class="{ locked: random }" :aria-label="random ? 'Tus cartas' : 'Elegir mis cartas'" @click="openPicker('hole')">
            <PlayingCard :card="myCards[0] || ''" placeholder :size="myTurn ? 'md' : 'lg'" :dim="me.folded">?</PlayingCard>
            <PlayingCard :card="myCards[1] || ''" placeholder :size="myTurn ? 'md' : 'lg'" :dim="me.folded">?</PlayingCard>
            <span v-if="!random" class="edit"><Icon name="edit" :size="13" /></span>
          </button>
          <EquityPanel v-if="!me.folded" class="grow" :hole="myCards" :board="hand.board" :opponents="opponents" :compact="myTurn" />
          <div v-else class="grow folded-msg">Te has retirado de esta mano</div>
        </div>
        <button v-if="offline && !me.folded && hand.stage !== 'showdown'" class="btn btn-danger btn-block" :disabled="busy" @click="run('table:fold')">Retirarme de esta mano</button>
        <Transition name="slide">
          <div v-if="myTurn && !offline" class="padwrap">
            <ChipBetPad :legal="s.legal" :chips="s.chips" :pot="totalPot" :busy="busy" @action="doAction" />
          </div>
        </Transition>
      </div>
      <div v-else-if="mySeat && !s.isDealer && !gameOver" class="waiting">
        <template v-if="mySeat.status === 'sitout'">
          <span>Estás fuera de la mesa</span>
          <button class="btn btn-sm btn-primary" @click="run('table:sitout', { sitout: false })">Volver a jugar</button>
        </template>
        <template v-else-if="mySeat.chips <= 0 && !offline">Sin fichas · pide al dealer una recompra</template>
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
    <ShowdownSheet
      :open="showShowdown && s.isDealer && hand?.stage === 'showdown'"
      :state="s"
      :busy="busy"
      @close="showShowdown = false"
      @resolve="resolve"
    />
    <TableMenu :open="menu.open" :initial-tab="menu.tab" :state="s" :run="run" @close="menu.open = false" />
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
.sub { display: flex; align-items: center; gap: 6px; color: var(--text-2); flex-wrap: wrap; }
.mbadge { font-weight: 700; color: var(--text); }
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
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 12%; pointer-events: none; }
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
.icon-btn.big { width: 54px; height: 54px; border-radius: 16px; }
.txt { color: var(--text); }
.glow { animation: glow 1.8s infinite; }
@keyframes glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 181, 68, 0.5); } 50% { box-shadow: 0 0 0 8px rgba(245, 181, 68, 0); } }
.center { text-align: center; }
.gameover {
  width: 100%; max-width: 640px; margin: 0 auto; padding: 16px; border-radius: 20px; display: flex; flex-direction: column; gap: 12px;
  background: radial-gradient(circle at 0% 0%, rgba(245, 181, 68, 0.22), transparent 60%), rgba(22, 31, 69, 0.92);
  border: 1px solid rgba(245, 181, 68, 0.4);
}
.go-head { display: flex; align-items: center; gap: 14px; }
.go-name { font-size: 18px; }
.go-actions { gap: 8px; }
.player { width: 100%; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.mine { display: flex; gap: 12px; align-items: center; }
.hole { position: relative; display: flex; gap: 6px; padding: 0; }
.hole.locked { cursor: default; }
.hole .edit { position: absolute; right: -6px; bottom: -6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #2a1700; box-shadow: 0 3px 8px rgba(0,0,0,.5); }
.folded-msg { color: var(--text-3); font-weight: 600; }
.padwrap { padding: 12px 0 2px; border-top: 1px solid var(--line); }
.waiting { text-align: center; color: var(--text-2); font-weight: 600; padding: 12px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; }
.linkbtn { color: var(--gold-2); font-weight: 700; text-decoration: underline; }
.loading-page { height: 100dvh; display: grid; place-items: center; }

.slide-enter-active { transition: transform 0.5s var(--ease), opacity 0.35s; }
.slide-leave-active { transition: transform 0.25s ease, opacity 0.2s; }
.slide-enter-from, .slide-leave-to { transform: translateY(40px); opacity: 0; }

@media (max-width: 1099px) {
  /* en móvil la mesa nunca se aplasta: si el panel no cabe, la página hace scroll */
  .tp { overflow-y: auto; overscroll-behavior: contain; }
  .felt-zone { min-height: 330px; }
  .dock { max-height: none; overflow: visible; }
}
@media (max-width: 700px) {
  .felt-zone { padding: 40px 34px 44px; }
  .felt { border-radius: 46% / 40%; max-height: none; }
  .center { padding: 12% 6% 0; }
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
