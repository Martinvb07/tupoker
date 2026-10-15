<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { toast } from '@/lib/store.js';
import { formatChips, modeInfo } from '@/lib/format.js';
import { chipDenominations } from '@shared/poker.js';
import Avatar from '@/components/Avatar.vue';
import Chip from '@/components/Chip.vue';
import Icon from '@/components/Icon.vue';

const route = useRoute();
const router = useRouter();
const code = computed(() => String(route.params.code).toUpperCase());
const table = ref(null);
const error = ref('');
const loading = ref(false);

onMounted(async () => {
  try {
    const r = await api.get(`/tables/${code.value}`);
    table.value = r.table;
    if (r.table.seated && r.table.status !== 'closed') router.replace(`/mesa/${code.value}`);
  } catch (e) {
    error.value = e.message;
  }
});

const chips = computed(() => {
  const st = table.value?.settings;
  if (!st || st.mode === 'offline') return [];
  return st.chips?.length ? st.chips : chipDenominations(st.minBet, st.maxBet, st.startingChips);
});
const mode = computed(() => modeInfo(table.value?.settings.mode));

async function join() {
  loading.value = true;
  try {
    await api.post(`/tables/${code.value}/join`);
    router.replace(`/mesa/${code.value}`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page narrow">
    <div v-if="error" class="card empty rise">
      <div class="big">🚫</div>
      <h2>{{ error }}</h2>
      <RouterLink to="/" class="btn" style="margin-top: 16px">Volver al inicio</RouterLink>
    </div>
    <div v-else-if="!table" class="skeleton" style="height: 320px"></div>
    <div v-else class="card invite rise">
      <div class="eyebrow">Te invitan a</div>
      <h1>{{ table.name }}</h1>
      <div class="code num">{{ table.code }}</div>

      <div class="faces">
        <TransitionGroup name="list">
          <div v-for="(s, i) in table.seats" :key="i" class="face" :style="{ animationDelay: i * 60 + 'ms' }">
            <Avatar :user="s" :size="52" ring />
            <span class="small ellipsis">{{ s.displayName }}</span>
          </div>
        </TransitionGroup>
      </div>

      <div class="facts">
        <div class="wide"><span>Modo</span><b>{{ mode.icon }} {{ mode.label }}</b><small class="muted">{{ mode.desc }}</small></div>
        <template v-if="table.settings.mode !== 'offline'">
          <div><span>Ciegas</span><b class="num">{{ formatChips(Math.max(1, Math.floor(table.settings.minBet / 2))) }} / {{ formatChips(table.settings.minBet) }}</b></div>
          <div><span>Máxima</span><b class="num">{{ table.settings.maxBet ? formatChips(table.settings.maxBet) : 'Sin límite' }}</b></div>
          <div><span>Fichas iniciales</span><b class="num">{{ formatChips(table.settings.startingChips) }}</b></div>
        </template>
        <div v-if="table.dealer"><span>Dealer</span><b class="row" style="gap: 6px"><Avatar :user="table.dealer" :size="22" />{{ table.dealer.displayName }}</b></div>
      </div>

      <div class="chips">
        <Chip v-for="(v, i) in chips" :key="v" :value="v" :index="i" :size="40" class="rise" :style="{ animationDelay: i * 50 + 'ms' }" />
      </div>

      <button v-if="table.status !== 'closed'" class="btn btn-primary btn-lg btn-block" :disabled="loading" @click="join">
        <span v-if="loading" class="spinner"></span>
        <template v-else><Icon name="spade" :size="18" />Sentarme en la mesa</template>
      </button>
      <p v-else class="muted">Esta mesa ya está cerrada.</p>
    </div>
  </div>
</template>

<style scoped>
.narrow { max-width: 520px; }
.invite { text-align: center; padding: 28px 20px; background: radial-gradient(ellipse at 50% 0%, rgba(34, 197, 94, 0.18), transparent 60%), var(--surface); }
.invite h1 { font-size: 30px; font-weight: 900; margin-top: 6px; }
.code { display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 10px; letter-spacing: 0.3em; font-weight: 900; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); }
.faces { display: flex; justify-content: center; flex-wrap: wrap; gap: 14px; margin: 24px 0; }
.face { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; animation: rise 0.5s var(--spring) both; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: left; margin-bottom: 18px; }
.facts div { padding: 10px 12px; border-radius: 12px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.facts span { font-size: 12px; color: var(--text-3); font-weight: 600; }
.facts .wide { grid-column: 1 / -1; }
.chips { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-bottom: 22px; }
</style>
