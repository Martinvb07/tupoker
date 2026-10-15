<script setup>
import { ref, watch } from 'vue';
import QRCode from 'qrcode';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { toast } from '@/lib/store.js';
import { api } from '@/lib/api.js';
import Avatar from './Avatar.vue';

const props = defineProps({
  open: Boolean,
  code: String,
  path: { type: String, default: '/unirse/' },
  title: { type: String, default: 'Invita a la mesa' },
  subtitle: { type: String, default: 'Escanea el QR o comparte el código' },
  inviteFriends: Boolean, // muestra tu lista de amigos para avisarles
  groupId: { type: String, default: null }, // en un grupo: los amigos se añaden como miembros
  memberIds: { type: Array, default: () => [] }, // miembros actuales del grupo (no se ofrecen)
});
const emit = defineEmits(['close', 'added']);

// ---- invitar amigos (mesa: aviso con botón "Unirme"; grupo: se añaden directamente)
const friends = ref([]);
const picked = ref([]);
const sending = ref(false);
const loadingFriends = ref(false);
const friendsError = ref(false);
async function loadFriends() {
  picked.value = [];
  loadingFriends.value = true;
  friendsError.value = false;
  try {
    const list = (await api.get('/friends')).friends.map((f) => f.user);
    friends.value = props.groupId ? list.filter((u) => !props.memberIds.includes(u.id)) : list;
  } catch {
    friendsError.value = true;
  } finally {
    loadingFriends.value = false;
  }
}
// immediate: al crear una mesa el panel ya nace abierto y hay que cargar la lista igual
watch(
  () => props.open,
  (o) => o && (props.inviteFriends || props.groupId) && loadFriends(),
  { immediate: true },
);
const togglePick = (id) => (picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]);
async function sendInvites() {
  sending.value = true;
  try {
    if (props.groupId) {
      for (const id of picked.value) {
        const u = friends.value.find((f) => f.id === id);
        await api.post(`/groups/${props.groupId}/members`, { username: u.username });
      }
      toast.success(picked.value.length === 1 ? 'Amigo añadido al grupo' : `${picked.value.length} amigos añadidos al grupo`);
      emit('added');
      friends.value = friends.value.filter((f) => !picked.value.includes(f.id));
    } else {
      const { sent } = await api.post('/friends/invite', { code: props.code, userIds: picked.value });
      toast.success(sent === 1 ? 'Invitación enviada' : `${sent} invitaciones enviadas`);
    }
    picked.value = [];
  } catch (e) {
    toast.error(e.message);
  } finally {
    sending.value = false;
  }
}

const qr = ref('');
const link = ref('');
watch(
  () => [props.open, props.code],
  async () => {
    if (!props.open || !props.code) return;
    link.value = `${location.origin}${props.path}${props.code}`;
    qr.value = await QRCode.toDataURL(link.value, { margin: 1, width: 520, color: { dark: '#0b1026', light: '#ffffff' } });
  },
  { immediate: true },
);

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado');
  } catch {
    toast.error('No se pudo copiar');
  }
}
async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Únete a mi mesa de póker', text: `Código: ${props.code}`, url: link.value });
    } catch { /* cancelado */ }
  } else copy(link.value);
}
</script>

<template>
  <Sheet :open="open" :title="title" :width="420" @close="$emit('close')">
    <p class="muted center">{{ subtitle }}</p>
    <div class="qr-wrap">
      <img v-if="qr" :src="qr" alt="Código QR" class="qr" />
    </div>
    <button class="code" @click="copy(code)">
      <span v-for="(ch, i) in code" :key="i" :style="{ animationDelay: i * 60 + 'ms' }">{{ ch }}</span>
    </button>
    <div class="row">
      <button class="btn grow" @click="copy(link)"><Icon name="link" :size="18" />Copiar enlace</button>
      <button class="btn btn-primary grow" @click="share"><Icon name="share" :size="18" />Compartir</button>
    </div>

    <div v-if="inviteFriends || groupId" class="friends">
      <div class="row-between">
        <b>{{ groupId ? 'Añadir amigos al grupo' : 'Invitar amigos' }}</b>
        <RouterLink v-if="!loadingFriends && !friends.length" to="/amigos" class="small lnk" @click="$emit('close')">Agregar amigos</RouterLink>
      </div>
      <div v-if="loadingFriends" class="flist">
        <div v-for="i in 4" :key="i" class="skeleton" style="flex: 0 0 60px; height: 70px"></div>
      </div>
      <p v-else-if="friendsError" class="hint">
        No se pudo cargar tu lista de amigos. <button class="lnk" @click="loadFriends">Reintentar</button>
      </p>
      <p v-else-if="!friends.length" class="hint">
        {{ groupId ? 'Todos tus amigos ya están en el grupo.' : 'Cuando tengas amigos agregados, aquí les mandas la invitación con un toque.' }}
      </p>
      <div v-else class="flist">
        <button v-for="f in friends" :key="f.id" class="fbtn" :class="{ on: picked.includes(f.id) }" @click="togglePick(f.id)">
          <span class="fava">
            <Avatar :user="f" :size="44" />
            <i class="dot" :class="{ online: f.online }"></i>
            <i v-if="picked.includes(f.id)" class="tick"><Icon name="check" :size="12" /></i>
          </span>
          <span class="small ellipsis">{{ f.displayName }}</span>
        </button>
      </div>
      <button v-if="friends.length && !loadingFriends" class="btn btn-block" :class="{ 'btn-primary': picked.length }" :disabled="!picked.length || sending" @click="sendInvites">
        <Icon :name="groupId ? 'user-plus' : 'users'" :size="18" />{{ groupId ? 'Añadir' : 'Invitar' }}{{ picked.length ? ` (${picked.length})` : '' }}
      </button>
    </div>
  </Sheet>
</template>

<style scoped>
.center { text-align: center; }
.qr-wrap { display: grid; place-items: center; margin: 16px 0; }
.qr {
  width: min(260px, 70vw); border-radius: 22px; padding: 12px; background: #fff;
  box-shadow: 0 0 0 6px rgba(245, 181, 68, 0.25), 0 20px 50px -20px rgba(0, 0, 0, 0.8);
  animation: rise 0.5s var(--ease);
}
.friends { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; }
.lnk { color: var(--gold-2); font-weight: 700; }
.flist { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.fbtn { flex: 0 0 68px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border-radius: 14px; transition: background 0.2s; min-width: 0; }
.fbtn.on { background: rgba(245, 181, 68, 0.12); }
.fava { position: relative; }
.dot { position: absolute; right: 0; bottom: 0; width: 12px; height: 12px; border-radius: 50%; background: #475569; border: 2px solid #161f45; }
.dot.online { background: var(--green); }
.tick { position: absolute; left: -4px; top: -4px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: #2a1700; font-style: normal; }
.code { display: flex; justify-content: center; gap: 6px; margin: 0 auto 18px; width: 100%; }
.code span {
  width: 42px; height: 52px; display: grid; place-items: center; border-radius: 12px;
  background: rgba(5, 9, 28, 0.6); border: 1px solid var(--line-2); font-size: 24px; font-weight: 900; color: var(--gold-2);
  animation: rise 0.45s var(--spring) both;
}
</style>
