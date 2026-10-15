<script setup>
// El dealer confirma quién gana cada bote (se preseleccionan los ganadores calculados).
import { computed, ref, watch } from 'vue';
import Sheet from './Sheet.vue';
import Avatar from './Avatar.vue';
import PlayingCard from './PlayingCard.vue';
import Icon from './Icon.vue';
import { formatChips } from '@/lib/format.js';

const props = defineProps({ open: Boolean, state: Object, busy: Boolean });
const emit = defineEmits(['close', 'resolve']);

const sel = ref([]);
const hand = computed(() => props.state.hand);
watch(
  () => [props.open, hand.value?.pots],
  () => {
    if (props.open && hand.value?.pots) sel.value = hand.value.pots.map((p) => [...p.suggested]);
  },
  { immediate: true },
);

const seat = (id) => props.state.seats.find((s) => s.userId === id) || { displayName: '—' };
const player = (id) => hand.value.players.find((p) => p.userId === id);
function toggle(i, id) {
  const arr = sel.value[i];
  const k = arr.indexOf(id);
  if (k >= 0) arr.splice(k, 1);
  else arr.push(id);
}
const ready = computed(() => sel.value.length && sel.value.every((a) => a.length));
</script>

<template>
  <Sheet :open="open" title="Showdown" :width="560" @close="emit('close')">
    <div class="board">
      <PlayingCard v-for="c in hand.board" :key="c" :card="c" size="sm" />
    </div>
    <div v-for="(pot, i) in hand.pots" :key="i" class="pot">
      <div class="row-between head">
        <b>{{ hand.pots.length > 1 ? (i === 0 ? 'Bote principal' : `Bote lateral ${i}`) : 'Bote' }}</b>
        <span class="amt num">{{ formatChips(pot.amount) }}</span>
      </div>
      <p v-if="!pot.complete && pot.eligible.length > 1" class="hint">Algunos jugadores no registraron sus cartas: elige el ganador viendo la mesa.</p>
      <button
        v-for="id in pot.eligible"
        :key="id"
        class="cand"
        :class="{ on: sel[i]?.includes(id) }"
        @click="toggle(i, id)"
      >
        <Avatar :user="seat(id)" :size="38" />
        <div class="grow info">
          <div class="nm ellipsis">{{ seat(id).displayName }}</div>
          <div class="hn small">{{ hand.handNames[id] || 'Cartas no registradas' }}</div>
        </div>
        <div class="cards">
          <PlayingCard v-for="(c, k) in player(id)?.cards?.length ? player(id).cards : ['', '']" :key="k" :card="c" size="xs" />
        </div>
        <span class="tick"><Icon name="check" :size="16" /></span>
      </button>
      <p v-if="sel[i]?.length > 1" class="hint">Se repartirá a partes iguales ({{ formatChips(Math.floor(pot.amount / sel[i].length)) }} cada uno).</p>
    </div>
    <template #footer>
      <button class="btn btn-success btn-lg btn-block" :disabled="!ready || busy" @click="emit('resolve', sel)">
        <span v-if="busy" class="spinner"></span>
        <template v-else><Icon name="trophy" :size="18" />Entregar fichas</template>
      </button>
    </template>
  </Sheet>
</template>

<style scoped>
.board { display: flex; gap: 5px; justify-content: center; margin-bottom: 16px; }
.pot { padding: 14px; border-radius: 18px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
.amt { font-weight: 900; color: var(--gold-2); font-size: 18px; }
.cand {
  display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; text-align: left;
  border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); transition: all 0.25s var(--ease);
}
.cand.on { border-color: rgba(34, 197, 94, 0.6); background: rgba(34, 197, 94, 0.1); }
.info { min-width: 0; }
.nm { font-weight: 700; }
.hn { color: var(--text-2); }
.cand.on .hn { color: #bbf7d0; }
.cards { display: flex; gap: 2px; }
.tick { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--line-2); color: transparent; transition: all 0.25s var(--spring); }
.cand.on .tick { background: var(--green); border-color: var(--green); color: #052e16; transform: scale(1.1); }
</style>
