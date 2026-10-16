<script setup>
// Chat de la mesa: mensajes en vivo, respuestas, reacciones y 5 s de espera entre mensajes.
// El estado (mensajes) lo lleva la mesa; aquí solo se pinta y se envía.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Avatar from './Avatar.vue';
import Icon from './Icon.vue';

const props = defineProps({
  messages: { type: Array, required: true },
  me: { type: String, required: true },
  reactions: { type: Array, default: () => ['👍', '😂', '🔥', '😮', '😢', '❤️'] },
  cooldownUntil: { type: Number, default: 0 }, // ms (reloj local)
  now: { type: Number, default: 0 },
  busy: Boolean,
});
const emit = defineEmits(['send', 'react']);

const MAX = 300;
const text = ref('');
const replyTo = ref(null);
const selected = ref(null); // mensaje con el menú abierto (móvil)
const list = ref(null);
const input = ref(null);
const atBottom = ref(true);
const unseen = ref(0);

const wait = computed(() => Math.max(0, Math.ceil((props.cooldownUntil - props.now) / 1000)));
const canSend = computed(() => text.value.trim().length > 0 && !wait.value && !props.busy);

// agrupar mensajes seguidos de la misma persona (en menos de 2 min)
const rows = computed(() =>
  props.messages.map((m, i) => {
    const prev = props.messages[i - 1];
    const grouped = prev && prev.userId === m.userId && m.at - prev.at < 120000 && !m.replyTo;
    return { ...m, mine: m.userId === props.me, grouped };
  }),
);
const time = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const reactionList = (m) => Object.entries(m.reactions || {}).filter(([, ids]) => ids.length);

function scrollBottom(smooth = true) {
  const el = list.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  unseen.value = 0;
}
function onScroll() {
  const el = list.value;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (atBottom.value) unseen.value = 0;
}
watch(
  () => props.messages.length,
  async (n, o) => {
    await nextTick();
    const last = props.messages[props.messages.length - 1];
    if (atBottom.value || last?.userId === props.me) scrollBottom();
    else if (n > o) unseen.value += n - o;
  },
);
onMounted(() => nextTick(() => scrollBottom(false)));

function send() {
  if (!canSend.value) return;
  emit('send', { text: text.value.trim(), replyTo: replyTo.value?.id || null });
  text.value = '';
  replyTo.value = null;
}
function reply(m) {
  replyTo.value = m;
  selected.value = null;
  nextTick(() => input.value?.focus());
}
function react(m, e) {
  emit('react', { id: m.id, emoji: e });
  selected.value = null;
}
function jumpTo(id) {
  const el = list.value?.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}
</script>

<template>
  <div class="chat">
    <div ref="list" class="list" @scroll.passive="onScroll">
      <div v-if="!messages.length" class="empty-chat">
        <Icon name="mail" :size="28" :stroke="1.6" />
        <p>Aún no hay mensajes.<br />¡Saluda a la mesa!</p>
      </div>
      <TransitionGroup name="msg">
        <div
          v-for="m in rows"
          :key="m.id"
          :data-id="m.id"
          class="msg"
          :class="{ mine: m.mine, grouped: m.grouped, open: selected === m.id }"
        >
          <div class="ava-slot">
            <Avatar v-if="!m.grouped && !m.mine" :user="{ displayName: m.name, avatarUrl: m.avatarUrl, avatarColor: m.avatarColor }" :size="28" />
          </div>
          <div class="body">
            <div v-if="!m.grouped" class="meta">
              <b>{{ m.mine ? 'Tú' : m.name }}</b><span>{{ time(m.at) }}</span>
            </div>
            <div class="bubble" @click="selected = selected === m.id ? null : m.id">
              <button v-if="m.replyTo" class="quote" @click.stop="jumpTo(m.replyTo.id)">
                <b>{{ m.replyTo.name }}</b>
                <span>{{ m.replyTo.text }}</span>
              </button>
              <span class="txt">{{ m.text }}</span>
            </div>
            <div v-if="reactionList(m).length" class="chips">
              <button
                v-for="[e, ids] in reactionList(m)"
                :key="e"
                class="rchip"
                :class="{ on: ids.includes(me) }"
                @click="react(m, e)"
              >
                {{ e }} <b>{{ ids.length }}</b>
              </button>
            </div>
            <!-- acciones: al pasar el ratón (PC) o al tocar el mensaje (móvil) -->
            <div class="tools">
              <button v-for="e in reactions" :key="e" class="tool" @click.stop="react(m, e)">{{ e }}</button>
              <button class="tool reply" title="Responder" @click.stop="reply(m)"><Icon name="undo" :size="15" /></button>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <Transition name="pop">
      <button v-if="unseen" class="new-pill" @click="scrollBottom()">{{ unseen }} nuevo{{ unseen > 1 ? 's' : '' }} ↓</button>
    </Transition>

    <form class="composer" @submit.prevent="send">
      <Transition name="fade">
        <div v-if="replyTo" class="replying">
          <Icon name="undo" :size="14" />
          <div class="grow ellipsis">Respondiendo a <b>{{ replyTo.userId === me ? 'ti' : replyTo.name }}</b>: {{ replyTo.text }}</div>
          <button type="button" class="x" aria-label="Cancelar respuesta" @click="replyTo = null"><Icon name="x" :size="14" /></button>
        </div>
      </Transition>
      <div class="row-in">
        <input
          ref="input"
          v-model="text"
          class="input"
          :maxlength="MAX"
          :placeholder="wait ? `Espera ${wait} s…` : 'Escribe un mensaje'"
          enterkeyhint="send"
          autocomplete="off"
        />
        <button class="send" :class="{ cooling: wait }" :disabled="!canSend" aria-label="Enviar">
          <svg v-if="wait" class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" :style="{ strokeDashoffset: 100 - (wait / 5) * 100 }" /></svg>
          <span v-if="wait" class="num">{{ wait }}</span>
          <Icon v-else name="right" :size="20" :stroke="2.6" />
        </button>
      </div>
      <div v-if="text.length > MAX - 40" class="count">{{ text.length }}/{{ MAX }}</div>
    </form>
  </div>
</template>

<style scoped>
.chat { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 4px 6px; display: flex; flex-direction: column; gap: 2px; }
.empty-chat { margin: auto; text-align: center; color: var(--text-3); display: grid; justify-items: center; gap: 8px; font-weight: 600; }
.msg { display: flex; gap: 8px; align-items: flex-end; padding: 2px 4px; margin-top: 8px; border-radius: 12px; transition: background 0.6s; }
.msg.grouped { margin-top: 0; }
.msg.mine { flex-direction: row-reverse; }
.msg.flash { background: rgba(245, 181, 68, 0.15); }
.ava-slot { width: 28px; flex: none; }
.mine .ava-slot { display: none; }
.body { position: relative; display: flex; flex-direction: column; align-items: flex-start; max-width: 78%; min-width: 0; }
.mine .body { align-items: flex-end; }
.meta { display: flex; gap: 6px; align-items: baseline; font-size: 11.5px; margin: 0 6px 2px; }
.meta b { color: var(--text-2); }
.meta span { color: var(--text-3); }
.bubble {
  padding: 7px 11px; border-radius: 16px 16px 16px 6px; background: var(--surface-2); border: 1px solid var(--line);
  font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; cursor: pointer; user-select: text;
}
.mine .bubble { border-radius: 16px 16px 6px 16px; background: linear-gradient(180deg, rgba(245, 181, 68, 0.25), rgba(245, 181, 68, 0.14)); border-color: rgba(245, 181, 68, 0.35); }
.quote {
  display: flex; flex-direction: column; text-align: left; width: 100%; margin-bottom: 5px; padding: 4px 8px; border-radius: 8px;
  background: rgba(0, 0, 0, 0.25); border-left: 3px solid var(--gold); font-size: 12px; color: var(--text-2);
}
.quote b { color: var(--gold-2); font-size: 11.5px; }
.quote span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.rchip { display: inline-flex; align-items: center; gap: 3px; height: 24px; padding: 0 7px; border-radius: 99px; font-size: 13px; background: rgba(255, 255, 255, 0.07); border: 1px solid var(--line); transition: transform 0.2s var(--spring); }
.rchip b { font-size: 11.5px; color: var(--text-2); }
.rchip.on { background: rgba(245, 181, 68, 0.18); border-color: rgba(245, 181, 68, 0.5); }
.rchip:active { transform: scale(0.9); }
.tools {
  display: flex; gap: 2px; padding: 3px; margin-top: 4px; border-radius: 99px; background: rgba(14, 20, 48, 0.96); border: 1px solid var(--line-2);
  box-shadow: var(--shadow); opacity: 0; max-height: 0; overflow: hidden; pointer-events: none;
  transition: opacity 0.2s, max-height 0.25s var(--ease);
}
.msg.open .tools { opacity: 1; max-height: 50px; pointer-events: auto; }
@media (hover: hover) {
  .msg:hover .tools { opacity: 1; max-height: 50px; pointer-events: auto; }
}
.tool { width: 30px; height: 30px; border-radius: 50%; font-size: 17px; display: grid; place-items: center; transition: transform 0.2s var(--spring), background 0.2s; }
.tool:hover { background: rgba(255, 255, 255, 0.1); transform: scale(1.15); }
.tool.reply { color: var(--text-2); }
.new-pill {
  position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); z-index: 5; padding: 6px 14px; border-radius: 99px;
  background: var(--gold); color: #2a1700; font-weight: 800; font-size: 13px; box-shadow: var(--shadow);
}
.composer { padding-top: 8px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
.replying { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: rgba(245, 181, 68, 0.1); color: var(--text-2); font-size: 12.5px; }
.replying svg { color: var(--gold-2); flex: none; }
.x { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; color: var(--text-2); flex: none; }
.row-in { display: flex; gap: 8px; }
.row-in .input { height: 44px; border-radius: 22px; font-size: 15px; }
.send {
  position: relative; width: 44px; height: 44px; flex: none; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(180deg, var(--gold-2), var(--gold)); color: #2a1700; transition: transform 0.2s var(--spring), opacity 0.2s;
}
.send:disabled { opacity: 0.45; }
.send.cooling { opacity: 1; background: var(--surface-3); color: var(--text); }
.send:active:not(:disabled) { transform: scale(0.9); }
.send .num { font-weight: 900; font-size: 15px; }
.ring { position: absolute; inset: 0; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: var(--gold); stroke-width: 3; stroke-dasharray: 100; transition: stroke-dashoffset 0.3s linear; }
.count { font-size: 11px; color: var(--text-3); text-align: right; }
.msg-enter-active { transition: transform 0.35s var(--spring), opacity 0.25s; }
.msg-enter-from { opacity: 0; transform: translateY(10px) scale(0.97); }
</style>
