<script setup>
import { computed } from 'vue';
import Avatar from './Avatar.vue';
import PlayingCard from './PlayingCard.vue';
import Chip from './Chip.vue';
import Icon from './Icon.vue';
import { formatChips, ACTION_LABEL } from '@/lib/format.js';

const props = defineProps({
  seat: { type: Object, required: true },
  player: { type: Object, default: null }, // estado en la mano actual
  hand: { type: Object, default: null },
  isMe: Boolean,
  isDealer: Boolean,
  handName: String,
  betDir: { type: Object, default: () => ({ x: 0, y: -1 }) },
  mode: { type: String, default: 'live' },
  secondsLeft: { type: Number, default: 0 }, // tiempo de turno (modo aleatorio)
  betReach: { type: Number, default: 1 }, // distancia de la ficha de apuesta al asiento
});

const turn = computed(() => props.hand?.toAct === props.seat.userId);
const stack = computed(() => (props.player ? props.player.stack : props.seat.chips));
const badge = computed(() => {
  const h = props.hand;
  if (!h || !props.player) return null;
  if (h.buttonId === props.seat.userId) return 'D';
  return null;
});
const blind = computed(() => {
  const h = props.hand;
  if (!h || !props.player || h.stage !== 'preflop') return null;
  if (h.sbId === props.seat.userId) return 'SB';
  if (h.bbId === props.seat.userId) return 'BB';
  return null;
});
const won = computed(
  () =>
    props.hand?.stage === 'done' &&
    !!props.player &&
    (props.player.won > 0 || (props.mode === 'offline' && props.hand.result?.winners?.includes(props.seat.userId))),
);
const showCards = computed(() => props.player && !props.player.folded && props.hand && props.hand.stage !== 'done' || (props.player?.cards?.length && props.hand?.stage === 'done'));
const lastLabel = computed(() => {
  const l = props.player?.last;
  if (!l || l.type === 'sb' || l.type === 'bb') return '';
  return ACTION_LABEL[l.type] + (l.amount && !['fold', 'check'].includes(l.type) ? ' ' + formatChips(l.type === 'raise' || l.type === 'bet' ? l.to || l.amount : l.amount) : '');
});
</script>

<template>
  <div class="seat" :class="{ turn, folded: player?.folded, out: !player && hand && hand.stage !== 'done', me: isMe, won, sitout: seat.status === 'sitout' }">
    <div class="cards" v-if="showCards && !isMe">
      <PlayingCard :card="player.cards?.[0] || ''" size="xs" />
      <PlayingCard :card="player.cards?.[1] || ''" size="xs" />
    </div>
    <div class="ava-wrap">
      <svg v-if="turn" class="timer" :class="{ low: secondsLeft && secondsLeft <= 10 }" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" /></svg>
      <span v-if="turn && secondsLeft" class="secs num" :class="{ low: secondsLeft <= 10 }">{{ secondsLeft }}</span>
      <Avatar :user="seat" :size="48" />
      <span v-if="badge" class="btn-badge">D</span>
      <span v-if="isDealer" class="dealer-badge" title="Dealer"><Icon name="dealer" :size="11" :stroke="2.6" /></span>
      <span v-if="!seat.online" class="offline" title="Desconectado"></span>
    </div>
    <div class="plate">
      <div class="name ellipsis">{{ isMe ? 'Tú' : seat.displayName }}</div>
      <div v-if="mode !== 'offline'" class="chips num">{{ formatChips(stack) }}</div>
    </div>
    <Transition name="pop">
      <div v-if="lastLabel && hand?.stage !== 'done'" :key="lastLabel" class="action" :class="player.last.type">{{ lastLabel }}</div>
      <div v-else-if="won" class="action win"><Icon v-if="mode === 'offline'" name="trophy" :size="11" /> {{ mode === 'offline' ? 'Gana' : '+' + formatChips(player.won) }}</div>
      <div v-else-if="seat.status === 'sitout'" class="action muted">Fuera</div>
    </Transition>
    <div v-if="handName" class="hname">{{ handName }}</div>
    <Transition name="pop">
      <div
        v-if="player?.bet > 0"
        class="bet"
        :style="{ '--bx': betDir.x * 72 * betReach + 'px', '--by': betDir.y * (betDir.y > 0 ? 92 : 70) * betReach + 'px' }"
      >
        <Chip :value="player.bet" :index="0" :size="22" />
        <span class="num">{{ formatChips(player.bet) }}</span>
        <i v-if="blind" class="bl">{{ blind }}</i>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.seat {
  position: relative; display: flex; flex-direction: column; align-items: center; width: 84px;
  transition: opacity 0.4s, filter 0.4s, transform 0.4s var(--ease);
}
.seat.folded, .seat.out, .seat.sitout { opacity: 0.45; filter: grayscale(0.6); }
.cards { display: flex; gap: 2px; margin-bottom: -14px; z-index: 0; transform: rotate(-4deg); }
.cards > :last-child { transform: rotate(8deg) translateY(1px); }
.ava-wrap { position: relative; z-index: 1; border-radius: 50%; padding: 3px; background: rgba(5, 9, 28, 0.8); box-shadow: 0 6px 16px -6px rgba(0,0,0,.8); }
.turn .ava-wrap { background: var(--gold); box-shadow: 0 0 0 0 rgba(245, 181, 68, 0.6), 0 0 24px rgba(245, 181, 68, 0.6); animation: pulse 1.6s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(245, 181, 68, 0.55); } 100% { box-shadow: 0 0 0 14px rgba(245, 181, 68, 0); } }
.timer { position: absolute; inset: -5px; width: calc(100% + 10px); height: calc(100% + 10px); transform: rotate(-90deg); }
.timer circle { fill: none; stroke: #fff; stroke-width: 3; stroke-dasharray: 296; animation: dash 2.4s linear infinite; opacity: 0.7; }
.timer.low circle { stroke: #fb7185; opacity: 1; }
.secs {
  position: absolute; left: -10px; bottom: -4px; z-index: 3; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 99px;
  display: grid; place-items: center; font-size: 11px; font-weight: 900; background: var(--gold); color: #2a1700; box-shadow: 0 2px 6px rgba(0,0,0,.5);
}
.secs.low { background: #f43f5e; color: #fff; }
@keyframes dash { from { stroke-dashoffset: 296; } to { stroke-dashoffset: -296; } }
.won .ava-wrap { background: linear-gradient(135deg, #4ade80, #16a34a); animation: winpop 0.8s var(--spring); }
@keyframes winpop { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 100% { transform: scale(1); } }
.btn-badge {
  position: absolute; right: -6px; bottom: -2px; width: 22px; height: 22px; border-radius: 50%; background: #fff; color: #111;
  font-size: 11px; font-weight: 900; display: grid; place-items: center; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.dealer-badge { position: absolute; left: -6px; top: -6px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #2a1700; background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); box-shadow: 0 2px 6px rgba(0,0,0,.6); }
.offline { position: absolute; right: 0; top: 0; width: 11px; height: 11px; border-radius: 50%; background: #64748b; border: 2px solid #0b1026; }
.plate {
  margin-top: -8px; z-index: 2; min-width: 76px; max-width: 92px; padding: 3px 8px 4px; border-radius: 10px; text-align: center;
  background: rgba(8, 12, 32, 0.88); border: 1px solid var(--line-2); backdrop-filter: blur(6px);
}
.me .plate { border-color: rgba(245, 181, 68, 0.6); }
.name { font-size: 12px; font-weight: 700; line-height: 1.2; }
.chips { font-size: 12.5px; font-weight: 800; color: var(--gold-2); line-height: 1.2; }
.action {
  position: absolute; top: -14px; z-index: 3; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 800; white-space: nowrap;
  background: #334155; color: #fff; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}
.action.fold { background: #7f1d1d; }
.action.check { background: #1e3a8a; }
.action.call { background: #1d4ed8; }
.action.bet, .action.raise { background: #b45309; }
.action.allin { background: linear-gradient(90deg, #db2777, #9333ea); }
.action.win { background: linear-gradient(90deg, #16a34a, #22c55e); }
.action.muted { background: #334155; color: var(--text-2); }
.hname { margin-top: 3px; font-size: 10.5px; font-weight: 700; color: #fde68a; text-align: center; max-width: 110px; line-height: 1.15; text-shadow: 0 1px 3px #000; }
.bet {
  position: absolute; left: 50%; top: 40%; z-index: 4;
  transform: translate(-50%, -50%) translate(var(--bx), var(--by));
  display: flex; align-items: center; gap: 4px; padding: 2px 8px 2px 2px; border-radius: 99px;
  background: rgba(0, 0, 0, 0.55); font-size: 12px; font-weight: 800; white-space: nowrap;
}
.bet .bl { font-style: normal; font-size: 9.5px; color: var(--text-3); }
.bet.pop-enter-from { transform: translate(-50%, -50%) scale(0.4); }
@media (min-width: 900px) {
  .seat { width: 104px; }
  .plate { min-width: 92px; max-width: 110px; }
  .name { font-size: 13px; }
  .chips { font-size: 14px; }
}
</style>
