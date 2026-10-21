<script setup>
// Mesa de blackjack: la banca arriba y, abajo, la casilla de cada jugador con sus apuestas y sus manos.
import { computed } from 'vue';
import { totalLabel, handTotal, sideInfo } from '@shared/blackjack.js';
import { formatChips } from '@/lib/format.js';
import PlayingCard from './PlayingCard.vue';
import Avatar from './Avatar.vue';
import Chip from './Chip.vue';
import Icon from './Icon.vue';

const props = defineProps({
  hand: { type: Object, default: null }, // vista de la mano (cartas de la banca ya recortadas al destaparlas)
  seats: { type: Array, required: true },
  me: { type: String, required: true },
  chips: { type: Array, required: true },
  final: Boolean, // resultados visibles (la banca ya destapó todo)
  status: { type: String, default: '' },
  statusKind: { type: String, default: '' },
  turnLeft: { type: Number, default: 0 },
  reactions: { type: Object, default: () => ({}) },
  mobile: Boolean,
});

const seatsById = computed(() => Object.fromEntries(props.seats.map((s) => [s.userId, s])));
// en una ronda, los que juegan; entre rondas, los sentados
const spots = computed(() => {
  const list = props.hand
    ? props.hand.players.map((p) => ({ ...p, seat: seatsById.value[p.userId] || { displayName: '—' } }))
    : props.seats.filter((s) => s.status === 'active').map((s) => ({ userId: s.userId, seat: s, stack: s.chips, hands: [], bets: {}, side: {}, idle: true }));
  // tu casilla, en el centro
  const mine = list.findIndex((x) => x.userId === props.me);
  if (mine < 0) return list;
  const others = list.filter((_, i) => i !== mine);
  const half = Math.ceil(others.length / 2);
  return [...others.slice(0, half), list[mine], ...others.slice(half)];
});
const many = computed(() => spots.value.length >= 4);

const dealer = computed(() => props.hand?.dealer || []);
const dealerLabel = computed(() => {
  const shown = dealer.value.filter(Boolean);
  if (!shown.length) return '';
  return dealer.value.every(Boolean) ? totalLabel(shown, false, true) : String(handTotal(shown).total);
});
const dealerBust = computed(() => handTotal(dealer.value.filter(Boolean)).total > 21);

const chipIndex = (v) => {
  let idx = 0;
  props.chips.forEach((c, i) => c <= v && (idx = i));
  return idx;
};
function result(h) {
  if (handTotal(h.cards).total > 21) return { cls: 'lose', text: 'Se pasa' };
  if (!props.final || !h.result) return null;
  const net = h.payout - h.bet;
  if (h.result === 'blackjack') return { cls: 'bj', text: `Blackjack +${formatChips(net)}` };
  if (h.result === 'win') return { cls: 'win', text: `+${formatChips(net)}` };
  if (h.result === 'push') return { cls: 'push', text: 'Empate' };
  return { cls: 'lose', text: `−${formatChips(h.bet)}` };
}
const sideText = (s) => (s.kind ? `${sideInfo(s.kind).label} +${formatChips(s.win - s.bet)}` : 'Sin premio');
const turnOf = (p) => props.hand?.stage === 'play' && props.hand.toAct === p.userId;
</script>

<template>
  <div class="bjt" :class="{ many, mobile }">
    <!-- la banca -->
    <div class="dealer">
      <div class="d-head">
        <span class="d-name"><Icon name="dealer" :size="15" />Banca</span>
        <Transition name="pop" mode="out-in">
          <span v-if="dealerLabel" :key="dealerLabel" class="tot" :class="{ lose: dealerBust }">{{ dealerBust ? `${dealerLabel} · se pasa` : dealerLabel }}</span>
        </Transition>
      </div>
      <TransitionGroup name="deal" tag="div" class="cards dcards">
        <PlayingCard v-for="(c, i) in dealer" :key="i" :card="c" :size="mobile ? 'md' : 'lg'" :style="{ '--i': i }" />
      </TransitionGroup>
      <div v-if="!dealer.length" class="d-empty">
        <PlayingCard card="" :size="mobile ? 'md' : 'lg'" placeholder><span></span></PlayingCard>
        <PlayingCard card="" :size="mobile ? 'md' : 'lg'" placeholder><span></span></PlayingCard>
      </div>
    </div>

    <div class="arc">
      <b>Blackjack paga 3 a 2</b>
      <span>La banca pide hasta 17 · Par paga hasta 25 a 1 · 21+3 hasta 100 a 1</span>
    </div>

    <Transition name="fade" mode="out-in">
      <div :key="status.replace(/\d+s$/, '')" class="status" :class="statusKind">{{ status }}</div>
    </Transition>

    <!-- casillas de los jugadores -->
    <TransitionGroup name="list" tag="div" class="spots">
      <div v-for="p in spots" :key="p.userId" class="spot" :class="{ me: p.userId === me, turn: turnOf(p), out: p.out || p.idle, ready: p.ready && hand?.stage === 'bets' }">
        <!-- manos (al dividir, varias) -->
        <div v-if="p.hands.length" class="hands">
          <div v-for="(h, i) in p.hands" :key="i" class="bjhand" :class="{ cur: turnOf(p) && i === p.cur && p.hands.length > 1 }">
            <TransitionGroup name="deal" tag="div" class="cards">
              <PlayingCard v-for="(c, j) in h.cards" :key="j" :card="c" :size="p.userId === me ? (mobile ? 'sm' : 'md') : mobile || many ? 'xs' : 'sm'" :style="{ '--i': j }" />
            </TransitionGroup>
            <div class="h-meta">
              <span class="tot">{{ totalLabel(h.cards, h.split, h.done) }}</span>
              <Transition name="pop">
                <span v-if="result(h)" class="res" :class="result(h).cls">{{ result(h).text }}</span>
              </Transition>
              <span v-if="h.doubled" class="tiny">x2</span>
            </div>
          </div>
        </div>

        <!-- apuestas -->
        <div class="bets">
          <span v-if="p.bets?.main" class="b main num"><Chip :value="p.bets.main" :index="chipIndex(p.bets.main)" :size="22" />{{ formatChips(p.hands?.reduce((a, h) => a + h.bet, 0) || p.bets.main) }}</span>
          <span v-if="p.bets?.pair" class="b num" :class="p.side?.pair ? (p.side.pair.win ? 'won' : 'lost') : ''" :title="p.side?.pair ? sideText(p.side.pair) : ''">Par {{ formatChips(p.bets.pair) }}</span>
          <span v-if="p.bets?.t21" class="b num" :class="p.side?.t21 ? (p.side.t21.win ? 'won' : 'lost') : ''" :title="p.side?.t21 ? sideText(p.side.t21) : ''">21+3 {{ formatChips(p.bets.t21) }}</span>
        </div>
        <div v-if="p.userId === me && (p.side?.pair?.kind || p.side?.t21?.kind)" class="side-win">
          <span v-if="p.side.pair?.kind"><Icon name="sparkles" :size="13" />{{ sideText(p.side.pair) }}</span>
          <span v-if="p.side.t21?.kind"><Icon name="sparkles" :size="13" />{{ sideText(p.side.t21) }}</span>
        </div>

        <div class="who">
          <span class="ava">
            <Avatar :user="p.seat" :size="p.userId === me ? 30 : 26" />
            <Transition name="react"><span v-if="reactions[p.userId]" :key="reactions[p.userId].id" class="react">{{ reactions[p.userId].emoji }}</span></Transition>
          </span>
          <div class="who-txt">
            <b class="ellipsis">{{ p.userId === me ? 'Tú' : p.seat.displayName }}</b>
            <small class="num">{{ formatChips(p.stack) }}</small>
          </div>
          <span v-if="turnOf(p) && turnLeft" class="timer num"><Icon name="timer" :size="12" />{{ turnLeft }}</span>
          <span v-else-if="hand?.stage === 'bets' && p.ready" class="ok"><Icon name="check" :size="13" /></span>
        </div>
        <div v-if="p.out && hand && hand.stage !== 'bets'" class="sit">No apostó</div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.bjt {
  position: relative; width: 100%; max-width: 1000px; min-height: min(100%, 640px); align-self: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 16px 30px;
  border-radius: 34px 34px 50% 50% / 34px 34px 22% 22%;
  background: radial-gradient(ellipse at 50% 20%, color-mix(in srgb, var(--felt-a) 100%, #fff 8%), var(--felt-a) 40%, var(--felt-b) 100%);
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.55), 0 0 0 10px #1a1206, 0 0 0 12px #3b2a12, 0 30px 80px -20px rgba(0, 0, 0, 0.9);
}
.dealer { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.d-head { display: flex; align-items: center; gap: 8px; }
.d-name { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.75); }
.tot { min-width: 26px; padding: 2px 9px; border-radius: 99px; font-weight: 900; font-size: 13px; text-align: center; background: rgba(0, 0, 0, 0.5); color: #fff; }
.tot.lose { background: rgba(244, 63, 94, 0.85); }
.cards { display: flex; }
.cards > * + * { margin-left: calc(var(--w, 38px) * -0.36); }
.dcards > * + * { margin-left: 6px; }
.d-empty { display: flex; gap: 6px; opacity: 0.6; }
.d-empty :deep(.phc) { border-color: rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.12); }
.arc { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; padding: 6px 0 2px; }
.arc b { font-size: 14px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold-2); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); }
.arc span { font-size: 11.5px; font-weight: 700; color: rgba(255, 255, 255, 0.55); }
.status { font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.8); text-align: center; max-width: 92%; padding: 4px 12px; border-radius: 99px; background: rgba(0, 0, 0, 0.28); }
.status.mine { color: #2a1700; background: var(--gold); }
.status.win { color: #052e16; background: linear-gradient(90deg, #4ade80, #22c55e); }
.status.lose { color: #fff; background: rgba(244, 63, 94, 0.8); }

.spots { flex: 1; width: 100%; display: flex; flex-wrap: wrap; align-items: flex-end; align-content: flex-end; justify-content: center; gap: 10px; margin-top: 4px; }
.spot {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 104px; max-width: 220px;
  padding: 8px 10px 8px; border-radius: 18px; background: rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.08);
  transition: border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s var(--spring);
}
.spot.me { background: rgba(0, 0, 0, 0.32); border-color: rgba(245, 181, 68, 0.4); min-width: 130px; }
.spot.turn { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(245, 181, 68, 0.25), 0 0 30px -6px rgba(245, 181, 68, 0.6); transform: translateY(-3px); }
.spot.ready { border-color: rgba(34, 197, 94, 0.5); }
.spot.out { opacity: 0.5; }
.hands { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.bjhand { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 3px; border-radius: 12px; transition: background 0.3s, box-shadow 0.3s; }
.bjhand.cur { background: rgba(245, 181, 68, 0.12); box-shadow: 0 0 0 2px rgba(245, 181, 68, 0.6); }
.h-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: center; }
.res { padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: 900; white-space: nowrap; }
.res.win { background: linear-gradient(90deg, #4ade80, #22c55e); color: #052e16; }
.res.bj { background: linear-gradient(90deg, var(--gold-2), var(--gold)); color: #2a1700; }
.res.push { background: rgba(255, 255, 255, 0.18); color: #fff; }
.res.lose { background: rgba(244, 63, 94, 0.85); color: #fff; }
.tiny { font-size: 11px; font-weight: 900; color: var(--gold-2); }
.bets { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.bets:empty { display: none; }
.b { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 99px; font-size: 11.5px; font-weight: 800; background: rgba(0, 0, 0, 0.4); color: rgba(255, 255, 255, 0.85); }
.b.main { padding-left: 1px; font-size: 13px; color: #fff; }
.b.won { background: rgba(34, 197, 94, 0.3); color: #bbf7d0; }
.b.lost { opacity: 0.5; text-decoration: line-through; }
.side-win { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.side-win span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 800; color: #86efac; }
.who { display: flex; align-items: center; gap: 6px; max-width: 100%; }
.who-txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.who-txt b { font-size: 12.5px; max-width: 110px; }
.who-txt small { font-size: 11.5px; font-weight: 800; color: var(--gold-2); }
.timer { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 900; padding: 1px 6px; border-radius: 99px; background: rgba(245, 181, 68, 0.25); color: var(--gold-2); }
.ok { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: rgba(34, 197, 94, 0.3); color: #86efac; }
.sit { font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.6); }
.ava { position: relative; display: inline-flex; }
.react {
  position: absolute; left: 50%; top: -8px; font-size: 28px; line-height: 1; pointer-events: none; z-index: 40;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.6)); animation: float 2.6s var(--ease) forwards;
}
@keyframes float {
  0% { transform: translate(-50%, 10px) scale(0.3); opacity: 0; }
  15% { transform: translate(-50%, -18px) scale(1.25); opacity: 1; }
  80% { transform: translate(-50%, -36px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -54px); opacity: 0; }
}

/* cartas que llegan desde el sabot */
.deal-enter-active { transition: transform 0.45s var(--spring), opacity 0.3s; transition-delay: calc(var(--i, 0) * 0.08s); }
.deal-enter-from { transform: translate(40px, -60px) rotate(12deg) scale(0.7); opacity: 0; }

.mobile { padding: 14px 10px 26px; gap: 8px; border-radius: 26px 26px 50% 50% / 26px 26px 14% 14%; }
.mobile .arc span { display: none; }
.mobile .spots { gap: 6px; }
.mobile .spot { min-width: 88px; padding: 6px 7px; }
.mobile .spot.me { min-width: 112px; }
.many.mobile .spot:not(.me) { max-width: 120px; }
</style>
