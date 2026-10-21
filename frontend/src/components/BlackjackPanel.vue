<script setup>
// Panel del jugador en el blackjack:
//  - apuestas: casillas de Par, Apuesta y 21+3 con el abanico de fichas
//  - tu turno: pedir, plantarse, doblar o dividir
//  - ronda terminada: cuánto ganas o pierdes
import { computed } from 'vue';
import { totalLabel, sideInfo } from '@shared/blackjack.js';
import { formatChips } from '@/lib/format.js';
import BlackjackBetPad from './BlackjackBetPad.vue';
import Icon from './Icon.vue';

const props = defineProps({
  hand: { type: Object, required: true },
  me: { type: Object, required: true }, // tu jugador en la ronda
  opts: { type: Object, default: null }, // qué puedes hacer (solo en tu turno)
  chips: { type: Array, required: true },
  settings: { type: Object, required: true },
  last: { type: Object, default: null },
  final: Boolean,
  busy: Boolean,
  compact: Boolean,
  turnLeft: { type: Number, default: 0 },
  turnPct: { type: Number, default: 0 },
  betLeft: { type: Number, default: 0 },
  betPct: { type: Number, default: 0 },
  toActName: { type: String, default: '' },
});
const emit = defineEmits(['bet', 'act']);

const cur = computed(() => props.me.hands?.[props.opts?.hand ?? props.me.cur] || null);
const net = computed(() => props.hand.result?.net?.[props.me.userId] ?? 0);
const sides = computed(() => ['pair', 't21'].map((k) => props.me.side?.[k] && { key: k, ...props.me.side[k] }).filter(Boolean));
const sideLabel = (s) => (s.key === 'pair' ? 'Par' : '21+3');
</script>

<template>
  <Transition name="bjphase" mode="out-in">
    <div :key="hand.stage + (me.ready ? 'r' : '') + (opts ? 't' : '') + (final ? 'f' : '')" class="bjp">
      <!-- 1. apuestas -->
      <template v-if="hand.stage === 'bets' && !me.ready && !me.out">
        <div class="tbar" :class="{ low: betLeft <= 5 }">
          <i :style="{ width: betPct + '%' }"></i>
          <span><Icon name="coins" :size="15" />Haz tu apuesta{{ betLeft ? ` · ${betLeft}s` : '' }}</span>
        </div>
        <BlackjackBetPad
          :chips="chips"
          :min="settings.minBet"
          :max="settings.maxBet"
          :stack="me.stack"
          :last="last"
          :busy="busy"
          :compact="compact"
          @confirm="(b) => emit('bet', b)"
        />
      </template>
      <div v-else-if="hand.stage === 'bets' && me.ready" class="note ok">
        <Icon name="check" :size="17" />Apuesta hecha: <b class="num">{{ formatChips(me.total) }}</b> · esperando al resto{{ betLeft ? ` (${betLeft}s)` : '' }}
      </div>
      <div v-else-if="me.out" class="note">Esta ronda no juegas · apuesta en la siguiente</div>

      <!-- 2. tu turno -->
      <template v-else-if="opts && cur">
        <div class="tbar" :class="{ low: turnLeft <= 10 }">
          <i :style="{ width: turnPct + '%' }"></i>
          <span><Icon name="timer" :size="15" />Tu turno{{ me.hands.length > 1 ? ` · mano ${opts.hand + 1} de ${me.hands.length}` : '' }}{{ turnLeft ? ` · ${turnLeft}s` : '' }}</span>
        </div>
        <div class="mytot">
          <span class="lbl">Tienes</span>
          <b class="num">{{ totalLabel(cur.cards, cur.split) }}</b>
          <span class="lbl">contra el {{ hand.dealer[0]?.[0] === 'T' ? '10' : hand.dealer[0]?.[0] }} de la banca</span>
        </div>
        <div class="acts">
          <button class="act hit" :disabled="busy" @click="emit('act', 'hit')"><Icon name="plus" :size="20" />Pedir</button>
          <button class="act stand" :disabled="busy" @click="emit('act', 'stand')"><Icon name="hand" :size="20" />Plantarse</button>
          <button class="act double" :disabled="busy || !opts.canDouble" @click="emit('act', 'double')">
            <b>x2</b>Doblar<small v-if="opts.canDouble" class="num">+{{ formatChips(opts.bet) }}</small>
          </button>
          <button class="act split" :disabled="busy || !opts.canSplit" @click="emit('act', 'split')">
            <Icon name="split" :size="20" />Dividir<small v-if="opts.canSplit" class="num">+{{ formatChips(opts.bet) }}</small>
          </button>
        </div>
      </template>

      <!-- 3. esperando -->
      <div v-else-if="hand.stage === 'play'" class="note">
        <Icon name="timer" :size="16" />{{ toActName ? `Juega ${toActName}` : 'Repartiendo…' }}
      </div>
      <div v-else-if="!final" class="note"><Icon name="dealer" :size="16" />La banca destapa sus cartas…</div>

      <!-- 4. resultado -->
      <div v-else-if="hand.result?.how === 'settled'" class="result" :class="{ won: net > 0, lost: net < 0 }">
        <div class="r-title">
          <Icon :name="net > 0 ? 'trophy' : net < 0 ? 'x' : 'handshake'" :size="20" />
          {{ net > 0 ? `¡Ganas ${formatChips(net)}!` : net < 0 ? `Pierdes ${formatChips(-net)}` : 'Recuperas tu apuesta' }}
        </div>
        <div v-if="sides.length" class="r-sides">
          <span v-for="s in sides" :key="s.key" :class="{ ok: s.win }">
            {{ sideLabel(s) }}: {{ s.kind ? `${sideInfo(s.kind).label} +${formatChips(s.win - s.bet)}` : `sin premio (−${formatChips(s.bet)})` }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bjp { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.tbar { position: relative; height: 34px; border-radius: 12px; overflow: hidden; background: rgba(245, 181, 68, 0.12); border: 1px solid rgba(245, 181, 68, 0.4); }
.tbar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, rgba(245, 181, 68, 0.55), rgba(245, 181, 68, 0.3)); transition: width 0.3s linear; }
.tbar span { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 800; font-size: 14px; color: var(--gold-2); }
.tbar.low { background: rgba(244, 63, 94, 0.14); border-color: rgba(244, 63, 94, 0.55); }
.tbar.low i { background: linear-gradient(90deg, rgba(244, 63, 94, 0.6), rgba(244, 63, 94, 0.3)); }
.tbar.low span { color: #fecdd3; }
.note {
  display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; padding: 12px; border-radius: 14px; text-align: center;
  font-weight: 700; color: var(--text-2); background: rgba(5, 9, 28, 0.45); border: 1px solid var(--line);
}
.note.ok { color: #86efac; background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.35); }
.note b { color: #fff; }
.mytot { display: flex; align-items: baseline; justify-content: center; gap: 8px; flex-wrap: wrap; }
.mytot b { font-size: 30px; font-weight: 900; color: var(--gold-2); line-height: 1; }
.mytot .lbl { font-size: 13px; font-weight: 700; color: var(--text-3); }
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.act {
  height: 56px; border-radius: 16px; font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--line-2); background: var(--surface-2); transition: transform 0.15s var(--ease), opacity 0.2s;
}
.act small { font-size: 12px; font-weight: 800; opacity: 0.8; }
.act b { font-weight: 900; }
.act:active:not(:disabled) { transform: scale(0.95); }
.act:disabled { opacity: 0.35; }
.act.hit { background: linear-gradient(180deg, var(--gold-2), var(--gold) 45%, var(--gold-deep)); color: #2a1700; border-color: transparent; box-shadow: 0 10px 26px -12px rgba(245, 181, 68, 0.8); }
.act.stand { background: rgba(244, 63, 94, 0.14); border-color: rgba(244, 63, 94, 0.4); color: #fecdd3; }
.act.double { background: rgba(96, 165, 250, 0.14); border-color: rgba(96, 165, 250, 0.4); color: #dbeafe; }
.act.split { background: rgba(167, 139, 250, 0.14); border-color: rgba(167, 139, 250, 0.45); color: #ede9fe; }
.result { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 18px; background: rgba(5, 9, 28, 0.5); border: 1px solid var(--line-2); }
.result.won { background: radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.25), transparent 65%), rgba(5, 9, 28, 0.5); border-color: rgba(34, 197, 94, 0.5); }
.result.lost { border-color: rgba(244, 63, 94, 0.4); }
.r-title { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 19px; font-weight: 900; color: var(--gold-2); }
.won .r-title { color: #86efac; }
.lost .r-title { color: #fecdd3; }
.r-sides { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 13px; font-weight: 700; color: var(--text-3); }
.r-sides .ok { color: #86efac; }
.bjphase-enter-active { transition: opacity 0.3s, transform 0.4s var(--spring); }
.bjphase-leave-active { transition: opacity 0.15s; }
.bjphase-enter-from { opacity: 0; transform: translateY(20px); }
.bjphase-leave-to { opacity: 0; }
</style>
