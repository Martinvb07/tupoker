<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { describeCurrent } from '@shared/poker.js';

const props = defineProps({
  hole: { type: Array, default: () => [] },
  board: { type: Array, default: () => [] },
  opponents: { type: Number, default: 1 },
  compact: Boolean,
  mini: Boolean, // móvil en tu turno: solo jugada, % y barra
});

const result = ref(null);
const loading = ref(false);
let worker = null;
let reqId = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../lib/equity.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.id !== reqId) return;
      result.value = e.data.result;
      loading.value = false;
    };
  }
  return worker;
}

watch(
  () => [props.hole.join(), props.board.join(), props.opponents],
  () => {
    if (props.hole.length !== 2 || props.opponents < 1) {
      result.value = null;
      return;
    }
    loading.value = true;
    getWorker().postMessage({ id: ++reqId, hole: [...props.hole], board: [...props.board], opponents: props.opponents });
  },
  { immediate: true },
);
onUnmounted(() => worker?.terminate());

const current = computed(() => (props.hole.length === 2 ? describeCurrent(props.hole, props.board) : null));
const outlook = computed(() => {
  if (!result.value || props.board.length === 5) return [];
  const cur = current.value?.category ?? 0;
  return result.value.categories
    .filter((c) => c.category > cur && c.pct >= 0.5)
    .sort((a, b) => b.category - a.category)
    .slice(0, 4);
});
const tone = computed(() => {
  const eq = result.value?.equity ?? 0;
  return eq >= 60 ? 'hot' : eq >= 35 ? 'warm' : 'cold';
});
</script>

<template>
  <div class="eq" :class="[tone, { compact, mini }]">
    <div class="top">
      <div class="grow">
        <div class="lbl">Tu jugada</div>
        <div class="hand">{{ current?.name || 'Elige tus cartas' }}</div>
      </div>
      <div v-if="result" class="pct num" :class="{ loading }">
        {{ Math.round(result.equity) }}<small>%</small>
      </div>
      <div v-else-if="loading" class="spinner"></div>
    </div>
    <template v-if="result">
      <div class="bar">
        <div class="w" :style="{ width: result.win + '%' }"></div>
        <div class="t" :style="{ width: result.tie + '%' }"></div>
      </div>
      <div v-if="!mini" class="legend small">
        <span><i class="dot w"></i>Gana {{ result.win.toFixed(1) }}%</span>
        <span><i class="dot t"></i>Empata {{ result.tie.toFixed(1) }}%</span>
        <span class="faint">vs {{ opponents }} rival{{ opponents > 1 ? 'es' : '' }}</span>
      </div>
      <div v-if="outlook.length && !compact" class="outlook">
        <div v-for="o in outlook" :key="o.category" class="ol">
          <span>{{ o.name }}</span>
          <div class="ob"><div :style="{ width: Math.min(100, o.pct) + '%' }"></div></div>
          <b class="num">{{ o.pct.toFixed(0) }}%</b>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.eq {
  --tone: var(--gold);
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(5, 9, 28, 0.55);
  border: 1px solid var(--line);
  backdrop-filter: blur(8px);
  min-width: 0;
}
.eq.hot { --tone: #4ade80; }
.eq.cold { --tone: #fb7185; }
.top { display: flex; align-items: center; gap: 10px; }
.lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-3); font-weight: 700; }
.hand { font-weight: 800; font-size: 16px; line-height: 1.2; }
.pct { font-size: 30px; font-weight: 900; color: var(--tone); line-height: 1; transition: color 0.4s, opacity 0.3s; }
.pct small { font-size: 15px; margin-left: 1px; }
.pct.loading { opacity: 0.5; }
.bar { display: flex; height: 7px; border-radius: 9px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin: 10px 0 6px; }
.bar .w { background: var(--tone); transition: width 0.6s var(--ease), background 0.4s; }
.bar .t { background: rgba(255, 255, 255, 0.4); transition: width 0.6s var(--ease); }
.legend { display: flex; gap: 12px; flex-wrap: wrap; color: var(--text-2); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.dot.w { background: var(--tone); }
.dot.t { background: rgba(255, 255, 255, 0.45); }
.outlook { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.ol { display: grid; grid-template-columns: 112px 1fr 38px; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); }
.ob { height: 5px; border-radius: 9px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
.ob div { height: 100%; background: linear-gradient(90deg, var(--violet), var(--blue)); border-radius: inherit; transition: width 0.6s var(--ease); }
.ol b { text-align: right; color: var(--text); }
.compact .hand { font-size: 14px; }
.compact .pct { font-size: 24px; }
.mini { padding: 8px 12px; }
.mini .lbl { display: none; }
.mini .hand { font-size: 13.5px; }
.mini .pct { font-size: 22px; }
.mini .bar { margin: 6px 0 0; height: 5px; }
</style>
