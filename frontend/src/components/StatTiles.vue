<script setup>
import { computed } from 'vue';
import { formatChips, formatSigned } from '@/lib/format.js';

const props = defineProps({ stats: { type: Object, required: true } });

const tiles = computed(() => {
  const s = props.stats;
  return [
    { label: 'Balance total', value: formatSigned(s.net, formatChips), tone: s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : '', big: true },
    { label: 'Total apostado', value: formatChips(s.wagered) },
    { label: 'Ganado', value: formatChips(s.winnings), tone: 'pos' },
    { label: 'Perdido', value: formatChips(s.lost), tone: 'neg' },
    { label: 'Manos jugadas', value: s.hands },
    { label: 'Manos ganadas', value: `${s.handsWon} · ${Math.round(s.winRate || 0)}%` },
    { label: 'Bote más grande', value: formatChips(s.biggestPot || 0) },
    { label: 'Sesiones', value: s.sessions },
  ];
});

// mini gráfico de evolución (balance acumulado de las últimas manos)
const spark = computed(() => {
  const t = props.stats.trend || [];
  if (t.length < 2) return null;
  let acc = 0;
  const pts = t.map((v) => (acc += v));
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
  const span = max - min || 1;
  const W = 300, H = 70;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - min) / span) * H]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return { d, area: `${d} L${W},${H} L0,${H} Z`, zero: H - ((0 - min) / span) * H, up: acc >= 0 };
});
</script>

<template>
  <div class="tiles">
    <div v-for="(t, i) in tiles" :key="t.label" class="tile rise" :class="{ big: t.big }" :style="{ animationDelay: i * 40 + 'ms' }">
      <div class="lbl">{{ t.label }}</div>
      <div class="val num" :class="t.tone">{{ t.value }}</div>
      <svg v-if="t.big && spark" class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-label="Evolución del balance">
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" :stop-color="spark.up ? '#22c55e' : '#f43f5e'" stop-opacity="0.35" />
            <stop offset="1" :stop-color="spark.up ? '#22c55e' : '#f43f5e'" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2="300" :y1="spark.zero" :y2="spark.zero" stroke="rgba(255,255,255,.15)" stroke-dasharray="4 4" />
        <path :d="spark.area" fill="url(#sg)" />
        <path :d="spark.d" fill="none" :stroke="spark.up ? '#22c55e' : '#f43f5e'" stroke-width="2.5" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 700px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
.tile { padding: 14px; border-radius: 16px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line); position: relative; overflow: hidden; }
.tile.big { grid-column: 1 / -1; padding-bottom: 8px; }
.lbl { font-size: 12px; color: var(--text-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.val { font-size: 20px; font-weight: 800; margin-top: 4px; }
.big .val { font-size: 32px; }
.spark { width: 100%; height: 70px; margin-top: 6px; display: block; }
</style>
