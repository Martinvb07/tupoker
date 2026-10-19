<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api.js';
import { toast } from '@/lib/store.js';
import SettingsForm from '@/components/SettingsForm.vue';
import Icon from '@/components/Icon.vue';

const router = useRouter();
const name = ref('');
const settings = ref({ minBet: 100, maxBet: 0, startingChips: 10000, mode: 'live', chips: [] });
const dealerPlays = ref(true);
const loading = ref(false);

async function create() {
  loading.value = true;
  try {
    const { code } = await api.post('/tables', { name: name.value, ...settings.value, dealerPlays: dealerPlays.value });
    router.push({ path: `/mesa/${code}`, query: { share: '1' } });
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page narrow">
    <div class="page-head rise">
      <div>
        <div class="eyebrow">Nueva mesa</div>
        <h1>Prepara la partida</h1>
        <p>Tú serás el dealer: eliges el modo, la mínima, la máxima y las fichas.{{ settings.mode === 'live' ? ' En vivo lo eres siempre y no juegas: repartes, pones las cartas, decides quién gana y validas las recompras; los demás apuestan desde el móvil.' : ' Luego podrás pasar el rol a otro.' }}</p>
      </div>
    </div>

    <form class="card stack rise rise-1" @submit.prevent="create">
      <label class="field">
        <span>Nombre de la mesa</span>
        <input v-model="name" class="input" maxlength="40" placeholder="Viernes de póker" />
      </label>
      <SettingsForm v-model="settings" />
      <!-- en vivo el dealer no juega: solo reparte -->
      <label v-if="settings.mode !== 'live'" class="toggle">
        <div>
          <b>Yo también juego</b>
          <div class="small muted">Si lo desactivas, solo repartes y pones las cartas.</div>
        </div>
        <input v-model="dealerPlays" type="checkbox" />
        <span class="knob"></span>
      </label>
      <button class="btn btn-primary btn-lg btn-block" :disabled="loading">
        <span v-if="loading" class="spinner"></span>
        <template v-else><Icon name="qr" :size="18" />Crear mesa y generar código</template>
      </button>
      <p class="hint center">¿Juegas siempre con los mismos? <RouterLink to="/grupos" class="lnk">Crea un grupo</RouterLink> y abre la mesa con un toque.</p>
    </form>
  </div>
</template>

<style scoped>
.narrow { max-width: 640px; }
.center { text-align: center; }
.lnk { color: var(--gold-2); font-weight: 700; }
</style>
