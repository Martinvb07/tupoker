<script setup>
// Iconos de la app (Lucide). Si el nombre no es un icono conocido se pinta tal cual:
// así los grupos antiguos que guardaron un emoji siguen viéndose.
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  stroke: { type: [Number, String], default: 2 },
});


const comp = computed(() => ICONS[props.name] || null);
</script>

<script>
import {
  House, Spade, Heart, Diamond, Club, Users, Trophy, User, UserPlus, UserCheck, Plus, QrCode, Share2, Copy,
  Undo2, RotateCw, Repeat, Trash2, Menu, Settings, LogOut, Check, X, ChevronLeft, ChevronRight, Camera, Crown,
  Coins, Link, DoorOpen, Play, Pencil, Layers, Pause, ChartLine, KeyRound, Image, Shuffle, Dices, Coffee, Hand,
  TriangleAlert, Ban, Inbox, ScrollText, Medal, Flame, Gem, Beer, Rocket, Star, Zap, Target, Swords, Ghost,
  Gamepad2, HandCoins, Sparkles, Timer, Eye, PartyPopper, Handshake, Mail, Radio, Wallet,
} from 'lucide-vue-next';

export const ICONS = {
  home: House, spade: Spade, heart: Heart, diamond: Diamond, club: Club, users: Users, trophy: Trophy, user: User,
  'user-plus': UserPlus, 'user-check': UserCheck, plus: Plus, qr: QrCode, share: Share2, copy: Copy, undo: Undo2,
  rotate: RotateCw, repeat: Repeat, trash: Trash2, menu: Menu, settings: Settings, logout: LogOut, check: Check, x: X,
  left: ChevronLeft, right: ChevronRight, camera: Camera, crown: Crown, coins: Coins, link: Link, door: DoorOpen,
  play: Play, edit: Pencil, cards: Layers, pause: Pause, chart: ChartLine, key: KeyRound, image: Image,
  dealer: Shuffle, dice: Dices, coffee: Coffee, hand: Hand, alert: TriangleAlert, ban: Ban, inbox: Inbox,
  scroll: ScrollText, medal: Medal, flame: Flame, gem: Gem, beer: Beer, rocket: Rocket, star: Star, zap: Zap,
  target: Target, swords: Swords, ghost: Ghost, gamepad: Gamepad2, 'hand-coins': HandCoins, sparkles: Sparkles,
  timer: Timer, eye: Eye, party: PartyPopper, handshake: Handshake, mail: Mail, live: Radio, wallet: Wallet,
};

// iconos que se pueden elegir para un grupo
export const GROUP_ICONS = ['spade', 'heart', 'diamond', 'club', 'crown', 'flame', 'gem', 'beer', 'rocket', 'star', 'zap', 'target', 'swords', 'ghost', 'dice', 'trophy'];
</script>

<template>
  <component :is="comp" v-if="comp" :size="Number(size)" :stroke-width="Number(stroke)" aria-hidden="true" class="ico" />
  <span v-else class="ico-text" :style="{ fontSize: Number(size) * 0.9 + 'px' }">{{ name }}</span>
</template>

<style scoped>
.ico { flex: none; }
.ico-text { line-height: 1; display: inline-grid; place-items: center; }
</style>
