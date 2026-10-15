<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Sheet from './Sheet.vue';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';
import Segmented from './Segmented.vue';
import SettingsForm from './SettingsForm.vue';
import { formatChips, formatSigned } from '@/lib/format.js';

const props = defineProps({ open: Boolean, state: Object, run: Function });
const emit = defineEmits(['close']);
const router = useRouter();

const tab = ref('players');
const tabs = computed(() => [
  { value: 'players', label: 'Jugadores' },
  ...(props.state.isDealer ? [{ value: 'settings', label: 'Ajustes' }] : []),
  { value: 'me', label: 'Yo' },
]);
const expanded = ref(null);
const chipAmount = ref(0);
const settings = ref({ ...props.state.settings });
const name = ref(props.state.name);
watch(() => props.open, (o) => {
  if (o) {
    settings.value = { ...props.state.settings };
    name.value = props.state.name;
    chipAmount.value = props.state.settings.startingChips;
  }
});

const canAssignDealer = computed(() => props.state.isDealer || props.state.isOwner);
const live = computed(() => props.state.hand && props.state.hand.stage !== 'done');
const mySeat = computed(() => props.state.seats.find((s) => s.userId === props.state.me));

async function act(event, payload, msg) {
  const ok = await props.run(event, payload);
  if (ok && msg) expanded.value = null;
  return ok;
}
async function saveSettings() {
  if (await props.run('dealer:settings', { settings: settings.value, name: name.value })) emit('close');
}
function kick(s) {
  if (confirm(`¿Expulsar a ${s.displayName}?`)) act("dealer:kick", { userId: s.userId }, true);
}
async function leave() {
  if (!confirm('¿Seguro que quieres salir de la mesa?')) return;
  if (await props.run('table:leave')) router.push('/');
}
async function closeTable() {
  if (!confirm('¿Cerrar la mesa para todos? Las estadísticas ya jugadas se guardan.')) return;
  if (await props.run('dealer:close')) router.push('/');
}
</script>

<template>
  <Sheet :open="open" title="Mesa" :width="560" @close="emit('close')">
    <Segmented v-model="tab" :options="tabs" class="tabs" />

    <Transition name="fade" mode="out-in">
      <div v-if="tab === 'players'" key="p" class="list">
        <div v-for="s in state.seats" :key="s.userId" class="pl" :class="{ open: expanded === s.userId }">
          <button class="pl-row" @click="expanded = expanded === s.userId ? null : s.userId">
            <Avatar :user="s" :size="40" />
            <div class="grow">
              <div class="row nm">
                <span class="ellipsis">{{ s.displayName }}</span>
                <span v-if="s.userId === state.dealerId" class="badge badge-gold">🎩 Dealer</span>
                <span v-if="s.status === 'sitout'" class="badge">Fuera</span>
                <span v-if="!s.online" class="badge">Offline</span>
              </div>
              <div class="small muted num">
                {{ formatChips(s.chips) }} fichas ·
                <span :class="s.chips - s.buyIn >= 0 ? 'pos' : 'neg'">{{ formatSigned(s.chips - s.buyIn, formatChips) }}</span>
              </div>
            </div>
            <Icon v-if="state.isDealer || canAssignDealer" name="right" :size="18" class="chev" />
          </button>
          <Transition name="fade">
            <div v-if="expanded === s.userId && (state.isDealer || canAssignDealer)" class="pl-actions">
              <template v-if="state.isDealer">
                <div class="row">
                  <input v-model.number="chipAmount" class="input num" type="number" min="1" style="height: 42px" />
                  <button class="btn btn-sm" @click="act('dealer:chips', { userId: s.userId, amount: chipAmount }, true)">+ Recompra</button>
                  <button class="btn btn-sm btn-ghost" @click="act('dealer:chips', { userId: s.userId, amount: chipAmount, mode: 'set' }, true)">Fijar</button>
                </div>
                <div class="row wrap">
                  <button class="btn btn-sm" @click="act('dealer:seat', { userId: s.userId, status: s.status === 'sitout' ? 'active' : 'sitout' }, true)">
                    {{ s.status === 'sitout' ? 'Sentar' : 'Levantar' }}
                  </button>
                  <button v-if="s.userId !== state.dealerId && canAssignDealer" class="btn btn-sm" @click="act('table:setDealer', { userId: s.userId }, true)">🎩 Hacer dealer</button>
                  <button v-if="s.userId !== state.me" class="btn btn-sm btn-danger" @click="kick(s)">Expulsar</button>
                </div>
              </template>
              <button v-else-if="s.userId !== state.dealerId" class="btn btn-sm" @click="act('table:setDealer', { userId: s.userId }, true)">🎩 Hacer dealer</button>
            </div>
          </Transition>
        </div>
        <p class="hint">El dealer reparte, pone las cartas comunes y decide los ganadores. El creador de la mesa o el dealer actual pueden pasar el rol.</p>
      </div>

      <div v-else-if="tab === 'settings'" key="s" class="stack">
        <label class="field">
          <span>Nombre de la mesa</span>
          <input v-model="name" class="input" maxlength="40" />
        </label>
        <SettingsForm v-model="settings" />
        <p v-if="live" class="hint">Podrás guardar los cambios cuando termine la mano actual.</p>
        <button class="btn btn-primary btn-block" :disabled="live" @click="saveSettings">Guardar ajustes</button>
        <div class="divider"></div>
        <button class="btn btn-danger btn-block" @click="closeTable"><Icon name="x" :size="18" />Cerrar la mesa</button>
      </div>

      <div v-else key="m" class="stack">
        <div v-if="mySeat" class="card mystats">
          <div class="row-between"><span class="muted">Mis fichas</span><b class="num">{{ formatChips(mySeat.chips) }}</b></div>
          <div class="row-between"><span class="muted">Recompras / entrada</span><b class="num">{{ formatChips(mySeat.buyIn) }}</b></div>
          <div class="row-between">
            <span class="muted">Balance en la mesa</span>
            <b class="num" :class="mySeat.chips - mySeat.buyIn >= 0 ? 'pos' : 'neg'">{{ formatSigned(mySeat.chips - mySeat.buyIn, formatChips) }}</b>
          </div>
        </div>
        <button v-if="mySeat" class="btn btn-block" @click="run('table:sitout', { sitout: mySeat.status !== 'sitout' })">
          <Icon :name="mySeat.status === 'sitout' ? 'play' : 'pause'" :size="18" />
          {{ mySeat.status === 'sitout' ? 'Volver a jugar' : 'Ausentarme (no jugar las próximas manos)' }}
        </button>
        <button class="btn btn-danger btn-block" @click="leave"><Icon name="logout" :size="18" />Salir de la mesa</button>
      </div>
    </Transition>
  </Sheet>
</template>

<style scoped>
.tabs { margin-bottom: 16px; width: 100%; }
.tabs :deep(button) { flex: 1; }
.list { display: flex; flex-direction: column; gap: 8px; }
.pl { border-radius: 16px; background: rgba(5, 9, 28, 0.4); border: 1px solid var(--line); overflow: hidden; transition: border-color 0.25s; }
.pl.open { border-color: var(--line-2); }
.pl-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; text-align: left; }
.nm { font-weight: 700; gap: 6px; min-width: 0; }
.chev { color: var(--text-3); transition: transform 0.3s var(--ease); }
.pl.open .chev { transform: rotate(90deg); }
.pl-actions { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.wrap { flex-wrap: wrap; }
.mystats { display: flex; flex-direction: column; gap: 8px; }
</style>
