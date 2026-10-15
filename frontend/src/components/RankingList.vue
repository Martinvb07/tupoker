<script setup>
// Podio + lista para rankings de jugadores.
import { computed } from 'vue';
import Avatar from './Avatar.vue';
import { formatChips, formatSigned } from '@/lib/format.js';
import { auth } from '@/lib/store.js';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  metric: { type: String, default: 'net' },
});

const FMT = {
  net: (r) => formatSigned(r.net, formatChips),
  wagered: (r) => formatChips(r.wagered),
  won: (r) => formatChips(r.winnings),
  lost: (r) => formatChips(r.lost),
  hands: (r) => r.hands,
  winRate: (r) => `${Math.round(r.winRate)}%`,
  biggestPot: (r) => formatChips(r.biggestPot),
};
const val = (r) => (FMT[props.metric] || FMT.net)(r);
const tone = (r) => (props.metric === 'net' ? (r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : '') : props.metric === 'lost' ? 'neg' : '');
const podium = computed(() => [props.rows[1], props.rows[0], props.rows[2]]);
const rest = computed(() => props.rows.slice(3));
</script>

<template>
  <div v-if="!rows.length" class="card empty">
    <div class="big">🏆</div>
    Todavía no hay manos jugadas. ¡El ranking se llena solo al jugar!
  </div>
  <div v-else>
    <div class="podium">
      <template v-for="(r, i) in podium" :key="i">
        <RouterLink v-if="r" :to="`/u/${r.user.username}`" class="pod" :class="'p' + (i === 1 ? 1 : i === 0 ? 2 : 3)">
          <div class="crown" v-if="i === 1">👑</div>
          <Avatar :user="r.user" :size="i === 1 ? 76 : 60" ring />
          <b class="ellipsis">{{ r.user.displayName }}</b>
          <span class="num v" :class="tone(r)">{{ val(r) }}</span>
          <div class="block"><span>{{ i === 1 ? 1 : i === 0 ? 2 : 3 }}</span></div>
        </RouterLink>
        <div v-else class="pod empty-pod"></div>
      </template>
    </div>
    <TransitionGroup tag="div" name="list" class="rows">
      <RouterLink v-for="(r, i) in rest" :key="r.user.id" :to="`/u/${r.user.username}`" class="rrow" :class="{ me: r.user.id === auth.user?.id }">
        <span class="pos-n num">{{ i + 4 }}</span>
        <Avatar :user="r.user" :size="38" />
        <div class="grow">
          <div class="ellipsis nm">{{ r.user.displayName }}</div>
          <div class="small faint">{{ r.hands }} manos · {{ Math.round(r.winRate) }}% ganadas</div>
        </div>
        <b class="num" :class="tone(r)">{{ val(r) }}</b>
      </RouterLink>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.podium { display: grid; grid-template-columns: 1fr 1.15fr 1fr; align-items: end; gap: 10px; margin: 26px 0 18px; }
.pod { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; min-width: 0; animation: rise 0.6s var(--spring) both; }
.pod.p1 { animation-delay: 0.1s; }
.pod.p2 { animation-delay: 0.2s; }
.pod.p3 { animation-delay: 0.3s; }
.pod b { max-width: 100%; font-size: 14px; }
.v { font-weight: 800; font-size: 15px; }
.crown { font-size: 26px; margin-bottom: -6px; animation: float 3s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-5px); } }
.block {
  width: 100%; border-radius: 16px 16px 6px 6px; display: grid; place-items: center; font-weight: 900; font-size: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02)); border: 1px solid var(--line);
}
.p1 .block { height: 110px; background: linear-gradient(180deg, rgba(245, 181, 68, 0.4), rgba(245, 181, 68, 0.05)); color: var(--gold-2); border-color: rgba(245, 181, 68, 0.4); }
.p2 .block { height: 80px; color: #e2e8f0; }
.p3 .block { height: 60px; color: #fdba74; }
.rows { display: flex; flex-direction: column; gap: 8px; }
.rrow { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); transition: transform 0.25s var(--ease), border-color 0.2s; }
.rrow:hover { transform: translateX(4px); border-color: var(--line-2); }
.rrow.me { border-color: rgba(245, 181, 68, 0.5); }
.pos-n { width: 26px; text-align: center; font-weight: 800; color: var(--text-3); }
.nm { font-weight: 700; }
</style>
