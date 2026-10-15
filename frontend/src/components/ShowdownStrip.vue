<script setup>
// Cartas de todos boca arriba (all-in / showdown): jugada de cada uno y % de ganar
// que se recalcula a medida que salen las cartas comunes.
import { computed, onUnmounted, ref, watch } from 'vue';
import { describeCurrent } from '@shared/poker.js';
import Avatar from './Avatar.vue';
import PlayingCard from './PlayingCard.vue';
import Icon from './Icon.vue';

const props = defineProps({
  players: { type: Array, required: true }, // [{ userId, seat, cards, isMe, winner }]
  board: { type: Array, default: () => [] },
  final: Boolean, // mano resuelta y todas las cartas a la vista
  allIn: Boolean,
});

const pct = ref({});
let worker = null;
let reqId = 0;
watch(
  () => [props.players.map((p) => p.userId + p.cards.join('')).join('|'), props.board.join()],
  () => {
    if (props.board.length >= 5 || props.players.length < 2) {
      pct.value = {};
      return;
    }
    if (!worker) {
      worker = new Worker(new URL('../lib/equity.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.id !== reqId) return;
        pct.value = Object.fromEntries(props.players.map((p, i) => [p.userId, e.data.result[i]]));
      };
    }
    worker.postMessage({ id: ++reqId, hands: props.players.map((p) => [...p.cards]), board: [...props.board] });
  },
  { immediate: true },
);
onUnmounted(() => worker?.terminate());

const rows = computed(() =>
  props.players.map((p) => ({
    ...p,
    hand: describeCurrent(p.cards, props.board)?.name || '',
    pct: pct.value[p.userId],
  })),
);
const leader = computed(() => {
  if (props.final) return null;
  let best = null;
  for (const r of rows.value) if (r.pct != null && (!best || r.pct > best.pct)) best = r;
  return best?.userId;
});
</script>

<template>
  <div class="strip" :class="{ final }">
    <div class="head">
      <span class="tag" :class="{ allin: allIn && !final }">
        <Icon :name="final ? 'trophy' : allIn ? 'zap' : 'eye'" :size="14" />
        {{ final ? 'Resultado' : allIn ? 'All-in' : 'Showdown' }}
      </span>
      <span v-if="!final && board.length < 5" class="small faint">Probabilidad de ganar con las cartas que faltan</span>
    </div>
    <TransitionGroup name="list" tag="div" class="rows">
      <div v-for="r in rows" :key="r.userId" class="row-p" :class="{ me: r.isMe, win: final && r.winner, lose: final && !r.winner, lead: leader === r.userId }">
        <Avatar :user="r.seat" :size="34" />
        <div class="who">
          <b class="ellipsis">{{ r.isMe ? 'Tú' : r.seat.displayName }}</b>
          <span class="hand ellipsis">{{ r.hand }}</span>
        </div>
        <div class="cards">
          <PlayingCard :card="r.cards[0]" size="sm" />
          <PlayingCard :card="r.cards[1]" size="sm" :delay="0.15" />
        </div>
        <div class="res">
          <template v-if="final">
            <span v-if="r.winner" class="won"><Icon name="trophy" :size="14" />Gana</span>
          </template>
          <template v-else-if="r.pct != null">
            <b class="num">{{ Math.round(r.pct) }}%</b>
            <div class="bar"><div :style="{ width: r.pct + '%' }"></div></div>
          </template>
          <span v-else class="spinner"></span>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.strip {
  padding: 12px; border-radius: 20px; display: flex; flex-direction: column; gap: 8px;
  background: radial-gradient(circle at 0% 0%, rgba(167, 139, 250, 0.18), transparent 55%), rgba(22, 31, 69, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.35); animation: rise 0.45s var(--spring);
}
.strip.final { background: radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.16), transparent 55%), rgba(22, 31, 69, 0.92); border-color: rgba(34, 197, 94, 0.35); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; background: rgba(255, 255, 255, 0.08); }
.tag.allin { background: linear-gradient(90deg, #db2777, #9333ea); animation: pulse-tag 1.4s infinite; }
@keyframes pulse-tag { 50% { box-shadow: 0 0 0 6px rgba(219, 39, 119, 0); } 0% { box-shadow: 0 0 0 0 rgba(219, 39, 119, 0.5); } }
.final .tag { background: rgba(34, 197, 94, 0.2); color: #86efac; }
.rows { display: flex; flex-direction: column; gap: 6px; }
.row-p {
  display: grid; grid-template-columns: auto 1fr auto 64px; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 14px; background: rgba(5, 9, 28, 0.45); border: 1px solid transparent;
  transition: border-color 0.3s, background 0.3s, opacity 0.4s, transform 0.4s var(--spring);
}
.row-p.me { border-color: rgba(245, 181, 68, 0.45); }
.row-p.lead { background: rgba(167, 139, 250, 0.12); }
.row-p.win { border-color: rgba(34, 197, 94, 0.6); background: rgba(34, 197, 94, 0.12); transform: scale(1.02); }
.row-p.lose { opacity: 0.55; }
.who { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.who b { font-size: 14px; }
.hand { font-size: 12px; color: #fde68a; font-weight: 600; }
.cards { display: flex; gap: 3px; }
.res { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.res b { font-size: 16px; font-weight: 900; }
.bar { width: 100%; height: 4px; border-radius: 9px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
.bar div { height: 100%; background: linear-gradient(90deg, var(--violet), var(--gold)); transition: width 0.6s var(--ease); }
.won { display: inline-flex; align-items: center; gap: 4px; font-weight: 900; color: #86efac; font-size: 14px; }
</style>
