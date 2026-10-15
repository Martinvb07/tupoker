<script setup>
import { ref, watch } from 'vue';
import { api } from '@/lib/api.js';
import { formatChips } from '@/lib/format.js';
import Segmented from '@/components/Segmented.vue';
import RankingList from '@/components/RankingList.vue';
import Icon from '@/components/Icon.vue';

const scope = ref('users');
const metric = ref('net');
const gmetric = ref('volume');
const rows = ref(null);
const groups = ref(null);

const METRICS = [
  { value: 'net', label: 'Balance' },
  { value: 'won', label: 'Ganado' },
  { value: 'lost', label: 'Perdido' },
  { value: 'wagered', label: 'Apostado' },
  { value: 'winRate', label: '% victorias' },
  { value: 'hands', label: 'Manos' },
  { value: 'biggestPot', label: 'Mayor bote' },
];
const GMETRICS = [
  { value: 'volume', label: 'Fichas movidas' },
  { value: 'hands', label: 'Manos' },
  { value: 'players', label: 'Jugadores' },
  { value: 'biggestPot', label: 'Mayor bote' },
];

watch(
  [scope, metric, gmetric],
  async () => {
    if (scope.value === 'users') {
      rows.value = null;
      rows.value = (await api.get(`/rankings/users?sort=${metric.value}`)).ranking;
    } else {
      groups.value = null;
      groups.value = (await api.get(`/rankings/groups?sort=${gmetric.value}`)).ranking;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="page">
    <div class="page-head rise">
      <div>
        <div class="eyebrow">Clasificación general</div>
        <h1>Ranking</h1>
        <p>Todos los jugadores y grupos de la plataforma.</p>
      </div>
      <Segmented v-model="scope" :options="[{ value: 'users', label: 'Jugadores' }, { value: 'groups', label: 'Grupos' }]" />
    </div>

    <Transition name="fade" mode="out-in">
      <div v-if="scope === 'users'" key="u">
        <Segmented v-model="metric" :options="METRICS" scroll />
        <div v-if="rows === null" class="skeleton" style="height: 300px; margin-top: 20px"></div>
        <RankingList v-else :rows="rows" :metric="metric" />
      </div>
      <div v-else key="g">
        <Segmented v-model="gmetric" :options="GMETRICS" scroll />
        <div v-if="groups === null" class="skeleton" style="height: 300px; margin-top: 20px"></div>
        <div v-else-if="!groups.length" class="card empty" style="margin-top: 20px"><div class="big"><Icon name="users" :size="40" :stroke="1.6" /></div>Aún no hay grupos con manos jugadas.</div>
        <TransitionGroup v-else tag="div" name="list" class="glist">
          <div v-for="(r, i) in groups" :key="r.group.id" class="grow-row card" :style="{ '--gc': r.group.color }">
            <span class="n num" :class="'n' + (i + 1)">{{ i + 1 }}</span>
            <span class="ge"><Icon :name="r.group.emoji || 'spade'" :size="24" /></span>
            <div class="grow">
              <b class="ellipsis">{{ r.group.name }}</b>
              <div class="small faint">{{ r.players }} jugadores · {{ r.hands }} manos · {{ r.sessions }} sesiones</div>
            </div>
            <div class="right">
              <b class="num">{{ gmetric === 'hands' ? r.hands : gmetric === 'players' ? r.players : formatChips(gmetric === 'biggestPot' ? r.biggestPot : r.volume) }}</b>
              <div class="small faint">{{ GMETRICS.find((m) => m.value === gmetric).label }}</div>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.glist { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
.grow-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: radial-gradient(circle at 0% 50%, color-mix(in srgb, var(--gc) 18%, transparent), transparent 50%), var(--surface); }
.n { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; background: rgba(255, 255, 255, 0.06); flex: none; }
.n1 { background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); color: #2a1700; }
.n2 { background: linear-gradient(135deg, #f1f5f9, #94a3b8); color: #0f172a; }
.n3 { background: linear-gradient(135deg, #fdba74, #c2410c); color: #2a1100; }
.ge { font-size: 26px; }
.right { text-align: right; }
.right b { color: var(--gold-2); font-size: 17px; }
</style>
