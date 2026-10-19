<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getSocket, emit, connected } from '@/lib/socket.js';
import { toast } from '@/lib/store.js';
import { formatChips, STAGE_LABEL, modeInfo } from '@/lib/format.js';
import { describeCurrent, SUIT_SYMBOL } from '@shared/poker.js';
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
import ChatPanel from '@/components/ChatPanel.vue';
import ReactButtons from '@/components/ReactButtons.vue';
import ViudaPanel from '@/components/ViudaPanel.vue';
import { useTween } from '@/lib/tween.js';
import { play, soundOn, vibrate } from '@/lib/sfx.js';
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
const mqWide = window.matchMedia('(min-width: 1100px)');
const isWide = ref(mqWide.matches);
const onWide = (e) => (isWide.value = e.matches);
const isMobile = ref(mq.matches);
const onMq = (e) => (isMobile.value = e.matches);

const hand = computed(() => s.value?.hand);
const live = computed(() => !!hand.value && hand.value.stage !== 'done');
// el modo de la mano en curso manda; entre manos, el de la mesa
const mode = computed(() => (live.value ? hand.value.mode : s.value?.settings.mode) || 'live');
// la viuda no tiene fichas ni dealer; aleatorio y viuda: la app reparte, turnos con tiempo y manos que salen solas
const viuda = computed(() => mode.value === 'viuda');
const noChips = viuda;
const random = computed(() => mode.value === 'random');
const auto = computed(() => random.value || viuda.value);
const manager = computed(() => !!s.value?.canManage);
const showDealerBar = computed(() => manager.value && !auto.value);
// en vivo los jugadores (todos menos el dealer) no ven la mesa: solo sus fichas, el bote y los botones para apostar
// en vivo el dealer no juega: no tiene asiento en la mesa ni fichas, solo reparte
const liveDealer = computed(() => mode.value === 'live' && !!s.value && s.value.dealerId === s.value.me);
const playing = (x) => !(mode.value === 'live' && x.userId === s.value?.dealerId);
const playerOnly = computed(() => mode.value === 'live' && !manager.value && !!s.value?.seats.some((x) => x.userId === s.value.me));
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
    play('card');
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
  const seats = s.value.seats.filter(playing);
  const myIdx = seats.findIndex((x) => x.userId === s.value.me);
  const ordered = myIdx >= 0 ? [...seats.slice(myIdx), ...seats.slice(0, myIdx)] : seats;
  const pos = (seat, a, rx = 47, ry = 45) => {
    const cos = Math.cos(a), sin = Math.sin(a);
    return { seat, x: 50 + cos * rx, y: 50 + sin * ry, dir: { x: -cos, y: -sin } };
  };
  if (isMobile.value && (myIdx >= 0 || liveDealer.value)) {
    // en móvil tu info (o la del dealer) va en el panel de abajo: los jugadores se reparten por arriba
    const others = myIdx >= 0 ? ordered.slice(1) : ordered;
    const n = others.length;
    // con muchos jugadores el arco baja por los lados para que no se monten unos sobre otros
    if (n >= 4) {
      const from = Math.PI * 0.78, to = Math.PI * 2.22;
      return others.map((seat, i) => pos(seat, from + (i * (to - from)) / (n - 1), 42, 46));
    }
    return others.map((seat, i) => pos(seat, Math.PI + ((i + 1) * Math.PI) / (n + 1), 44, 50));
  }
  const n = ordered.length;
  return ordered.map((seat, i) => pos(seat, Math.PI / 2 + (i * 2 * Math.PI) / n, 47, 40));
});

// jugada de cada uno: la del showdown y la de quien enseña sus cartas al final
const handNames = computed(() => {
  const h = view.value;
  const names = { ...(h?.handNames || {}) };
  for (const p of h?.players || []) {
    if (p.shown && p.cards?.length === 2 && !names[p.userId]) names[p.userId] = describeCurrent(p.cards, h.board)?.name || '';
  }
  return names;
});

// ---------- enseñar cartas al terminar la mano ----------
const myCardsSeen = computed(() => {
  const r = hand.value?.result;
  return !!me.value && (me.value.shown || (r?.how === 'showdown' && !me.value.folded));
});
const canShow = computed(() => hand.value?.stage === 'done' && !revealing.value && myCards.value.length === 2 && !myCardsSeen.value);
const cardText = (c) => (c[0] === 'T' ? '10' : c[0]) + SUIT_SYMBOL[c[1]];
async function showMine() {
  if (await run('table:show')) toast.success('Has enseñado tus cartas a la mesa');
}
// aviso cuando otro jugador enseña las suyas
watch(
  () => (hand.value?.players || []).filter((p) => p.shown).map((p) => p.userId).join(),
  (now, before) => {
    const prev = new Set((before || '').split(',').filter(Boolean));
    for (const p of hand.value?.players || []) {
      if (p.shown && !prev.has(p.userId) && p.userId !== s.value?.me && p.cards?.length === 2) {
        toast(`${nameOf(p.userId)} enseña: ${p.cards.map(cardText).join(' ')}`, 'info', 5000);
      }
    }
  },
);

// ---------- cartas boca arriba (all-in / showdown) ----------
const stripFinal = computed(() => !revealing.value && view.value?.stage === 'done');
const stripAllIn = computed(() => !!hand.value?.players.some((p) => p.allIn && !p.folded));
const revealed = computed(() => {
  const h = view.value;
  if (!h || !s.value) return [];
  const list = h.players.filter((p) => !p.folded && p.cards?.length === 2);
  if (list.length < 2 || !list.some((p) => p.userId !== s.value.me)) return [];
  const r = hand.value?.result;
  const isWinner = (id) => !!r && (r.payout?.[id] || 0) > 0;
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
  if (h.mode === 'viuda') {
    return r.winners.map((id) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`).join(' · ');
  }
  return Object.entries(r.payout)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${nameOf(id)} ${id === s.value.me ? 'ganas' : 'gana'} ${formatChips(v)}${handNames.value[id] ? ' con ' + handNames.value[id] : ''}`)
    .join(' · ');
});

// ---------- partida terminada / recompras ----------
const activeSeats = computed(() => (s.value?.seats || []).filter((x) => x.status === 'active' && playing(x)));
const withChips = computed(() => activeSeats.value.filter((x) => x.chips > 0));
const gameOver = computed(() => !!s.value && !noChips.value && !live.value && !revealing.value && activeSeats.value.length >= 2 && withChips.value.length < 2);
const champion = computed(() => (gameOver.value && withChips.value.length === 1 ? withChips.value[0] : null));
const canStart = computed(() => {
  if (live.value) return false;
  if (!manager.value && !(auto.value && mySeat.value)) return false;
  return (noChips.value ? activeSeats.value.length : withChips.value.length) >= 2;
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
// escaneo con cámara: opcional por mesa (y solo si el servidor tiene la clave)
const scanOn = computed(() => !!s.value?.settings.scan && scanEnabled.value);
// en vivo sin escaneo los jugadores no ponen cartas: solo apuestan y el dealer dice quién gana
const showMyCards = computed(() => mode.value !== 'live' || scanOn.value);
// en vivo, jugador: registrar tus cartas es opcional (para ver tu probabilidad); se puede ocultar en la mano y taparlas
const cardsDismissedHand = ref(null);
const cardsDismissed = computed(() => !!hand.value && cardsDismissedHand.value === hand.value.no);
const cardsCovered = ref(false);
async function askCardsChange() {
  if (await run('table:cardsChange')) toast('Le pedimos al dealer que te deje cambiar tus cartas', 'info');
}
// en vivo: jugadores que piden al dealer corregir las cartas que registraron
const cardRequests = computed(() =>
  showDealerBar.value && hand.value ? hand.value.players.filter((p) => p.cardsChange === 'pending').map((p) => ({ ...p, seat: seatsById.value[p.userId] || { displayName: '—' } })) : [],
);
// escaneo de tus cartas (una vez por mano)
async function saveMyCards(cards) {
  if (cards.length === 2) {
    if (await run('table:cards', { cards })) toast.success('Cartas guardadas');
  } else picker.value = { open: true, mode: 'hole', initial: cards };
}
const canRebuy = computed(() => !!mySeat.value && !liveDealer.value && !noChips.value && (!me.value || me.value.folded || !live.value));
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

// ---------- reacciones con emoji ----------
const EMOJIS = ['😂', '🔥', '😎', '😭', '😡', '👏', '🤑', '🙈', '💀', '🤡', '🥶', '🫡', '😱', '🙏', '🍀', '👀'];
const reactions = ref({}); // userId -> { emoji, id }
const showReactions = ref(false);
const reactTimers = {};
function onReaction(p) {
  if (p.code !== code.value) return;
  reactions.value = { ...reactions.value, [p.userId]: { emoji: p.emoji, id: p.id } };
  clearTimeout(reactTimers[p.userId]);
  reactTimers[p.userId] = setTimeout(() => {
    const { [p.userId]: _, ...rest } = reactions.value;
    reactions.value = rest;
  }, 2600);
}
function react(emoji) {
  getSocket().emit('table:react', { code: code.value, emoji });
  showReactions.value = false;
  vibrate(10);
}

// ---------- chat ----------
const chat = ref({ messages: [], reactions: undefined, cooldownUntil: 0, open: false, unread: 0, busy: false });
const chatVisible = computed(() => isWide.value || chat.value.open);
async function loadChat() {
  try {
    const r = await emit('chat:history', { code: code.value });
    chat.value.messages = r.messages;
    chat.value.reactions = r.reactions;
  } catch { /* sin chat */ }
}
function onChatMessage(p) {
  if (p.code !== code.value) return;
  chat.value.messages = [...chat.value.messages, p.message].slice(-150);
  if (!chatVisible.value && p.message.userId !== s.value?.me) chat.value.unread++;
}
function onChatUpdate(p) {
  if (p.code !== code.value) return;
  chat.value.messages = chat.value.messages.map((m) => (m.id === p.id ? { ...m, reactions: p.reactions } : m));
}
function sendChat({ text, replyTo }) {
  chat.value.busy = true;
  getSocket().timeout(8000).emit('chat:send', { code: code.value, text, replyTo }, (err, r) => {
    chat.value.busy = false;
    if (err) return toast.error('No se pudo enviar el mensaje');
    if (r?.ok) chat.value.cooldownUntil = Date.now() + 5000;
    else {
      if (r?.wait) chat.value.cooldownUntil = Date.now() + r.wait;
      toast.error(r?.error || 'No se pudo enviar');
    }
  });
}
const reactChat = ({ id, emoji }) => getSocket().emit('chat:react', { code: code.value, id, emoji });
function openChat() {
  chat.value.open = true;
  chat.value.unread = 0;
}
watch(isWide, (w) => w && (chat.value.unread = 0));

// ---------- socket ----------
let sock;
async function subscribe() {
  try {
    await emit('table:subscribe', { code: code.value });
    loadChat();
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
  clockOffset = st.serverNow - Date.now();
  s.value = st;
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
  sock.on('table:reaction', onReaction);
  sock.on('chat:message', onChatMessage);
  sock.on('chat:update', onChatUpdate);
  sock.on('connect', subscribe);
  if (sock.connected) subscribe();
  tick = setInterval(() => (now.value = Date.now()), 250);
  checkScan();
  mq.addEventListener('change', onMq);
  mqWide.addEventListener('change', onWide);
});
onUnmounted(() => {
  sock.off('table:state', onState);
  sock.off('table:kicked', onKicked);
  sock.off('table:reaction', onReaction);
  sock.off('chat:message', onChatMessage);
  sock.off('chat:update', onChatUpdate);
  sock.off('connect', subscribe);
  sock.emit('table:unsubscribe', { code: code.value });
  clearInterval(tick);
  clearTimeout(revealTimer);
  mq.removeEventListener('change', onMq);
  mqWide.removeEventListener('change', onWide);
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
    if (aw && manager.value && !auto.value) setTimeout(() => openPicker('board'), 450);
    if (!aw && picker.value.mode === 'board') picker.value.open = false;
  },
);
watch(
  () => hand.value?.stage,
  (st) => {
    if (st === 'showdown' && manager.value && !auto.value) showShowdown.value = true;
    if (st !== 'showdown') showShowdown.value = false;
    if (st === 'preflop' && me.value && !myCards.value.length && !auto.value && showMyCards.value) {
      toast(scanOn.value ? 'Nueva mano: escanea tus cartas para ver tu probabilidad' : 'Nueva mano: registra tus cartas para ver tu probabilidad', 'info', 3000);
    }
  },
);

const boardSlots = computed(() => Array.from({ length: 5 }, (_, i) => (viuda.value ? view.value?.widow?.[i] : view.value?.board[i]) || ''));
const toActName = computed(() => (hand.value?.toAct ? nameOf(hand.value.toAct) : ''));
const turnLeft = computed(() => secondsTo(hand.value?.turnDeadline));
// duración del turno: lo que quedaba al empezar (para la barra que se vacía)
const turnTotal = ref(0);
watch(() => hand.value?.turnDeadline, (d) => (turnTotal.value = d ? Math.max(1, secondsTo(d)) : 0));
const turnPct = computed(() => (turnTotal.value ? Math.min(100, (turnLeft.value / turnTotal.value) * 100) : 0));
const nextHandIn = computed(() => secondsTo(s.value?.nextHandAt));
const seeLeft = computed(() => secondsTo(hand.value?.seeDeadline));
const viudaTurn = computed(() => viuda.value && hand.value?.stage === 'cambios' && hand.value.toAct === s.value?.me);
const statusLine = computed(() => {
  const h = view.value;
  if (!s.value) return '';
  if (paused.value) return paused.value.userId === s.value.me ? 'En pausa · tu recompra' : `En pausa · recompra de ${nameOf(paused.value.userId)}`;
  if (revealing.value) return 'Repartiendo cartas…';
  if (gameOver.value) return !champion.value ? 'Partida terminada' : champion.value.userId === s.value.me ? '¡Ganaste la partida!' : `${nameOf(champion.value.userId)} ganó la partida`;
  if (!h || h.stage === 'done') {
    if (nextHandIn.value) return `Siguiente mano en ${nextHandIn.value}s`;
    if (auto.value) return 'Esperando jugadores';
    return manager.value ? 'Listo para repartir' : 'Esperando al dealer';
  }
  if (h.awaiting) return `El dealer pone el ${STAGE_LABEL[h.awaiting]}`;
  if (h.stage === 'showdown') return 'Showdown: el dealer reparte el bote';
  const t = auto.value && turnLeft.value ? ` · ${turnLeft.value}s` : '';
  if (h.stage === 'viuda') return `La viuda: mirad vuestras cartas${seeLeft.value ? ` · ${seeLeft.value}s` : ''}`;
  if (h.knockBy && h.toAct) return `Última vuelta · turno de ${h.toAct === s.value.me ? 'ti' : toActName.value}${t}`;
  if (h.toAct === s.value.me) return `¡Es tu turno!${t}`;
  if (h.toAct) return `Turno de ${toActName.value}${t}`;
  return STAGE_LABEL[h.stage];
});
const info = computed(() => modeInfo(mode.value));
// en vivo, al terminar la mano el dealer ve a quién pagar y la siguiente sale con cuenta atrás
const payouts = computed(() => {
  const r = hand.value?.stage === 'done' ? hand.value.result : null;
  if (!r || mode.value !== 'live') return [];
  return Object.entries(r.payout || {})
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amount: v, seat: seatsById.value[id] || { displayName: '—' } }));
});
// cada vez que cambia lo que toca hacer, la barra del dealer entra de nuevo con animación
const dealerKey = computed(() => (live.value ? `${hand.value.no}-${hand.value.awaiting || hand.value.stage}` : `idle-${!!nextHandIn.value}`));
// ---------- sonidos: repartir, tu turno, ganar y tocar (viuda) ----------
watch(() => hand.value?.no, (no, before) => before && no && no !== before && play('deal'));
watch(() => myTurn.value || viudaTurn.value, (now) => now && play('turn'));
const iWon = computed(() => {
  const h = view.value;
  if (!h || h.stage !== 'done' || revealing.value || !h.result) return false;
  return (h.result.payout?.[s.value.me] || 0) > 0 || (h.mode === 'viuda' && h.result.winners.includes(s.value.me));
});
watch(iWon, (won) => won && play('win'));
watch(() => hand.value?.knockBy, (by, before) => by && !before && play('knock'));
watch(() => hand.value?.widowOpen, (open, before) => open && before === false && play('deal'));

const showResult = computed(() => playerOnly.value && payouts.value.length > 0 && !live.value && !revealing.value);
const myWon = computed(() => payouts.value.find((w) => w.id === s.value?.me)?.amount || 0);
function startNext() {
  // la primera mano sale al momento; las siguientes, tras 5 s para pagar el bote
  if (mode.value === 'live' && hand.value) run('dealer:startIn');
  else run('dealer:start');
}
const myView = computed(() => view.value?.players.find((p) => p.userId === s.value?.me) || null);
const myBadge = computed(() => {
  const h = view.value;
  if (!h || !myView.value) return '';
  if (h.buttonId === s.value.me) return 'D';
  if (h.stage === 'preflop' && h.sbId === s.value.me) return 'SB';
  if (h.stage === 'preflop' && h.bbId === s.value.me) return 'BB';
  return '';
});
// fichas y bote que suben / bajan animados; al ganar, "+X" flotando sobre tus fichas
const stackShown = useTween(computed(() => (myView.value ? myView.value.stack : mySeat.value?.chips || 0)));
const potShown = useTween(totalPot);
const tileValue = computed(() => {
  if (myTurn.value && s.value.legal.toCall > 0) return formatChips(s.value.legal.toCall);
  return live.value ? STAGE_LABEL[hand.value.stage] : '—';
});
const gain = ref(null);
let gainTimer;
watch(
  () => (view.value?.stage === 'done' ? view.value.players.find((p) => p.userId === s.value?.me)?.won || 0 : 0),
  (won) => {
    if (!won || !playerOnly.value) return;
    gain.value = { amount: won, id: Date.now() };
    clearTimeout(gainTimer);
    gainTimer = setTimeout(() => (gain.value = null), 2600);
  },
);
</script>

<template>
  <div class="tp" :class="{ turn: (myTurn && !noChips) || viudaTurn, mobile: isMobile, solo: playerOnly, crowd: layout.length >= 5 }" v-if="s">
    <!-- barra superior -->
    <header class="bar">
      <button class="icon-btn" aria-label="Volver" @click="router.push(s.groupId ? `/grupos/${s.groupId}` : '/')"><Icon name="left" /></button>
      <div class="title grow">
        <div class="ellipsis tname">{{ s.name }}</div>
        <div class="sub small">
          <span class="dotc" :class="{ on: connected }"></span>
          <span class="mbadge"><Icon :name="info.icon" :size="13" />{{ info.short }}</span>
          <span v-if="hand" class="hno">· #{{ hand.no }}</span>
          <template v-if="!noChips">· {{ formatChips(Math.max(1, Math.floor(s.settings.minBet / 2))) }}/{{ formatChips(s.settings.minBet) }}</template>
        </div>
      </div>
      <button class="icon-btn" :aria-label="soundOn ? 'Silenciar sonidos' : 'Activar sonidos'" :title="soundOn ? 'Silenciar' : 'Activar sonido'" @click="soundOn = !soundOn">
        <Icon :name="soundOn ? 'volume' : 'mute'" />
      </button>
      <button class="codebtn" @click="showShare = true"><Icon name="qr" :size="16" />{{ s.code }}</button>
      <button class="icon-btn" aria-label="Menú" @click="openMenu()"><Icon name="menu" /></button>
    </header>

    <!-- en vivo, jugador: sin mesa ni rivales, solo lo necesario para apostar -->
    <section v-if="playerOnly" class="hud">
      <div class="hud-stack" :class="{ gain: !!gain }">
        <div class="hud-lbl">Tus fichas</div>
        <div class="hud-big num">{{ formatChips(stackShown) }}</div>
        <Transition name="gain"><div v-if="gain" :key="gain.id" class="gain-pop num">+{{ formatChips(gain.amount) }}</div></Transition>
        <div class="hud-tags">
          <Transition name="pop"><span v-if="myBadge" class="mb-badge">{{ myBadge }}</span></Transition>
          <Transition name="pop">
            <span v-if="myView?.bet > 0" :key="myView.bet" class="mb-bet num"><Chip :value="myView.bet" :index="0" :size="18" />Apostado {{ formatChips(myView.bet) }}</span>
          </Transition>
        </div>
      </div>
      <div class="hud-row">
        <div class="hud-tile">
          <div class="hud-lbl">Bote</div>
          <b class="num">{{ formatChips(potShown) }}</b>
        </div>
        <div class="hud-tile">
          <div class="hud-lbl">{{ myTurn && s.legal.toCall > 0 ? 'Para igualar' : 'Ronda' }}</div>
          <Transition name="pop" mode="out-in">
            <b :key="tileValue" class="num" :class="{ gold: myTurn && s.legal.toCall > 0 }">{{ tileValue }}</b>
          </Transition>
        </div>
      </div>
      <!-- cuando no es tu turno: las cartas comunes que va poniendo el dealer -->
      <Transition name="fade">
        <div v-if="hand && !myTurn && (live || view.board.length)" class="hud-board">
          <PlayingCard v-for="(c, i) in boardSlots" :key="i" :card="c" :placeholder="!c" size="md" class="bslot"><span></span></PlayingCard>
        </div>
      </Transition>
      <!-- mano terminada: quién gana y cuánto, en grande -->
      <Transition name="fade">
        <div v-if="showResult" class="hud-result" :class="{ won: myWon > 0 }">
          <div class="hr-title pop-in">
            <Icon name="trophy" :size="18" />{{ myWon > 0 ? `¡Ganaste ${formatChips(myWon)}!` : 'Resultado de la mano' }}
          </div>
          <div v-for="(w, i) in payouts" :key="w.id" class="hr-row rise" :style="{ animationDelay: 0.15 + i * 0.12 + 's' }">
            <Avatar :user="w.seat" :size="32" />
            <div class="grow">
              <div class="hr-name ellipsis">{{ w.id === s.me ? 'Tú' : w.seat.displayName }}</div>
              <div v-if="handNames[w.id]" class="small muted">{{ handNames[w.id] }}</div>
            </div>
            <b class="num">+{{ formatChips(w.amount) }}</b>
          </div>
        </div>
      </Transition>
      <div class="hud-line">
        <Transition name="fade" mode="out-in">
          <div :key="statusLine.replace(/\d+s$/, '') + winnerText" class="status hud-status" :class="{ mine: myTurn && !paused, win: winnerText && !showResult && !paused, pause: paused }">
            {{ paused || showResult ? statusLine : winnerText || statusLine }}
          </div>
        </Transition>
        <ReactButtons :emojis="EMOJIS" :unread="chat.unread" :chat="!isWide" @chat="openChat" @react="react" />
      </div>
    </section>

    <!-- mesa -->
    <section v-else class="felt-zone">
      <div class="felt">
        <div class="rail"></div>
        <div class="center">
          <Transition name="pop">
            <div v-if="totalPot > 0 && !noChips" class="pot num" key="pot">
              <span class="pot-chip"></span>Bote {{ formatChips(totalPot) }}
            </div>
            <div v-else-if="viuda && hand && hand.stage !== 'done'" class="pot" key="viuda">
              <Icon name="cards" :size="16" />{{ hand.widowOpen ? 'La viuda · boca arriba' : 'La viuda' }}
            </div>
          </Transition>
          <div class="board">
            <PlayingCard v-for="(c, i) in boardSlots" :key="i" :card="c" :delay="viuda ? i * 0.12 : 0" :placeholder="!c && !(viuda && hand && hand.stage !== 'done')" :size="isMobile && (myTurn || layout.length >= 5) ? 'sm' : 'md'" class="bslot"><span></span></PlayingCard>
          </div>
          <!-- en móvil, con el resultado encima de la mesa, no se repite quién gana -->
          <Transition name="fade" mode="out-in">
            <div v-if="!(revealed.length && winnerText && !paused)" :key="statusLine.replace(/\d+s$/, '') + winnerText" class="status" :class="{ mine: myTurn && !paused, win: (winnerText || gameOver) && !paused, pause: paused }">
              {{ paused ? statusLine : winnerText || statusLine }}
            </div>
          </Transition>
          <!-- all-in / showdown: las cartas de todos, encima de la mesa -->
        </div>

        <div v-for="l in layout" :key="l.seat.userId" class="seat-pos" :style="{ left: l.x + '%', top: l.y + '%' }">
          <Seat
            :seat="l.seat"
            :player="view?.players.find((p) => p.userId === l.seat.userId)"
            :hand="view"
            :mode="mode"
            :is-me="l.seat.userId === s.me"
            :is-dealer="!auto && l.seat.userId === s.dealerId"
            :hand-name="revealed.length || viuda ? '' : handNames[l.seat.userId]"
            :quiet="revealed.length > 0 || (viuda && hand?.stage === 'done')"
            :bet-dir="l.dir"
            :seconds-left="auto && hand?.toAct === l.seat.userId ? turnLeft : 0"
            :bet-reach="isMobile ? 0.68 : layout.length >= 5 ? 0.58 : 1"
            :reaction="reactions[l.seat.userId]"
          />
        </div>
      </div>

      <!-- reacciones y chat (en móvil van en la barra de tu asiento) -->
      <div v-if="!(isMobile && mySeat)" class="react-fab">
        <button v-if="!isWide" class="icon-btn react-btn chat-btn" aria-label="Abrir chat" @click="openChat">
          <Icon name="mail" :size="20" />
          <Transition name="pop"><i v-if="chat.unread" class="chat-badge">{{ chat.unread > 9 ? '9+' : chat.unread }}</i></Transition>
        </button>
        <Transition name="pop">
          <div v-if="showReactions" class="react-pop">
            <button v-for="e in EMOJIS" :key="e" class="react-opt" @click="react(e)">{{ e }}</button>
          </div>
        </Transition>
        <button class="icon-btn react-btn" :class="{ on: showReactions }" aria-label="Enviar reacción" @click="showReactions = !showReactions">
          <Icon :name="showReactions ? 'x' : 'smile'" :size="20" />
        </button>
      </div>
    </section>

    <!-- dock inferior -->
    <section class="dock">
      <!-- las cartas de todos (all-in / showdown) van aquí y no tapan la mesa ni los asientos -->
      <Transition name="slide">
        <ShowdownStrip v-if="revealed.length" compact :players="revealed" :board="view.board" :final="stripFinal" :all-in="stripAllIn" />
      </Transition>
      <!-- en móvil, tu asiento vive aquí -->
      <div v-if="isMobile && mySeat && !playerOnly" class="mebar">
        <span class="mb-ava">
          <Avatar :user="mySeat" :size="28" />
          <Transition name="react"><span v-if="reactions[s.me]" :key="reactions[s.me].id" class="mb-react">{{ reactions[s.me].emoji }}</span></Transition>
        </span>
        <b class="num">{{ noChips || liveDealer ? 'Tú' : formatChips(myView ? myView.stack : mySeat.chips) }}</b>
        <span v-if="myBadge" class="mb-badge">{{ myBadge }}</span>
        <span v-if="myView?.bet > 0" class="mb-bet num"><Chip :value="myView.bet" :index="0" :size="18" />{{ formatChips(myView.bet) }}</span>
        <span v-if="!auto && s.dealerId === s.me" class="mb-dealer"><Icon name="dealer" :size="13" />Dealer</span>
        <span class="grow"></span>
        <span v-if="(myTurn || viudaTurn) && auto && turnLeft" class="mb-timer num" :class="{ low: turnLeft <= 10 }"><Icon name="timer" :size="15" />{{ turnLeft }}s</span>
        <ReactButtons :emojis="EMOJIS" :unread="chat.unread" up @chat="openChat" @react="react" />
      </div>

      <!-- enseñar tus cartas al terminar la mano -->
      <Transition name="slide">
        <button v-if="canShow" class="btn btn-block show-btn" :disabled="busy" @click="showMine">
          <Icon name="eye" :size="18" />Mostrar mis cartas
          <span class="mini-cards"><PlayingCard :card="myCards[0]" size="xs" /><PlayingCard :card="myCards[1]" size="xs" /></span>
        </button>
      </Transition>

      <!-- partida terminada -->
      <Transition name="slide">
        <div v-if="gameOver" class="gameover">
          <div class="go-head">
            <Avatar v-if="champion" :user="champion" :size="48" ring />
            <div class="grow">
              <div class="eyebrow">Partida terminada</div>
              <b class="go-name">{{ !champion ? 'Nadie más tiene fichas' : champion.userId === s.me ? 'Te quedas con todo' : `${nameOf(champion.userId)} se queda con todo` }}</b>
            </div>
          </div>
          <div class="row go-actions">
            <button v-if="manager" class="btn btn-primary grow" :disabled="busy" @click="newGame"><Icon name="rotate" :size="18" />Nueva partida</button>
            <button v-if="canRebuy && mySeat.chips <= 0" class="btn grow" :class="{ 'btn-primary': !manager }" :disabled="busy || !!mySeat.rebuyRequest" @click="rebuy">
              <Icon name="coins" :size="18" />{{ mySeat.rebuyRequest ? 'Recompra pedida' : rebuyLabel }}
            </button>
            <button v-if="manager && !auto" class="btn" @click="openMenu('players')"><Icon name="users" :size="18" /></button>
          </div>
          <p class="hint">"Nueva partida" devuelve a todos {{ formatChips(s.settings.startingChips) }} fichas. Con recompra entra quien quiera seguir.</p>
        </div>
      </Transition>

      <!-- peticiones para corregir cartas registradas (dealer) -->
      <TransitionGroup name="list" tag="div" class="requests" v-if="cardRequests.length">
        <div v-for="r in cardRequests" :key="r.userId" class="req vote">
          <Avatar :user="r.seat" :size="30" />
          <span class="grow small"><b>{{ r.seat.displayName }}</b> se equivocó con sus cartas y pide cambiarlas</span>
          <button class="icon-btn ok" :disabled="busy" aria-label="Dejar cambiar" @click="run('dealer:cardsChange', { userId: r.userId, approve: true })"><Icon name="check" :size="18" /></button>
          <button class="icon-btn" :disabled="busy" aria-label="No dejar" @click="run('dealer:cardsChange', { userId: r.userId, approve: false })"><Icon name="x" :size="18" /></button>
        </div>
      </TransitionGroup>

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

      <!-- en vivo: a quién paga el dealer el bote de la mano que acaba de terminar -->
      <div v-if="showDealerBar && payouts.length && !live && !revealing" class="payouts">
        <div class="dl-tag"><Icon name="coins" :size="15" />Paga el bote</div>
        <div v-for="w in payouts" :key="w.id" class="pay">
          <Avatar :user="w.seat" :size="26" />
          <span class="grow ellipsis">{{ w.id === s.me ? 'Tú' : w.seat.displayName }}</span>
          <b class="num">{{ formatChips(w.amount) }}</b>
        </div>
      </div>

      <!-- controles del dealer (en vivo / sin dinero) -->
      <div v-if="showDealerBar && !gameOver && !myTurn" :key="dealerKey" class="dealer rise">
        <div class="dl-tag"><Icon name="dealer" :size="15" />Dealer</div>
        <template v-if="!live && nextHandIn">
          <div class="countdown num">{{ nextHandIn }}</div>
          <span class="grow">La mano {{ (s.handNo || 0) + 1 }} empieza en {{ nextHandIn }}s</span>
          <button class="btn btn-sm" :disabled="busy" @click="run('dealer:cancelStart')">Cancelar</button>
        </template>
        <template v-else-if="!live">
          <button class="btn btn-primary btn-lg grow" :disabled="!canStart || busy || !!paused" @click="startNext">
            <Icon name="play" :size="18" />{{ mode === 'live' && hand ? 'Empezar' : 'Repartir' }} mano {{ (s.handNo || 0) + 1 }}
          </button>
          <button class="icon-btn big" title="Ajustes de la mesa" @click="openMenu('settings')"><Icon name="settings" /></button>
        </template>
        <template v-else-if="hand.awaiting">
          <button class="btn btn-primary btn-lg grow glow" @click="openPicker('board')">
            <Icon name="cards" :size="18" />Poner el {{ STAGE_LABEL[hand.awaiting] }}
          </button>
        </template>
        <template v-else-if="hand.stage === 'showdown'">
          <button class="btn btn-success btn-lg grow glow" @click="showShowdown = true">
            <Icon name="trophy" :size="18" />Repartir el bote
          </button>
        </template>
        <template v-else>
          <div class="grow small muted">Turno de <b class="txt">{{ toActName }}</b></div>
          <button v-if="hand.toAct && hand.toAct !== s.me" class="btn btn-sm" :disabled="busy" @click="run('dealer:forceFold', { userId: hand.toAct })">Forzar</button>
          <button v-if="hand.stage !== 'preflop'" class="btn btn-sm btn-ghost" :disabled="busy" title="Corregir cartas" @click="run('dealer:undoBoard')"><Icon name="undo" :size="16" /></button>
        </template>
      </div>
      <p v-if="showDealerBar && !canStart && !live && !gameOver" class="hint center">
        Se necesitan al menos 2 jugadores activos con fichas.
      </p>

      <!-- modo aleatorio: sin dealer, las manos salen solas -->
      <div v-if="auto && !live && !gameOver && !revealing" class="autobar">
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
      <!-- la viuda: tus cartas, la viuda y los cambios -->
      <ViudaPanel
        v-if="viuda && me && hand"
        class="rise"
        :hand="view"
        :me="me"
        :seats-by-id="seatsById"
        :my-turn="viudaTurn"
        :turn-left="turnLeft"
        :turn-pct="turnPct"
        :see-left="seeLeft"
        :busy="busy"
        @see="run('viuda:see')"
        @take="run('viuda:take')"
        @act="(p) => run('viuda:act', p)"
      />
      <div v-if="me && live && !viuda && (playerOnly || !revealed.length)" class="player">
        <template v-if="playerOnly">
          <div v-if="!myTurn && (me.folded || myCards.length < 2)" class="physical">
            <template v-if="me.folded">Te has retirado de esta mano</template>
            <template v-else><Icon name="hand" :size="16" />Juega con tus cartas físicas · aquí solo apuestas</template>
          </div>
        </template>
        <template v-else-if="!showMyCards">
          <div class="physical">
            <template v-if="me.folded">Te has retirado de esta mano</template>
            <template v-else><Icon name="hand" :size="16" />Juega con tus cartas físicas · aquí solo apuestas</template>
          </div>
        </template>
        <!-- tu turno: fila compacta para dejar sitio al panel de apuesta -->
        <div v-else-if="!playerOnly && myTurn" class="mine rise">
          <button class="hole" :class="{ locked: random }" :aria-label="random ? 'Tus cartas' : 'Elegir mis cartas'" @click="random ? (cardsCovered = !cardsCovered) : openPicker('hole')">
            <PlayingCard :card="cardsCovered ? '' : myCards[0] || ''" :placeholder="!myCards[0]" :size="isMobile ? 'sm' : 'md'" :dim="me.folded">?</PlayingCard>
            <PlayingCard :card="cardsCovered ? '' : myCards[1] || ''" :placeholder="!myCards[1]" :size="isMobile ? 'sm' : 'md'" :dim="me.folded" :delay="0.12">?</PlayingCard>
          </button>
          <EquityPanel v-if="!me.folded && !cardsCovered" class="grow" :hole="myCards" :board="view.board" :opponents="opponents" compact :mini="isMobile" />
          <div v-else-if="cardsCovered" class="grow covered-msg">Cartas tapadas</div>
        </div>
        <!-- esperando: cartas arriba, probabilidad debajo y botones al final -->
        <div v-else-if="!playerOnly" class="solo-box with-table rise">
          <button class="sb-cards" :aria-label="random ? 'Tapar o destapar mis cartas' : 'Elegir mis cartas'" @click="random || myCards.length === 2 ? (cardsCovered = !cardsCovered) : openPicker('hole')">
            <PlayingCard :card="cardsCovered ? '' : myCards[0] || ''" :placeholder="!myCards[0]" :size="isMobile ? 'md' : 'lg'" :dim="me.folded">?</PlayingCard>
            <PlayingCard :card="cardsCovered ? '' : myCards[1] || ''" :placeholder="!myCards[1]" :size="isMobile ? 'md' : 'lg'" :dim="me.folded" :delay="0.28">?</PlayingCard>
          </button>
          <div v-if="me.folded" class="folded-msg sb-center">Te has retirado de esta mano</div>
          <div v-else-if="!random && myCards.length < 2 && scanOn" class="scanbox">
            <ScanButton big :expected="2" :exclude="hand.board" label="Escanear mis cartas" @cards="saveMyCards" />
            <button class="linkbtn small" @click="openPicker('hole')">o elegirlas a mano</button>
          </div>
          <div v-else-if="cardsCovered" class="covered-msg sb-covered"><Icon name="eyeOff" :size="16" />Cartas tapadas · nadie las ve en tu pantalla</div>
          <EquityPanel v-else-if="myCards.length === 2" class="sb-eq" :hole="myCards" :board="view.board" :opponents="opponents" :compact="isMobile" />
          <!-- tapar y cambiar, en las esquinas para no robarle sitio a la mesa -->
          <button v-if="!me.folded && myCards.length === 2" class="icon-btn sb-corner r" :aria-label="cardsCovered ? 'Destapar' : 'Tapar'" @click="cardsCovered = !cardsCovered">
            <Icon :name="cardsCovered ? 'eye' : 'eyeOff'" :size="18" />
          </button>
          <button v-if="!me.folded && !random" class="icon-btn sb-corner l" :aria-label="myCards.length === 2 ? 'Cambiar cartas' : 'Elegir mis cartas'" @click="openPicker('hole')">
            <Icon name="edit" :size="18" />
          </button>
        </div>
        <div v-if="myTurn && random && turnLeft" class="tbar rise" :class="{ low: turnLeft <= 10 }">
          <i :style="{ width: turnPct + '%' }"></i>
          <span><Icon name="timer" :size="15" />Tu turno · {{ turnLeft }}s</span>
        </div>
        <Transition name="betpad">
          <div v-if="myTurn && !noChips && paused" class="paused-note"><Icon name="pause" :size="16" />Tu turno espera: la partida está en pausa por una recompra</div>
          <div v-else-if="myTurn && !noChips" class="padwrap">
            <ChipBetPad :legal="s.legal" :chips="s.chips" :pot="totalPot" :busy="busy" :compact="isMobile && !playerOnly" :large="playerOnly" @action="doAction" />
          </div>
        </Transition>
        <!-- en vivo, jugador: tus cartas (opcional) y tu probabilidad -->
        <template v-if="playerOnly && !me.folded">
          <!-- tu turno: fila compacta (toca las cartas para taparlas) -->
          <div v-if="myCards.length === 2 && myTurn" class="solo-cards turn">
            <button class="hole" :aria-label="cardsCovered ? 'Destapar mis cartas' : 'Tapar mis cartas'" @click="cardsCovered = !cardsCovered">
              <PlayingCard :card="cardsCovered ? '' : myCards[0]" size="sm" />
              <PlayingCard :card="cardsCovered ? '' : myCards[1]" size="sm" :delay="0.12" />
            </button>
            <EquityPanel v-if="!cardsCovered" class="grow" :hole="myCards" :board="view.board" :opponents="opponents" compact mini />
            <div v-else class="grow covered-msg">Cartas tapadas</div>
          </div>
          <!-- esperando: cartas arriba, probabilidades debajo y los botones al final -->
          <div v-else-if="myCards.length === 2" class="solo-box rise">
            <button class="sb-cards" :aria-label="cardsCovered ? 'Destapar mis cartas' : 'Tapar mis cartas'" @click="cardsCovered = !cardsCovered">
              <PlayingCard :card="cardsCovered ? '' : myCards[0]" size="lg" />
              <PlayingCard :card="cardsCovered ? '' : myCards[1]" size="lg" :delay="0.18" />
            </button>
            <EquityPanel v-if="!cardsCovered" class="sb-eq" :hole="myCards" :board="view.board" :opponents="opponents" />
            <div v-else class="covered-msg sb-covered"><Icon name="eyeOff" :size="16" />Cartas tapadas · nadie las ve en tu pantalla</div>
            <div class="sb-btns">
              <button class="btn grow" @click="cardsCovered = !cardsCovered">
                <Icon :name="cardsCovered ? 'eye' : 'eyeOff'" :size="17" />{{ cardsCovered ? 'Destapar' : 'Tapar' }}
              </button>
              <button v-if="me.cardsChange === 'ok'" class="btn btn-primary grow" @click="openPicker('hole')"><Icon name="edit" :size="17" />Cambiar cartas</button>
              <button v-else class="btn grow" :disabled="busy || me.cardsChange === 'pending'" @click="askCardsChange"><Icon name="edit" :size="17" />Me equivoqué</button>
            </div>
            <div v-if="me.cardsChange === 'pending'" class="sb-note"><Icon name="timer" :size="15" />Esperando a que el dealer acepte el cambio</div>
            <div v-else-if="me.cardsChange === 'ok'" class="sb-note ok"><Icon name="check" :size="15" />El dealer te deja cambiarlas una vez</div>
          </div>
          <div v-else-if="!cardsDismissed" class="solo-pick rise">
            <button class="btn grow" @click="openPicker('hole')"><Icon name="cards" :size="18" />Elegir tus cartas</button>
            <button class="btn btn-ghost" @click="cardsDismissedHand = hand.no">Ocultar</button>
          </div>
        </template>
      </div>
      <div v-else-if="mySeat && !gameOver && !liveDealer && !(viuda && me && hand) && !(showDealerBar && !(mySeat.status === 'sitout' && !live))" class="waiting">
        <template v-if="mySeat.status === 'sitout'">
          <span>{{ mySeat.timeouts >= 2 ? 'Te sentamos fuera por inactividad' : 'Estás fuera de la mesa' }}</span>
          <button class="btn btn-sm btn-primary" @click="run('table:sitout', { sitout: false })">Volver a jugar</button>
        </template>
        <template v-else-if="mySeat.chips <= 0 && !noChips">
          <span>Te quedaste sin fichas</span>
          <button class="btn btn-sm btn-primary" :disabled="busy || !!mySeat.rebuyRequest" @click="rebuy">
            {{ mySeat.rebuyRequest ? 'Recompra pedida…' : rebuyLabel }}
          </button>
        </template>
        <template v-else-if="live">Entrarás en la siguiente mano</template>
        <template v-else-if="!auto && !playerOnly">Esperando a que el dealer reparta…</template>
      </div>
      <!-- chat fijo en la columna derecha (PC) -->
      <div v-if="isWide" class="chat-box">
        <div class="chat-head"><Icon name="mail" :size="16" />Chat de la mesa</div>
        <ChatPanel :messages="chat.messages" :me="s.me" :reactions="chat.reactions" :cooldown-until="chat.cooldownUntil" :now="now" :busy="chat.busy" @send="sendChat" @react="reactChat" />
      </div>
    </section>

    <!-- chat en móvil / tableta -->
    <Sheet :open="chat.open && !isWide" title="Chat de la mesa" :width="520" @close="chat.open = false">
      <div class="chat-sheet">
        <ChatPanel :messages="chat.messages" :me="s.me" :reactions="chat.reactions" :cooldown-until="chat.cooldownUntil" :now="now" :busy="chat.busy" @send="sendChat" @react="reactChat" />
      </div>
    </Sheet>

    <CardPicker
      :open="picker.open"
      :count="pickerConfig.count"
      :title="pickerConfig.title"
      :initial="pickerConfig.initial"
      :disabled="pickerConfig.disabled"
      :confirm-label="pickerConfig.label"
      :loading="busy"
      :scan="scanOn"
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
.title { min-width: 0; }
@media (max-width: 380px) { .hno { display: none; } }
.sub { display: flex; align-items: center; gap: 5px; color: var(--text-2); flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
.mbadge { font-weight: 700; color: var(--text); display: inline-flex; align-items: center; gap: 4px; }
.mbadge svg { color: var(--gold-2); }
.dotc { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
.dotc.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
.codebtn {
  display: flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border-radius: 12px;
  font-weight: 900; letter-spacing: 0.12em; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); border: 1px solid rgba(245, 181, 68, 0.35);
}

.felt-zone { flex: 1; min-height: 0; display: grid; place-items: center; padding: 40px 40px 84px; transition: padding 0.4s var(--ease); }
.felt {
  position: relative; width: 100%; height: 100%; max-width: 1000px; max-height: 560px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 40%, color-mix(in srgb, var(--felt-a) 100%, #fff 8%), var(--felt-a) 35%, var(--felt-b) 100%);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.55), 0 0 0 12px #1a1206, 0 0 0 14px #3b2a12, 0 30px 80px -20px rgba(0, 0, 0, 0.9);
  transition: background 0.6s;
}
.rail { position: absolute; inset: 14px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.08); pointer-events: none; }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 12%; pointer-events: none; }
.on-felt { position: relative; width: 100%; max-width: 400px; z-index: 6; text-align: left; }
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
.mb-timer { display: inline-flex; align-items: center; gap: 4px; font-weight: 900; font-size: 15px; padding: 3px 10px; border-radius: 99px; background: rgba(245, 181, 68, 0.18); color: var(--gold-2); }
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
.payouts { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 18px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.35); }
.pay { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.pay b { color: #86efac; font-size: 16px; }
.requests { display: flex; flex-direction: column; gap: 6px; }
.req { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 16px; background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.3); }
.req { flex-wrap: wrap; }
.req.vote > .grow { flex: 1 1 180px; }
.assign { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex: 1 1 100%; }
.assign .input { width: 110px; height: 38px; padding: 0 10px; }
.scanbox { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.physical { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 14px; color: var(--text-2); font-weight: 600; font-size: 14px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line); }
.felt-zone { position: relative; }
.chat-btn { position: relative; }
.chat-badge {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 99px; font-style: normal;
  background: var(--red); color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 0 0 2px var(--bg);
}
.chat-sheet { height: min(68dvh, 600px); display: flex; flex-direction: column; }
.chat-box { flex: 1 1 260px; min-height: 260px; display: flex; flex-direction: column; padding: 12px; border-radius: 20px; background: rgba(22, 31, 69, 0.7); border: 1px solid var(--line); }
.chat-head { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; color: var(--text-2); padding-bottom: 6px; }
.chat-box :deep(.chat) { flex: 1; min-height: 0; }
.react-fab { position: absolute; right: 12px; bottom: 10px; z-index: 30; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.react-btn { width: 44px; height: 44px; border-radius: 50%; background: rgba(22, 31, 69, 0.9); border-color: var(--line-2); box-shadow: var(--shadow); }
.react-btn.on { background: var(--surface-3); }
.react-pop {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 8px; border-radius: 18px;
  background: rgba(22, 31, 69, 0.96); border: 1px solid var(--line-2); box-shadow: var(--shadow-lg); backdrop-filter: blur(10px);
  transform-origin: bottom right;
}
.react-opt { width: 46px; height: 46px; border-radius: 12px; font-size: 26px; line-height: 1; display: flex; align-items: center; justify-content: center; padding: 0; transition: transform 0.2s var(--spring), background 0.2s; }
.react-opt:hover { background: rgba(255, 255, 255, 0.08); }
.react-opt:active { transform: scale(0.85); }
.mb-ava { position: relative; display: inline-flex; }
.mb-react {
  position: absolute; left: 50%; top: -8px; font-size: 30px; line-height: 1; pointer-events: none; z-index: 40;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.6)); animation: mb-float 2.6s var(--ease) forwards;
}
@keyframes mb-float {
  0% { transform: translate(-50%, 10px) scale(0.3); opacity: 0; }
  15% { transform: translate(-50%, -18px) scale(1.25); opacity: 1; }
  80% { transform: translate(-50%, -36px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -54px); opacity: 0; }
}
.show-btn { height: 52px; border-color: rgba(167, 139, 250, 0.5); background: rgba(167, 139, 250, 0.14); }
.show-btn .mini-cards { display: inline-flex; gap: 3px; margin-left: 4px; }
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

/* ---------- en vivo, jugador: sin mesa ---------- */
.hud { flex: none; display: flex; flex-direction: column; gap: 10px; padding: 8px 14px 4px; width: 100%; max-width: 640px; margin: 0 auto; }
.hud-stack { position: relative; transition: border-color 0.4s, box-shadow 0.4s; text-align: center; padding: 16px 12px 14px; border-radius: 22px; background: rgba(22, 31, 69, 0.85); border: 1px solid rgba(245, 181, 68, 0.3); }
.hud-stack.gain { border-color: rgba(34, 197, 94, 0.6); box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.15), 0 0 40px -10px rgba(34, 197, 94, 0.6); }
.gain-pop {
  position: absolute; right: 14px; top: 12px; padding: 3px 12px; border-radius: 99px; font-size: 17px; font-weight: 900; pointer-events: none;
  color: #052e16; background: linear-gradient(90deg, #4ade80, #22c55e); box-shadow: 0 6px 18px -6px rgba(34, 197, 94, 0.8);
}
.gain-enter-active { animation: gain-in 0.6s var(--spring); }
.gain-leave-active { transition: opacity 0.4s, transform 0.4s; }
.gain-leave-to { opacity: 0; transform: translateY(-10px); }
@keyframes gain-in { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.pop-in { animation: winpop 0.6s var(--spring); }
.hud-lbl { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.hud-big { font-size: 40px; font-weight: 900; line-height: 1.1; margin-top: 2px; color: var(--gold-2); }
.hud-tags { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 6px; }
.hud-tags:empty { display: none; }
.hud-row { display: flex; gap: 10px; }
.hud-tile { flex: 1; padding: 10px 12px; border-radius: 18px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); }
.hud-tile b { display: block; font-size: 22px; font-weight: 900; margin-top: 2px; }
.hud-tile b.gold { color: var(--gold-2); }
.hud-result { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px; background: rgba(5, 9, 28, 0.5); border: 1px solid var(--line-2); }
.hud-result.won { background: radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.25), transparent 65%), rgba(5, 9, 28, 0.5); border-color: rgba(34, 197, 94, 0.5); }
.hr-title { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 18px; color: var(--gold-2); }
.won .hr-title { color: #86efac; font-size: 20px; }
.hr-row { display: flex; align-items: center; gap: 10px; }
.hr-name { font-weight: 800; }
.hr-row b { color: #86efac; font-size: 18px; font-weight: 900; }
.hud-line { display: flex; align-items: center; gap: 8px; }
.hud-board { display: flex; justify-content: center; gap: 6px; padding: 14px 8px; border-radius: 18px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); }
.hud-board :deep(.pcard.md) { --w: 58px; }
.hud .status.hud-status { flex: 1; display: block; max-width: none; text-align: center; font-size: 15px; padding: 10px 14px; }
/* el panel de apuesta ocupa el espacio que deja la mesa */
.solo .dock { flex: 1; justify-content: flex-start; background: none; padding-top: 14px; }
.solo .player { flex: 1; justify-content: flex-start; }
.solo-cards { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); }
.solo-cards .hole { gap: 5px; }
.sb-center { text-align: center; }
.solo-box.with-table { position: relative; gap: 10px; padding: 12px; }
.sb-corner { position: absolute; top: 10px; width: 38px; height: 38px; border-radius: 12px; }
.sb-corner.r { right: 10px; }
.sb-corner.l { left: 10px; }
.tbar { position: relative; height: 34px; border-radius: 12px; overflow: hidden; background: rgba(245, 181, 68, 0.12); border: 1px solid rgba(245, 181, 68, 0.4); }
.tbar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, rgba(245, 181, 68, 0.55), rgba(245, 181, 68, 0.3)); transition: width 0.3s linear; }
.tbar span { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 800; font-size: 14px; color: var(--gold-2); }
.tbar.low { background: rgba(244, 63, 94, 0.14); border-color: rgba(244, 63, 94, 0.55); animation: winpop 0.5s infinite alternate; }
.tbar.low i { background: linear-gradient(90deg, rgba(244, 63, 94, 0.6), rgba(244, 63, 94, 0.3)); }
.tbar.low span { color: #fecdd3; }
.solo-box { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 20px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); }
.sb-cards { display: flex; justify-content: center; gap: 10px; padding: 0; }
.sb-cards :deep(.pcard.lg) { --w: 64px; }
.sb-eq { width: 100%; }
.sb-covered { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 14px; font-size: 14px; background: rgba(255, 255, 255, 0.04); }
.sb-btns { display: flex; gap: 8px; }
.sb-btns .btn { height: 48px; padding: 0 12px; white-space: nowrap; }
.sb-note { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; border-radius: 12px; font-size: 13px; font-weight: 700; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); }
.sb-note.ok { color: #86efac; background: rgba(34, 197, 94, 0.12); }
.covered-msg { color: var(--text-3); font-weight: 700; }
.solo-pick { display: flex; gap: 8px; }
.solo-pick .btn { height: 48px; }
.solo .padwrap { border-top: 0; padding-top: 0; }
@media (min-width: 1100px) {
  .hud { padding-top: 24px; justify-content: flex-start; }
}

.slide-enter-active { transition: transform 0.5s var(--ease), opacity 0.35s; }

/* panel de apuesta: sube con rebote y sus partes entran una tras otra; al irse baja y se desvanece */
.betpad-enter-active { animation: betpad-in 0.6s var(--spring) both; }
.betpad-leave-active { animation: betpad-out 0.3s ease-in both; }
.betpad-enter-active :deep(.pad > *) { animation: betpad-item 0.55s var(--spring) both; }
.betpad-enter-active :deep(.pad > *:nth-child(1)) { animation-delay: 0.06s; }
.betpad-enter-active :deep(.pad > *:nth-child(2)) { animation-delay: 0.12s; }
.betpad-enter-active :deep(.pad > *:nth-child(3)) { animation-delay: 0.18s; }
.betpad-enter-active :deep(.pad > *:nth-child(4)) { animation-delay: 0.24s; }
.betpad-enter-active :deep(.pad > *:nth-child(5)) { animation-delay: 0.3s; }
@keyframes betpad-in {
  from { opacity: 0; transform: translateY(70px) scale(0.94); filter: blur(6px); }
  60% { filter: blur(0); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes betpad-out { to { opacity: 0; transform: translateY(50px) scale(0.96); filter: blur(4px); } }
@keyframes betpad-item { from { opacity: 0; transform: translateY(26px) scale(0.92); } to { opacity: 1; transform: none; } }
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
  .felt-zone { padding: 78px 22px 14px; min-height: 300px; }
  .crowd .felt-zone { min-height: 380px; padding-top: 70px; }
  /* mesa llena: asientos más pequeños para que nada se monte */
  .crowd .seat-pos { transform: translate(-50%, -50%) scale(0.8); }
  .crowd .center { padding-top: 0; }
  .felt { border-radius: 50% / 46%; max-height: none; }
  .center { padding: 18% 6% 0; gap: 7px; }
  .board { gap: 4px; }
  .board :deep(.pcard.md) { --w: 44px; }
  .dock { padding: 6px 12px calc(8px + var(--safe-b)); gap: 8px; max-height: none; overflow: visible; }
  .turn .felt-zone { padding-top: 72px; min-height: 200px; }
  .crowd.turn .felt-zone { min-height: 340px; }
  .turn .center { padding-top: 22%; }
  .turn .pot { font-size: 13px; padding: 3px 10px 3px 4px; }
  .turn .status { font-size: 12px; padding: 3px 10px; }
  .padwrap { padding-top: 6px; }
}
/* mesa grande: el aviso va encima del bote, lejos de tu asiento */
@media (min-width: 701px) {
  .status { order: -1; }
  .crowd .status { order: 0; }
}
@media (min-width: 701px) and (max-width: 1099px) {
  .felt-zone { min-height: 420px; }
  .crowd .felt-zone { min-height: 500px; }
}
@media (min-width: 1100px) {
  .tp { display: grid; grid-template-columns: 1fr 440px; grid-template-rows: auto 1fr; }
  .bar { grid-column: 1 / -1; }
  .dock { max-height: none; min-height: 0; overflow-y: auto; background: rgba(11, 16, 38, 0.6); border-left: 1px solid var(--line); justify-content: flex-start; padding-top: 14px; }
  .dock > * { flex-shrink: 0; }
  .dock > .chat-box { flex: 1 1 260px; }
}
</style>
