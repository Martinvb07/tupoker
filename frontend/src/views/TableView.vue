<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSocket, emit, connected } from '@/lib/socket.js';
import { toast } from '@/lib/store.js';
import { formatChips, STAGE_LABEL, modeInfo } from '@/lib/format.js';
import Icon from '@/components/Icon.vue';
import Seat from '@/components/Seat.vue';
import Avatar from '@/components/Avatar.vue';
import Chip from '@/components/Chip.vue';
import PlayingCard from '@/components/PlayingCard.vue';
import CardPicker from '@/components/CardPicker.vue';
import ChipBetPad from '@/components/ChipBetPad.vue';
import EquityPanel from '@/components/EquityPanel.vue';
import ShareSheet from '@/components/ShareSheet.vue';
import ShowdownSheet from '@/components/ShowdownSheet.vue';
import TableMenu from '@/components/TableMenu.vue';
import Sheet from '@/components/Sheet.vue';
import ShowdownStrip from '@/components/ShowdownStrip.vue';
import ScanButton from '@/components/ScanButton.vue';
import { scanEnabled, checkScan } from '@/lib/vision.js';

const route = useRoute();
const router = useRouter();
const code = computed(() => String(route.params.code).toUpperCase());

const s = ref(null); // estado de la mesa
const busy = ref(false);
const showShare = ref(route.query.share === '1');
const menu = ref({ open: false, tab: 'players' });
const showShowdown = ref(false);
const picker = ref({ open: false, mode: null });

// ---------- reloj (cuentas atrás sincronizadas con el servidor) ----------
const now = ref(Date.now());
let clockOffset = 0;
let tick;
const serverNow = computed(() => now.value + clockOffset);
const secondsTo = (ts) => (ts ? Math.max(0, Math.ceil((ts - serverNow.value) / 1000)) : 0);

// ---------- móvil ----------
const mq = window.matchMedia('(max-width: 700px)');
const isMobile = ref(mq.matches);
const onMq = (e) => (isMobile.value = e.matches);

const hand = computed(() => s.value?.hand);
const live = computed(() => !!hand.value && hand.value.stage !== 'done');
// el modo de la mano en curso manda; entre manos, el de la mesa
const mode = computed(() => (live.value ? hand.value.mode : s.value?.settings.mode) || 'live');
const offline = computed(() => mode.value === 'offline');
const random = computed(() => mode.value === 'random');
const manager = computed(() => !!s.value?.canManage);
const showDealerBar = computed(() => manager.value && !random.value);
const me = computed(() => hand.value?.players.find((p) => p.userId === s.value.me) || null);
const mySeat = computed(() => s.value?.seats.find((x) => x.userId === s.value.me));
const myTurn = computed(() => !!s.value?.legal);
const myCards = computed(() => me.value?.cards || []);
const seatsById = computed(() => Object.fromEntries((s.value?.seats || []).map((x) => [x.userId, x])));
const nameOf = (id) => (id === s.value?.me ? 'Tú' : seatsById.value[id]?.displayName || '—');
const opponents = computed(() => (hand.value ? hand.value.players.filter((p) => !p.folded && p.userId !== s.value.me).length : 0));
const totalPot = computed(() => (hand.value ? hand.value.players.reduce((a, p) => a + p.total, 0) : 0));

// ---------- cartas comunes una a una ----------
const shown = ref(0);
let lastHandNo = null;
let revealTimer = null;
let runout = false; // llegaron varias calles de golpe (all-in): cada una sale con su pausa
const streetLeft = (n) => (n < 3 ? 3 - n : 1); // cartas que faltan para cerrar la calle actual
function revealStep() {
  if (revealTimer) return;
  const len = hand.value?.board.length || 0;
  if (shown.value >= len) {
    runout = false;
    return;
  }
  const next = shown.value + 1;
  let delay;
  if (next <= 3) delay = next === 1 ? (runout ? 900 : 120) : 450; // flop: carta a carta
  else delay = runout ? 1800 : 250; // turn / river: en all-in, suspense entre calles
  revealTimer = setTimeout(() => {
    revealTimer = null;
    shown.value = next;
    revealStep();
  }, delay);
}
watch(
  () => [hand.value?.no, hand.value?.board.length],
  () => {
    const h = hand.value;
    const len = h?.board.length || 0;
    if (!h) {
      shown.value = 0;
      return;
    }
    if (lastHandNo === null) shown.value = len; // al entrar a media mano no se anima
    else if (h.no !== lastHandNo || len < shown.value) shown.value = Math.min(len, h.no !== lastHandNo ? 0 : len);
    lastHandNo = h.no;
    if (len - shown.value > streetLeft(shown.value)) runout = true;
    revealStep();
  },
);
const revealing = computed(() => !!hand.value && shown.value < hand.value.board.length);
// lo que se pinta en la mesa mientras se destapan cartas (resultados ocultos hasta el final)
const view = computed(() => {
  const h = hand.value;
  if (!h || !revealing.value) return h;
  const done = h.stage === 'done';
  return {
    ...h,
    board: h.board.slice(0, shown.value),
    stage: done ? 'showdown' : h.stage,
    result: done ? null : h.result,
    handNames: {},
    players: done ? h.players.map((p) => ({ ...p, stack: p.stack - (p.won || 0), won: 0 })) : h.players,
  };
});

// ---------- asientos ----------
const layout = computed(() => {
  if (!s.value) return [];
  const seats = [...s.value.seats];
  const myIdx = seats.findIndex((x) => x.userId === s.value.me);
  const ordered = myIdx >= 0 ? [...seats.slice(myIdx), ...seats.slice(0, myIdx)] : seats;
  const pos = (seat, a, rx = 47, ry = 45) => {
    const cos = Math.cos(a), sin = Math.sin(a);
    return { seat, x: 50 + cos * rx, y: 50 + sin * ry, dir: { x: -cos, y: -sin } };
  };
  if (isMobile.value && myIdx >= 0) {
    // en móvil tu info va en el panel de abajo: los rivales se reparten por arriba
    const others = ordered.slice(1);
    const n = others.length;
    return others.map((seat, i) => pos(seat, Math.PI + ((i + 1) * Math.PI) / (n + 1), 44, 50));
  }
  const n = ordered.length;
  return ordered.map((seat, i) => pos(seat, Math.PI / 2 + (i * 2 * Math.PI) / n));
});

const handNames = computed(() => view.value?.handNames || {});

// ---------- cartas boca arriba (all-in / showdown) ----------
const stripFinal = computed(() => !revealing.value && view.value?.stage === 'done');
const stripAllIn = computed(() => !!hand.value?.players.some((p) => p.allIn && !p.folded));
const revealed = computed(() => {
  const h = view.value;
  if (!h || !s.value) return [];
  const list = h.players.filter((p) => !p.folded && p.cards?.length === 2);
  if (list.length < 2 || !list.some((p) => p.userId !== s.value.me)) return [];
  const r = hand.value?.result;
  const isWinner = (id) => !!r && (h.mode === 'offline' ? r.winners.includes(id) : (r.payout?.[id] || 0) > 0);
  return list.map((p) => ({
    userId: p.userId,
    seat: seatsById.value[p.userId] || { displayName: '—' },
    cards: p.cards,
    isMe: p.userId === s.value.me,
    winner: stripFinal.value && isWinner(p.userId),
  }));
});
const winnerText = computed(() => {
  const h = view.value;
  const r = h?.result;
  if (!r || h.stage !== 'done') return '';
  if (h.mode === 'offline') {
    return r.winners.map((id) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`).join(' · ');
  }
  return Object.entries(r.payout)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'} ${formatChips(v)}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`)
    .join(' · ');
});

// ---------- partida terminada / recompras ----------
const activeSeats = computed(() => (s.value?.seats || []).filter((x) => x.status === 'active'));
const withChips = computed(() => activeSeats.value.filter((x) => x.chips > 0));
const gameOver = computed(() => !!s.value && !offline.value && !live.value && !revealing.value && activeSeats.value.length >= 2 && withChips.value.length < 2);
const champion = computed(() => (gameOver.value && withChips.value.length === 1 ? withChips.value[0] : null));
const canStart = computed(() => {
  if (live.value) return false;
  if (!manager.value && !(random.value && mySeat.value)) return false;
  return (offline.value ? activeSeats.value.length : withChips.value.length) >= 2;
});
// en vivo: peticiones que aprueba el dealer
const rebuyRequests = computed(() =>
  manager.value && !random.value ? (s.value?.seats || []).filter((x) => x.rebuyRequest && !x.rebuyRequest.needed) : [],
);
// aleatorio: recompras que votan todos los demás jugadores (se juega con dinero real)
const voteRequests = computed(() => (s.value?.seats || []).filter((x) => x.rebuyRequest?.needed));
// en vivo, una recompra pendiente pausa la partida hasta que el dealer asigna las fichas
const paused = computed(() => (s.value?.settings.mode || 'live') === 'live' && (s.value?.seats || []).find((x) => x.rebuyRequest));
const allVoted = (r) => r.rebuyRequest.approvals.length >= r.rebuyRequest.needed.length;
const assignAmount = ref({});
async function assignRebuy(r) {
  const amount = assignAmount.value[r.userId] || r.rebuyRequest.amount;
  if (await run('dealer:rebuy', { userId: r.userId, approve: true, amount })) toast.success(`Fichas asignadas a ${r.displayName}`);
}
// escaneo de tus cartas (una vez por mano)
async function saveMyCards(cards) {
  if (cards.length === 2) {
    if (await run('table:cards', { cards })) toast.success('Cartas guardadas');
  } else picker.value = { open: true, mode: 'hole', initial: cards };
}
const canRebuy = computed(() => !!mySeat.value && !offline.value && (!me.value || me.value.folded || !live.value));
const rebuyLabel = computed(() => 'Pedir recompra');
const rebuyOpen = ref(false);
const rebuyAmount = ref(0);
const rebuyOptions = computed(() => {
  const st = s.value.settings.startingChips;
  return [...new Set([Math.round(st / 2), st, st * 2].filter((v) => v >= s.value.settings.minBet))];
});
function rebuy() {
  rebuyAmount.value = s.value.settings.startingChips;
  rebuyOpen.value = true;
}
async function confirmRebuy() {
  if (!(await run('table:rebuy', { amount: rebuyAmount.value }))) return;
  rebuyOpen.value = false;
  menu.value.open = false;
  toast.success(random.value ? 'Petición enviada: todos tienen que aceptarla' : 'Petición enviada: la partida queda en pausa');
}
const nameOfSeat = (id) => (id === s.value?.me ? 'Tú' : seatsById.value[id]?.displayName || '—');

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
  clockOffset = st.serverNow - Date.now();
  s.value = st;
  if (st.legal && !wasMyTurn) navigator.vibrate?.([30, 40, 30]);
  if (st.status === 'closed') {
    toast('La mesa se ha cerrado');
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
  tick = setInterval(() => (now.value = Date.now()), 250);
  checkScan();
  mq.addEventListener('change', onMq);
});
onUnmounted(() => {
  sock.off('table:state', onState);
  sock.off('table:kicked', onKicked);
  sock.off('connect', subscribe);
  sock.emit('table:unsubscribe', { code: code.value });
  clearInterval(tick);
  clearTimeout(revealTimer);
  mq.removeEventListener('change', onMq);
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
    return { count: 2, title: 'Tus cartas', initial: picker.value.initial || myCards.value, disabled: h?.board || [], label: 'Guardar mis cartas' };
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

watch(
  () => hand.value?.awaiting,
  (aw) => {
    if (aw && manager.value && !random.value && !offline.value) setTimeout(() => openPicker('board'), 450);
    if (!aw && picker.value.mode === 'board') picker.value.open = false;
  },
);
watch(
  () => hand.value?.stage,
  (st) => {
    if (st === 'showdown' && manager.value && !random.value) showShowdown.value = true;
    if (st !== 'showdown') showShowdown.value = false;
    if (st === 'preflop' && me.value && !myCards.value.length && !random.value) {
      toast(scanEnabled.value ? 'Nueva mano: escanea tus cartas para ver tu probabilidad' : 'Nueva mano: registra tus cartas para ver tu probabilidad', 'info', 3000);
    }
  },
);

const boardSlots = computed(() => Array.from({ length: 5 }, (_, i) => view.value?.board[i] || ''));
const toActName = computed(() => (hand.value?.toAct ? nameOf(hand.value.toAct) : ''));
const turnLeft = computed(() => secondsTo(hand.value?.turnDeadline));
const nextHandIn = computed(() => secondsTo(s.value?.nextHandAt));
const statusLine = computed(() => {
  const h = view.value;
  if (!s.value) return '';
  if (paused.value) return `En pausa · recompra de ${nameOf(paused.value.userId)}`;
  if (revealing.value) return 'Repartiendo cartas…';
  if (gameOver.value) return champion.value ? `${nameOf(champion.value.userId)} ganó la partida` : 'Partida terminada';
  if (!h || h.stage === 'done') {
    if (random.value) return nextHandIn.value ? `Siguiente mano en ${nextHandIn.value}s` : 'Esperando jugadores';
    return manager.value ? 'Listo para repartir' : 'Esperando al dealer';
  }
  if (h.awaiting) return `El dealer pone el ${STAGE_LABEL[h.awaiting]}`;
  if (h.stage === 'showdown') return offline.value ? 'Showdown: el dealer confirma quién gana' : 'Showdown: el dealer reparte el bote';
  const t = random.value && turnLeft.value ? ` · ${turnLeft.value}s` : '';
  if (h.toAct === s.value.me) return `¡Es tu turno!${t}`;
  if (h.toAct) return `Turno de ${toActName.value}${t}`;
  return STAGE_LABEL[h.stage];
});
const info = computed(() => modeInfo(mode.value));
const myView = computed(() => view.value?.players.find((p) => p.userId === s.value?.me) || null);
const myBadge = computed(() => {
  const h = view.value;
  if (!h || !myView.value) return '';
  if (h.buttonId === s.value.me) return 'D';
  if (h.stage === 'preflop' && h.sbId === s.value.me) return 'SB';
  if (h.stage === 'preflop' && h.bbId === s.value.me) return 'BB';
  return '';
});
</script>

<template>
  <div class="tp" :class="{ turn: myTurn && !offline, mobile: isMobile }" v-if="s">
    <!-- barra superior -->
    <header class="bar">
      <button class="icon-btn" aria-label="Volver" @click="router.push(s.groupId ? `/grupos/${s.groupId}` : '/')"><Icon name="left" /></button>
      <div class="title grow">
        <div class="ellipsis tname">{{ s.name }}</div>
        <div class="sub small">
          <span class="dotc" :class="{ on: connected }"></span>
          <span class="mbadge"><Icon :name="info.icon" :size="13" />{{ info.short }}</span>
          <template v-if="hand">· #{{ hand.no }}</template>
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
            <PlayingCard v-for="(c, i) in boardSlots" :key="i" :card="c" :placeholder="!c" :size="isMobile && myTurn ? 'sm' : 'md'" class="bslot"><span></span></PlayingCard>
          </div>
          <Transition name="fade" mode="out-in">
            <div :key="statusLine.replace(/\d+s$/, '') + winnerText" class="status" :class="{ mine: myTurn && !paused, win: (winnerText || gameOver) && !paused, pause: paused }">
              {{ paused ? statusLine : winnerText || statusLine }}
            </div>
          </Transition>
        </div>

        <div v-for="l in layout" :key="l.seat.userId" class="seat-pos" :style="{ left: l.x + '%', top: l.y + '%' }">
          <Seat
            :seat="l.seat"
            :player="view?.players.find((p) => p.userId === l.seat.userId)"
            :hand="view"
            :mode="mode"
            :is-me="l.seat.userId === s.me"
            :is-dealer="!random && l.seat.userId === s.dealerId"
            :hand-name="handNames[l.seat.userId]"
            :bet-dir="l.dir"
            :seconds-left="random && hand?.toAct === l.seat.userId ? turnLeft : 0"
            :bet-reach="isMobile ? 0.68 : 1"
          />
        </div>
      </div>
    </section>

    <!-- dock inferior -->
    <section class="dock">
      <!-- en móvil, tu asiento vive aquí -->
      <div v-if="isMobile && mySeat" class="mebar">
        <Avatar :user="mySeat" :size="28" />
        <b class="num">{{ offline ? 'Tú' : formatChips(myView ? myView.stack : mySeat.chips) }}</b>
        <span v-if="myBadge" class="mb-badge">{{ myBadge }}</span>
        <span v-if="myView?.bet > 0" class="mb-bet num"><Chip :value="myView.bet" :index="0" :size="18" />{{ formatChips(myView.bet) }}</span>
        <span v-if="!random && s.dealerId === s.me" class="mb-dealer"><Icon name="dealer" :size="13" />Dealer</span>
        <span class="grow"></span>
        <span v-if="myTurn && random && turnLeft" class="mb-timer num" :class="{ low: turnLeft <= 10 }">{{ turnLeft }}s</span>
      </div>

      <!-- cartas de todos a la vista (all-in / showdown) -->
      <Transition name="slide">
        <ShowdownStrip v-if="revealed.length" :players="revealed" :board="view.board" :final="stripFinal" :all-in="stripAllIn" />
      </Transition>

      <!-- partida terminada -->
      <Transition name="slide">
        <div v-if="gameOver" class="gameover">
          <div class="go-head">
            <Avatar v-if="champion" :user="champion" :size="48" ring />
            <div class="grow">
              <div class="eyebrow">Partida terminada</div>
              <b class="go-name">{{ champion ? `${nameOf(champion.userId)} se queda con todo` : 'Nadie más tiene fichas' }}</b>
            </div>
          </div>
          <div class="row go-actions">
            <button v-if="manager" class="btn btn-primary grow" :disabled="busy" @click="newGame"><Icon name="rotate" :size="18" />Nueva partida</button>
            <button v-if="canRebuy && mySeat.chips <= 0" class="btn grow" :class="{ 'btn-primary': !manager }" :disabled="busy || !!mySeat.rebuyRequest" @click="rebuy">
              <Icon name="coins" :size="18" />{{ mySeat.rebuyRequest ? 'Recompra pedida' : rebuyLabel }}
            </button>
            <button v-if="manager && !random" class="btn" @click="openMenu('players')"><Icon name="users" :size="18" /></button>
          </div>
          <p class="hint">"Nueva partida" devuelve a todos {{ formatChips(s.settings.startingChips) }} fichas. Con recompra entra quien quiera seguir.</p>
        </div>
      </Transition>

      <!-- recompras pendientes (dealer) -->
      <TransitionGroup name="list" tag="div" class="requests" v-if="rebuyRequests.length">
        <div v-for="r in rebuyRequests" :key="r.userId" class="req">
          <Avatar :user="r" :size="30" />
          <span class="grow small"><b>{{ r.displayName }}</b> pide recompra de <b class="num">{{ formatChips(r.rebuyRequest.amount) }}</b></span>
          <button class="icon-btn ok" :disabled="busy" aria-label="Aprobar" @click="run('dealer:rebuy', { userId: r.userId, approve: true })"><Icon name="check" :size="18" /></button>
          <button class="icon-btn" :disabled="busy" aria-label="Rechazar" @click="run('dealer:rebuy', { userId: r.userId, approve: false })"><Icon name="x" :size="18" /></button>
        </div>
      </TransitionGroup>

      <!-- recompras votadas: en aleatorio se aplican al aceptar todos; en vivo la partida se pausa y el dealer asigna -->
      <TransitionGroup name="list" tag="div" class="requests" v-if="voteRequests.length">
        <div v-for="r in voteRequests" :key="r.userId" class="req vote">
          <Avatar :user="r" :size="30" />
          <div class="grow small">
            <div>
              <b>{{ r.userId === s.me ? 'Tu recompra' : r.displayName }}</b>
              {{ r.userId === s.me ? 'de' : 'quiere recomprar' }}
              <b class="num">{{ formatChips(r.rebuyRequest.amount) }}</b>
            </div>
            <div v-if="r.rebuyRequest.dealerAssign" class="small faint">
              {{ allVoted(r) ? 'Todos aceptaron · el dealer asigna las fichas' : 'Partida en pausa hasta que todos acepten' }}
            </div>
            <div class="votes">
              <span v-for="id in r.rebuyRequest.needed" :key="id" class="vchip" :class="{ ok: r.rebuyRequest.approvals.includes(id) }">
                <Icon :name="r.rebuyRequest.approvals.includes(id) ? 'check' : 'timer'" :size="11" /> {{ nameOfSeat(id) }}
              </span>
            </div>
          </div>
          <template v-if="r.rebuyRequest.needed.includes(s.me) && !r.rebuyRequest.approvals.includes(s.me)">
            <button class="icon-btn ok" :disabled="busy" aria-label="Aceptar" @click="run('table:rebuyVote', { userId: r.userId, approve: true })"><Icon name="check" :size="18" /></button>
            <button class="icon-btn" :disabled="busy" aria-label="Rechazar" @click="run('table:rebuyVote', { userId: r.userId, approve: false })"><Icon name="x" :size="18" /></button>
          </template>
          <div v-else-if="r.rebuyRequest.dealerAssign && manager" class="assign">
            <template v-if="allVoted(r)">
              <input v-model.number="assignAmount[r.userId]" class="input num" type="number" min="1" :placeholder="String(r.rebuyRequest.amount)" />
              <button class="btn btn-sm btn-primary" :disabled="busy" @click="assignRebuy(r)"><Icon name="coins" :size="15" />Asignar</button>
            </template>
            <button class="icon-btn" :disabled="busy" aria-label="Rechazar" @click="run('dealer:rebuy', { userId: r.userId, approve: false })"><Icon name="x" :size="18" /></button>
          </div>
          <button v-else-if="r.userId === s.me" class="btn btn-sm btn-ghost" :disabled="busy" @click="run('table:cancelRebuy')">Cancelar</button>
        </div>
      </TransitionGroup>

      <!-- controles del dealer (en vivo / sin dinero) -->
      <div v-if="showDealerBar && !gameOver && !myTurn" class="dealer">
        <div class="dl-tag"><Icon name="dealer" :size="15" />Dealer</div>
        <template v-if="!live">
          <button class="btn btn-primary btn-lg grow" :disabled="!canStart || busy || !!paused" @click="run('dealer:start')">
            <Icon name="play" :size="18" />Repartir mano {{ (s.handNo || 0) + 1 }}
          </button>
          <button class="icon-btn big" title="Ajustes de la mesa" @click="openMenu('settings')"><Icon name="settings" /></button>
        </template>
        <template v-else-if="hand.awaiting">
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
          <button v-if="hand.stage !== 'preflop'" class="btn btn-sm btn-ghost" :disabled="busy" title="Corregir cartas" @click="run('dealer:undoBoard')"><Icon name="undo" :size="16" /></button>
        </template>
      </div>
      <p v-if="showDealerBar && !canStart && !live && !gameOver" class="hint center">
        {{ offline ? 'Se necesitan al menos 2 jugadores activos.' : 'Se necesitan al menos 2 jugadores activos con fichas.' }}
      </p>

      <!-- modo aleatorio: sin dealer, las manos salen solas -->
      <div v-if="random && !live && !gameOver && !revealing" class="autobar">
        <template v-if="nextHandIn">
          <div class="countdown num">{{ nextHandIn }}</div>
          <span class="grow">Siguiente mano en {{ nextHandIn }}s</span>
        </template>
        <template v-else>
          <span class="grow small muted">{{ canStart ? 'Las manos se reparten solas. ¡Empezad cuando estéis!' : 'Esperando a que haya 2 jugadores conectados con fichas' }}</span>
          <button class="btn btn-primary" :disabled="!canStart || busy" @click="run('dealer:start')"><Icon name="play" :size="16" />Repartir</button>
        </template>
        <button v-if="manager" class="icon-btn" title="Ajustes de la mesa" @click="openMenu('settings')"><Icon name="settings" :size="18" /></button>
      </div>

      <!-- jugador -->
      <div v-if="me && live && !revealed.length" class="player">
        <div class="mine">
          <button class="hole" :class="{ locked: random }" :aria-label="random ? 'Tus cartas' : 'Elegir mis cartas'" @click="openPicker('hole')">
            <PlayingCard :card="myCards[0] || ''" placeholder :size="myTurn ? (isMobile ? 'sm' : 'md') : 'lg'" :dim="me.folded">?</PlayingCard>
            <PlayingCard :card="myCards[1] || ''" placeholder :size="myTurn ? (isMobile ? 'sm' : 'md') : 'lg'" :dim="me.folded" :delay="0.28">?</PlayingCard>
            <span v-if="!random" class="edit"><Icon name="edit" :size="13" /></span>
          </button>
          <div v-if="!random && !me.folded && myCards.length < 2 && scanEnabled" class="grow scanbox">
            <ScanButton big :expected="2" :exclude="hand.board" label="Escanear mis cartas" @cards="saveMyCards" />
            <button class="linkbtn small" @click="openPicker('hole')">o elegirlas a mano</button>
          </div>
          <EquityPanel v-else-if="!me.folded" class="grow" :hole="myCards" :board="view.board" :opponents="opponents" :compact="myTurn" :mini="myTurn && isMobile" />
          <div v-else class="grow folded-msg">Te has retirado de esta mano</div>
        </div>
        <button v-if="offline && !me.folded && hand.stage !== 'showdown'" class="btn btn-danger btn-block" :disabled="busy" @click="run('table:fold')">Retirarme de esta mano</button>
        <Transition name="slide">
          <div v-if="myTurn && !offline && paused" class="paused-note"><Icon name="pause" :size="16" />Tu turno espera: la partida está en pausa por una recompra</div>
          <div v-else-if="myTurn && !offline" class="padwrap">
            <ChipBetPad :legal="s.legal" :chips="s.chips" :pot="totalPot" :busy="busy" :compact="isMobile" @action="doAction" />
          </div>
        </Transition>
      </div>
      <div v-else-if="mySeat && !gameOver && !(showDealerBar && !(mySeat.status === 'sitout' && !live))" class="waiting">
        <template v-if="mySeat.status === 'sitout'">
          <span>{{ mySeat.timeouts >= 2 ? 'Te sentamos fuera por inactividad' : 'Estás fuera de la mesa' }}</span>
          <button class="btn btn-sm btn-primary" @click="run('table:sitout', { sitout: false })">Volver a jugar</button>
        </template>
        <template v-else-if="mySeat.chips <= 0 && !offline">
          <span>Te quedaste sin fichas</span>
          <button class="btn btn-sm btn-primary" :disabled="busy || !!mySeat.rebuyRequest" @click="rebuy">
            {{ mySeat.rebuyRequest ? 'Recompra pedida…' : rebuyLabel }}
          </button>
        </template>
        <template v-else-if="live">Entrarás en la siguiente mano</template>
        <template v-else-if="!random">Esperando a que el dealer reparta…</template>
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
    <ShareSheet :open="showShare" :code="s.code" invite-friends @close="showShare = false" />
    <Sheet :open="rebuyOpen" title="Recompra" :width="420" @close="rebuyOpen = false">
      <p class="muted">
        {{ random ? 'Como se juega con dinero real, todos los demás jugadores tienen que aceptarla.' : 'La partida se pausa hasta que todos acepten y el dealer te asigne las fichas.' }}
      </p>
      <div class="rb-opts">
        <button v-for="v in rebuyOptions" :key="v" class="rb-opt" :class="{ on: rebuyAmount === v }" @click="rebuyAmount = v">
          <Chip :value="v" :index="rebuyOptions.indexOf(v) + 1" :size="54" />
          <b class="num">{{ formatChips(v) }}</b>
        </button>
      </div>
      <label class="field">
        <span>Otra cantidad</span>
        <input v-model.number="rebuyAmount" class="input num" type="number" :min="s.settings.minBet" inputmode="numeric" />
      </label>
      <template #footer>
        <button class="btn btn-primary btn-lg btn-block" :disabled="busy || !(rebuyAmount >= s.settings.minBet)" @click="confirmRebuy">
          <Icon name="coins" :size="18" />{{ random ? 'Pedir' : manager ? 'Recomprar' : 'Pedir' }} {{ formatChips(rebuyAmount || 0) }}
        </button>
      </template>
    </Sheet>
    <ShowdownSheet
      :open="showShowdown && manager && hand?.stage === 'showdown'"
      :state="s"
      :busy="busy"
      @close="showShowdown = false"
      @resolve="resolve"
    />
    <TableMenu :open="menu.open" :initial-tab="menu.tab" :state="s" :run="run" :can-rebuy="canRebuy" :rebuy-label="rebuyLabel" @rebuy="rebuy" @close="menu.open = false" />
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
.mbadge { font-weight: 700; color: var(--text); display: inline-flex; align-items: center; gap: 4px; }
.mbadge svg { color: var(--gold-2); }
.dotc { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
.dotc.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.codebtn {
  display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border-radius: 12px;
  font-weight: 900; letter-spacing: 0.12em; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); border: 1px solid rgba(245, 181, 68, 0.35);
}

.felt-zone { flex: 1; min-height: 0; display: grid; place-items: center; padding: 34px 40px 40px; transition: padding 0.4s var(--ease); }
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
.status.pause { color: #2a1700; background: linear-gradient(90deg, var(--gold-2), var(--gold)); }
.status.win { color: #052e16; background: linear-gradient(90deg, #4ade80, #22c55e); }
@keyframes winpop { 0% { transform: scale(0.85); } 100% { transform: scale(1); } }
.seat-pos { position: absolute; transform: translate(-50%, -50%); z-index: 5; transition: left 0.6s var(--ease), top 0.6s var(--ease); }

.dock {
  flex: none; padding: 10px 14px calc(12px + var(--safe-b)); display: flex; flex-direction: column; gap: 10px;
  background: linear-gradient(180deg, rgba(11, 16, 38, 0), rgba(11, 16, 38, 0.95) 22%);
  max-height: 70dvh; overflow-y: auto;
}
.dock > * { width: 100%; max-width: 640px; margin-left: auto; margin-right: auto; }
.mebar {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 14px;
  background: rgba(22, 31, 69, 0.85); border: 1px solid rgba(245, 181, 68, 0.3);
}
.mebar b { color: var(--gold-2); font-size: 15px; }
.mb-badge { min-width: 24px; height: 22px; padding: 0 6px; border-radius: 99px; background: #fff; color: #111; font-size: 11px; font-weight: 900; display: grid; place-items: center; }
.mb-bet { display: flex; align-items: center; gap: 4px; font-weight: 800; font-size: 13px; padding: 2px 8px 2px 2px; border-radius: 99px; background: rgba(0, 0, 0, 0.4); }
.mb-dealer { font-size: 12px; font-weight: 700; color: var(--gold-2); display: inline-flex; align-items: center; gap: 4px; }
.mb-timer { font-weight: 900; padding: 2px 10px; border-radius: 99px; background: rgba(245, 181, 68, 0.18); color: var(--gold-2); }
.mb-timer.low { background: rgba(244, 63, 94, 0.25); color: #fecdd3; animation: winpop 0.5s infinite alternate; }
.dealer {
  display: flex; align-items: center; gap: 10px; padding: 8px; padding-left: 12px; border-radius: 18px;
  background: rgba(22, 31, 69, 0.85); border: 1px solid rgba(245, 181, 68, 0.25);
}
.dl-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-2); white-space: nowrap; }
.icon-btn.big { width: 54px; height: 54px; border-radius: 16px; }
.icon-btn.ok { background: rgba(34, 197, 94, 0.18); border-color: rgba(34, 197, 94, 0.5); color: #86efac; }
.txt { color: var(--text); }
.glow { animation: glow 1.8s infinite; }
@keyframes glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 181, 68, 0.5); } 50% { box-shadow: 0 0 0 8px rgba(245, 181, 68, 0); } }
.center { text-align: center; }
.autobar {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px;
  background: rgba(22, 31, 69, 0.85); border: 1px solid var(--line-2); font-weight: 700;
}
.countdown {
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 18px; color: #2a1700;
  background: conic-gradient(var(--gold) 0 100%); box-shadow: 0 0 0 4px rgba(245, 181, 68, 0.25); animation: winpop 1s infinite alternate;
}
.requests { display: flex; flex-direction: column; gap: 6px; }
.req { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 16px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.3); }
.req { flex-wrap: wrap; }
.req.vote > .grow { flex: 1 1 180px; }
.assign { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex: 1 1 100%; }
.assign .input { width: 110px; height: 38px; padding: 0 10px; }
.scanbox { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.paused-note { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 14px; font-weight: 700; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); border: 1px dashed rgba(245, 181, 68, 0.4); }
.req.vote { background: rgba(245, 181, 68, 0.08); border-color: rgba(245, 181, 68, 0.35); }
.votes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.vchip { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.07); color: var(--text-3); }
.vchip.ok { background: rgba(34, 197, 94, 0.18); color: #86efac; }
.rb-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; margin: 14px 0; }
.rb-opt {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border-radius: 16px;
  background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); transition: all 0.25s var(--spring);
}
.rb-opt.on { border-color: var(--gold); background: rgba(245, 181, 68, 0.1); transform: translateY(-2px); }
.gameover {
  padding: 14px; border-radius: 20px; display: flex; flex-direction: column; gap: 10px;
  background: radial-gradient(circle at 0% 0%, rgba(245, 181, 68, 0.22), transparent 60%), rgba(22, 31, 69, 0.92);
  border: 1px solid rgba(245, 181, 68, 0.4);
}
.go-head { display: flex; align-items: center; gap: 14px; }
.go-name { font-size: 17px; }
.go-actions { gap: 8px; }
.player { display: flex; flex-direction: column; gap: 10px; }
.mine { display: flex; gap: 12px; align-items: center; }
.hole { position: relative; display: flex; gap: 6px; padding: 0; }
.hole.locked { cursor: default; }
.hole .edit { position: absolute; right: -6px; bottom: -6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #2a1700; box-shadow: 0 3px 8px rgba(0,0,0,.5); }
.folded-msg { color: var(--text-3); font-weight: 600; }
.padwrap { padding: 10px 0 0; border-top: 1px solid var(--line); }
.waiting { text-align: center; color: var(--text-2); font-weight: 600; padding: 10px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; }
.waiting:empty { display: none; }
.loading-page { height: 100dvh; display: grid; place-items: center; }

.slide-enter-active { transition: transform 0.5s var(--ease), opacity 0.35s; }
.slide-leave-active { transition: transform 0.25s ease, opacity 0.2s; }
.slide-enter-from, .slide-leave-to { transform: translateY(40px); opacity: 0; }

/* ---------- móvil: todo cabe en pantalla sin deslizar ---------- */
@media (max-width: 1099px) {
  .tp { overflow-y: auto; overscroll-behavior: contain; }
}
@media (max-width: 700px) {
  .bar { padding-bottom: 4px; gap: 8px; }
  .bar .icon-btn { width: 38px; height: 38px; }
  .tname { font-size: 16px; }
  .codebtn { padding: 0 9px; letter-spacing: 0.06em; height: 36px; }
  .felt-zone { padding: 78px 22px 14px; min-height: 240px; }
  .felt { border-radius: 50% / 46%; max-height: none; }
  .center { padding: 18% 6% 0; gap: 7px; }
  .board { gap: 4px; }
  .board :deep(.pcard.md) { --w: 44px; }
  .dock { padding: 6px 12px calc(8px + var(--safe-b)); gap: 8px; max-height: none; overflow: visible; }
  .turn .felt-zone { padding-top: 72px; min-height: 200px; }
  .turn .center { padding-top: 22%; }
  .turn .pot { font-size: 13px; padding: 3px 10px 3px 4px; }
  .turn .status { font-size: 12px; padding: 3px 10px; }
  .padwrap { padding-top: 6px; }
}
/* mesa grande: el aviso va encima del bote, lejos de tu asiento */
@media (min-width: 701px) {
  .status { order: -1; }
}
@media (min-width: 701px) and (max-width: 1099px) {
  .felt-zone { min-height: 420px; }
}
@media (min-width: 1100px) {
  .tp { display: grid; grid-template-columns: 1fr 440px; grid-template-rows: auto 1fr; }
  .bar { grid-column: 1 / -1; }
  .dock { max-height: none; background: rgba(11, 16, 38, 0.6); border-left: 1px solid var(--line); justify-content: center; }
}
</style>
