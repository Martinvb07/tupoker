<script setup>
// Panel del jugador en la viuda:
//  - fase «viuda»: ver tus cartas o, sin verlas, llevarte las 5 del centro
//  - fase «cambios»: en tu turno, cambiar 1 carta por 1 del centro, pasar o tocar
//  - mano terminada: las manos de todos y quién gana
import { computed, ref, watch } from 'vue';
import { evaluate } from '@shared/poker.js';
import PlayingCard from './PlayingCard.vue';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';

const props = defineProps({
  hand: { type: Object, required: true },
  me: { type: Object, required: true },
  seatsById: { type: Object, required: true },
  myTurn: Boolean,
  turnLeft: { type: Number, default: 0 },
  turnPct: { type: Number, default: 0 },
  seeLeft: { type: Number, default: 0 },
  busy: Boolean,
});
const emit = defineEmits(['see', 'take', 'act']);

const nameOf = (id) => (id === props.me.userId ? 'Tú' : props.seatsById[id]?.displayName || '—');
const handName = (cards) => (cards?.length === 5 ? evaluate(cards).name : '');
const live = computed(() => props.hand.players.filter((p) => !p.folded));
const seenCount = computed(() => live.value.filter((p) => p.seen).length);
const canKnock = computed(() => !props.hand.knockBy && !(props.me.took && !props.me.turns));
// pasaron todos y salió un centro nuevo (hasta que alguien vuelva a jugar)
const newWidow = computed(() => props.hand.log?.at(-1)?.type === 'newWidow');

// cambio: una carta tuya y una del centro
const give = ref('');
const take = ref('');
watch(
  () => [props.myTurn, props.hand.widow?.join(), props.me.cards?.join()],
  () => {
    give.value = '';
    take.value = '';
  },
);
const pick = (which, c) => {
  if (!props.myTurn || props.busy) return;
  const r = which === 'give' ? give : take;
  r.value = r.value === c ? '' : c;
};
const act = (type) => emit('act', type === 'swap' ? { type, give: give.value, take: take.value } : { type });

const winners = computed(() => props.hand.result?.winners || []);
const results = computed(() =>
  [...live.value].sort((a, b) => winners.value.includes(b.userId) - winners.value.includes(a.userId)),
);
</script>

<template>
  <Transition name="vdphase" mode="out-in">
    <div :key="hand.stage" class="vd">
      <!-- 1. la viuda: ver tus cartas o llevarte las del centro sin verlas -->
      <template v-if="hand.stage === 'viuda'">
        <div class="vd-head">
          <span class="vd-label">{{ me.seen ? 'Tus cartas' : 'Tus cartas · tapadas' }}</span>
          <span v-if="seeLeft" class="vd-time num"><Icon name="timer" :size="14" />{{ seeLeft }}s</span>
        </div>
        <div class="vd-cards">
          <PlayingCard v-for="i in 5" :key="i" :card="me.seen ? me.cards[i - 1] || '' : ''" size="md" :delay="(i - 1) * 0.08" />
        </div>
        <div v-if="me.seen" class="vd-hand">{{ handName(me.cards) }}</div>
        <template v-if="!me.seen">
          <div class="vd-btns">
            <button class="btn btn-primary btn-lg grow" :disabled="busy" @click="emit('see')"><Icon name="eye" :size="18" />Ver mis cartas</button>
            <button class="btn btn-lg grow vd-take" :disabled="busy" @click="emit('take')"><Icon name="cards" :size="18" />Llevarme la viuda</button>
          </div>
          <p class="hint">Si ves tus cartas ya no podrás llevarte las del centro. Si te la llevas, tu mano queda en el centro y se destapa cuando todos hayan visto las suyas.</p>
        </template>
        <div v-else class="vd-note">
          <Icon name="timer" :size="15" />Esperando a que todos vean sus cartas · {{ seenCount }}/{{ live.length }}
        </div>
      </template>

      <!-- 2. cambios por turnos -->
      <template v-else-if="hand.stage === 'cambios'">
        <div v-if="myTurn && turnLeft" class="vd-tbar" :class="{ low: turnLeft <= 10 }">
          <i :style="{ width: turnPct + '%' }"></i>
          <span><Icon name="timer" :size="15" />Tu turno · {{ turnLeft }}s</span>
        </div>
        <template v-if="myTurn">
          <div class="vd-label rise">Centro · toca la que quieres</div>
          <div class="vd-cards rise">
            <button v-for="c in hand.widow" :key="c" class="vd-pick" :class="{ on: take === c }" @click="pick('take', c)">
              <PlayingCard :card="c" size="md" />
            </button>
          </div>
        </template>
        <div class="vd-label">
          {{ myTurn ? 'Tus cartas · toca la que das' : 'Tus cartas' }}
          <b class="vd-hname">{{ handName(me.cards) }}</b>
        </div>
        <div class="vd-cards">
          <button v-for="c in me.cards" :key="c" class="vd-pick" :class="{ on: give === c }" :disabled="!myTurn" @click="pick('give', c)">
            <PlayingCard :card="c" size="md" />
          </button>
        </div>
        <Transition name="vdpop">
          <div v-if="myTurn" class="vd-btns">
            <button v-if="give && take" class="btn btn-primary btn-lg grow" :disabled="busy" @click="act('swap')"><Icon name="repeat" :size="18" />Cambiar</button>
            <button v-else class="btn btn-lg grow" :disabled="busy" @click="act('pass')">Pasar</button>
            <button class="btn btn-lg grow vd-knock" :disabled="busy || !canKnock" @click="act('knock')"><Icon name="hand" :size="18" />Tocar</button>
          </div>
        </Transition>
        <div v-if="newWidow" class="vd-note"><Icon name="repeat" :size="15" />Pasaron todos · 5 cartas nuevas al centro</div>
        <p v-if="myTurn && me.took && !me.turns && !hand.knockBy" class="hint">Te llevaste la viuda: podrás tocar en tu siguiente turno.</p>
        <div v-if="hand.knockBy" class="vd-note knock">
          <Icon name="hand" :size="15" />{{ hand.knockBy === me.userId ? 'Tocaste' : `Tocó ${nameOf(hand.knockBy)}` }} · última vuelta
        </div>
      </template>

      <!-- 3. resultado -->
      <template v-else-if="hand.stage === 'done'">
        <div class="vd-res-title" :class="{ won: winners.includes(me.userId) }">
          <Icon name="trophy" :size="18" />
          {{ winners.includes(me.userId) ? (winners.length > 1 ? '¡Empate! Ganas con otros' : '¡Ganaste la mano!') : `Gana ${winners.map(nameOf).join(' y ')}` }}
        </div>
        <div v-for="(p, i) in results" :key="p.userId" class="vd-row rise" :class="{ win: winners.includes(p.userId) }" :style="{ animationDelay: 0.1 + i * 0.1 + 's' }">
          <Avatar :user="seatsById[p.userId] || { displayName: '—' }" :size="28" />
          <div class="grow vd-who">
            <b class="ellipsis">{{ nameOf(p.userId) }}</b>
            <span>{{ hand.handNames?.[p.userId] || handName(p.cards) }}</span>
          </div>
          <div class="vd-mini">
            <PlayingCard v-for="c in p.cards" :key="c" :card="c" size="xs" />
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
/* misma animación que el panel de apuesta: sube con rebote y sus partes entran una tras otra */
.vdphase-enter-active { animation: vd-in 0.6s var(--spring) both; }
.vdphase-leave-active { animation: vd-out 0.25s ease-in both; }
.vdphase-enter-active > * { animation: vd-item 0.55s var(--spring) both; }
.vdphase-enter-active > *:nth-child(2) { animation-delay: 0.06s; }
.vdphase-enter-active > *:nth-child(3) { animation-delay: 0.12s; }
.vdphase-enter-active > *:nth-child(4) { animation-delay: 0.18s; }
.vdphase-enter-active > *:nth-child(5) { animation-delay: 0.24s; }
.vdpop-enter-active { animation: vd-item 0.5s var(--spring) both; }
.vdpop-leave-active { animation: vd-out 0.2s ease-in both; }
@keyframes vd-in {
  from { opacity: 0; transform: translateY(60px) scale(0.95); filter: blur(6px); }
  60% { filter: blur(0); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes vd-out { to { opacity: 0; transform: translateY(40px) scale(0.96); filter: blur(4px); } }
@keyframes vd-item { from { opacity: 0; transform: translateY(24px) scale(0.92); } to { opacity: 1; transform: none; } }
.vd { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px; background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line); }
.vd-head { display: flex; align-items: center; justify-content: space-between; }
.vd-label { font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); display: flex; align-items: center; gap: 8px; }
.vd-hname { margin-left: auto; letter-spacing: 0; text-transform: none; font-size: 14px; color: var(--gold-2); }
.vd-time { display: inline-flex; align-items: center; gap: 4px; font-weight: 900; color: var(--gold-2); padding: 2px 10px; border-radius: 99px; background: rgba(245, 181, 68, 0.15); }
.vd-cards { display: flex; justify-content: center; gap: 6px; }
.vd-pick { padding: 0; border-radius: 9px; transition: transform 0.25s var(--spring), box-shadow 0.25s; }
.vd-pick:disabled { cursor: default; }
.vd-pick.on { transform: translateY(-10px); box-shadow: 0 0 0 3px var(--gold), 0 10px 22px -6px rgba(245, 181, 68, 0.6); }
.vd-hand { text-align: center; font-weight: 800; color: var(--gold-2); }
.vd-btns { display: flex; gap: 8px; }
.vd-btns .btn { height: 54px; padding: 0 12px; }
.vd-take { border-color: rgba(167, 139, 250, 0.55); background: rgba(167, 139, 250, 0.16); }
.vd-knock { border-color: rgba(244, 63, 94, 0.5); background: rgba(244, 63, 94, 0.14); color: #fecdd3; }
.vd-note { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 12px; font-size: 13.5px; font-weight: 700; color: var(--text-2); background: rgba(255, 255, 255, 0.04); }
.vd-note.knock { color: #fecdd3; background: rgba(244, 63, 94, 0.12); }
.vd-tbar { position: relative; height: 34px; border-radius: 12px; overflow: hidden; background: rgba(245, 181, 68, 0.12); border: 1px solid rgba(245, 181, 68, 0.4); }
.vd-tbar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, rgba(245, 181, 68, 0.55), rgba(245, 181, 68, 0.3)); transition: width 0.3s linear; }
.vd-tbar span { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 800; font-size: 14px; color: var(--gold-2); }
.vd-tbar.low { background: rgba(244, 63, 94, 0.14); border-color: rgba(244, 63, 94, 0.55); }
.vd-tbar.low i { background: linear-gradient(90deg, rgba(244, 63, 94, 0.6), rgba(244, 63, 94, 0.3)); }
.vd-tbar.low span { color: #fecdd3; }
.vd-res-title { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 18px; color: var(--gold-2); }
.vd-res-title.won { color: #86efac; font-size: 20px; }
.vd-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: rgba(255, 255, 255, 0.03); }
.vd-row.win { background: rgba(34, 197, 94, 0.12); box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.45); }
.vd-who { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.vd-who span { font-size: 12.5px; color: var(--text-2); }
.vd-row.win .vd-who span { color: #86efac; }
.vd-mini { display: flex; gap: 2px; }
</style>
