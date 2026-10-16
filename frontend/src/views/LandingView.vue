<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import Brand from '@/components/Brand.vue';
import Icon from '@/components/Icon.vue';
import PlayingCard from '@/components/PlayingCard.vue';
import Chip from '@/components/Chip.vue';
import { MODES } from '@/lib/format.js';

// mini mesa animada del hero: el board se destapa en bucle
const BOARD = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
const shown = ref(0);
let timer;
onMounted(() => {
  const step = () => {
    shown.value = shown.value >= 5 ? 0 : shown.value + 1;
    timer = setTimeout(step, shown.value === 0 ? 900 : shown.value === 5 ? 2600 : shown.value < 3 ? 380 : 1100);
  };
  timer = setTimeout(step, 700);
});
onUnmounted(() => clearTimeout(timer));

const FEATURES = [
  { icon: 'coins', title: 'Fichas como en el casino', text: 'El dealer fija mínima, máxima y valores. Apuestas eligiendo fichas en un abanico y apilándolas.' },
  { icon: 'chart', title: 'Probabilidades en vivo', text: 'Tu jugada actual y tu % de ganar, calculados al momento con cada carta que sale.' },
  { icon: 'users', title: 'Grupos con mesa guardada', text: 'Tu gente de siempre, su configuración y su ranking. Abres la mesa con un toque.' },
  { icon: 'trophy', title: 'Rankings', text: 'Quién gana, quién pierde, cuánto se ha apostado y el bote más grande. Por grupo y general.' },
  { icon: 'qr', title: 'Entrar con QR', text: 'Comparte el código o el QR y cada uno entra desde su móvil en segundos.' },
  { icon: 'handshake', title: 'Amigos', text: 'Mira quién está conectado o jugando, invítalos a tu mesa y únete a la suya.' },
];
const FAQ = [
  { q: '¿TuPoker es gratis?', a: 'Sí. Creas tu cuenta, montas la mesa y juegas con tus amigos sin pagar nada.' },
  { q: '¿Necesito descargar una aplicación?', a: 'No. TuPoker funciona en el navegador del móvil y del ordenador, y puedes añadirla a la pantalla de inicio como una app.' },
  { q: '¿Puedo jugar con mi baraja de siempre?', a: 'Sí. En el modo en vivo usáis cartas físicas y la app lleva las fichas, los turnos y los botes. También hay un modo en el que la app reparte las cartas.' },
  { q: '¿Cuántos jugadores caben en una mesa?', a: 'Hasta 10 jugadores por mesa. Tus amigos entran escaneando un código QR o escribiendo un código de 6 letras.' },
];
const STEPS = [
  { icon: 'plus', title: 'Crea la mesa', text: 'Elige el modo, las ciegas y las fichas iniciales.' },
  { icon: 'qr', title: 'Tus amigos entran', text: 'Escanean el QR o escriben el código de 6 letras.' },
  { icon: 'spade', title: 'A jugar', text: 'Turnos, botes y ganadores: la app lleva la cuenta por vosotros.' },
];
</script>

<template>
  <div class="landing">
    <header class="lhead">
      <Brand :size="40" />
      <nav class="row">
        <RouterLink to="/entrar" class="btn btn-ghost btn-sm">Entrar</RouterLink>
        <RouterLink to="/registro" class="btn btn-primary btn-sm">Crear cuenta</RouterLink>
      </nav>
    </header>

    <!-- hero -->
    <section class="hero">
      <div class="copy rise">
        <span class="pill"><Icon name="sparkles" :size="14" />Gratis para jugar con amigos</span>
        <h1>El póker con tus amigos, <span class="gold">sin contar fichas.</span></h1>
        <p>TuPoker lleva las fichas, los turnos, los botes y el ranking. Juega con tu baraja de siempre o deja que la app reparta las cartas.</p>
        <div class="row ctas">
          <RouterLink to="/registro" class="btn btn-primary btn-lg"><Icon name="play" :size="18" />Empezar ahora</RouterLink>
          <RouterLink to="/entrar" class="btn btn-lg">Ya tengo cuenta</RouterLink>
        </div>
        <div class="trust small muted">
          <span><Icon name="check" :size="15" />Sin descargas</span>
          <span><Icon name="check" :size="15" />Móvil y ordenador</span>
          <span><Icon name="check" :size="15" />Hasta 10 jugadores</span>
        </div>
      </div>

      <div class="visual rise rise-2" aria-hidden="true">
        <div class="mini-felt">
          <div class="mini-pot"><span class="dotc"></span>Bote 48K</div>
          <div class="mini-board">
            <PlayingCard v-for="(c, i) in BOARD" :key="i" :card="i < shown ? c : ''" :placeholder="i >= shown" size="md"><span></span></PlayingCard>
          </div>
          <div class="mini-status" :class="{ win: shown === 5 }">{{ shown === 5 ? 'Escalera real · ¡Gana Martín!' : 'Turno de Ana · 32s' }}</div>
        </div>
        <div class="float f1"><Chip :value="5000" :index="0" :size="74" /></div>
        <div class="float f2"><Chip :value="25000" :index="1" :size="58" /></div>
        <div class="float f3"><Chip :value="1000000" :index="5" :size="50" /></div>
        <div class="eq-card">
          <div class="small faint">Tu jugada</div>
          <b>{{ shown >= 3 ? 'Proyecto de escalera real' : 'A-K del mismo palo' }}</b>
          <div class="eq-bar"><div :style="{ width: (shown >= 3 ? 78 : 64) + '%' }"></div></div>
          <span class="eq-pct num">{{ shown >= 3 ? 78 : 64 }}%</span>
        </div>
      </div>
    </section>

    <!-- modos -->
    <section class="sec">
      <div class="sec-head">
        <div class="eyebrow">3 formas de jugar</div>
        <h2>Elige cómo es tu partida</h2>
      </div>
      <div class="modes">
        <div v-for="(m, i) in MODES" :key="m.value" class="card hover mode rise" :style="{ animationDelay: i * 80 + 'ms' }">
          <span class="micon"><Icon :name="m.icon" :size="26" /></span>
          <h3>{{ m.label }}</h3>
          <p class="muted">{{ m.desc }}</p>
        </div>
      </div>
    </section>

    <!-- funcionalidades -->
    <section class="sec">
      <div class="sec-head">
        <div class="eyebrow">Todo lo que necesitas</div>
        <h2>Pensado para la mesa de los viernes</h2>
      </div>
      <div class="features">
        <div v-for="f in FEATURES" :key="f.title" class="feat">
          <span class="ficon"><Icon :name="f.icon" :size="22" /></span>
          <div>
            <h3>{{ f.title }}</h3>
            <p class="muted">{{ f.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- cómo funciona -->
    <section class="sec">
      <div class="sec-head">
        <div class="eyebrow">En un minuto</div>
        <h2>Cómo funciona</h2>
      </div>
      <div class="steps">
        <div v-for="(s, i) in STEPS" :key="s.title" class="step">
          <span class="snum">{{ i + 1 }}</span>
          <Icon :name="s.icon" :size="24" class="sicon" />
          <h3>{{ s.title }}</h3>
          <p class="muted">{{ s.text }}</p>
        </div>
      </div>
    </section>

    <!-- preguntas frecuentes (las mismas que los datos estructurados de index.html) -->
    <section class="sec" aria-labelledby="faq-title">
      <div class="sec-head">
        <div class="eyebrow">Dudas</div>
        <h2 id="faq-title">Preguntas frecuentes</h2>
      </div>
      <div class="faq">
        <details v-for="q in FAQ" :key="q.q" class="qa">
          <summary>{{ q.q }}<Icon name="plus" :size="18" class="qi" /></summary>
          <p class="muted">{{ q.a }}</p>
        </details>
      </div>
    </section>

    <section class="final card">
      <h2>¿Montamos la mesa?</h2>
      <p class="muted">Crea tu cuenta en 10 segundos y comparte el QR con tus amigos.</p>
      <RouterLink to="/registro" class="btn btn-primary btn-lg"><Icon name="spade" :size="18" />Crear cuenta gratis</RouterLink>
    </section>

    <footer class="lfoot">
      <Brand :size="26" />
      <span class="small faint">© {{ new Date().getFullYear() }} TuPoker · Juega con responsabilidad</span>
    </footer>
  </div>
</template>

<style scoped>
.landing { max-width: 1180px; margin: 0 auto; padding: 0 18px 30px; overflow-x: hidden; }
.lhead { display: flex; align-items: center; justify-content: space-between; padding: calc(16px + env(safe-area-inset-top, 0px)) 0 10px; gap: 10px; }
.lhead nav { gap: 6px; }

.hero { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; padding: 36px 0 30px; }
@media (min-width: 960px) { .hero { grid-template-columns: 1.05fr 1fr; padding: 70px 0 60px; } }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; font-size: 13px; font-weight: 700; color: var(--gold-2); background: rgba(245, 181, 68, 0.1); border: 1px solid rgba(245, 181, 68, 0.3); }
.hero h1 { font-size: clamp(38px, 6.4vw, 66px); font-weight: 900; letter-spacing: -0.035em; line-height: 1.02; margin: 18px 0 16px; }
.gold { background: linear-gradient(180deg, var(--gold-2), var(--gold) 55%, var(--gold-deep)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero p { font-size: 18px; color: var(--text-2); max-width: 520px; }
.ctas { margin-top: 26px; flex-wrap: wrap; }
.trust { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 20px; }
.trust span { display: inline-flex; align-items: center; gap: 6px; }
.trust svg { color: var(--green); }

.visual { position: relative; height: 360px; display: grid; place-items: center; }
.mini-felt {
  width: min(460px, 92%); aspect-ratio: 1.6; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: radial-gradient(ellipse at 50% 40%, #2a8f62, var(--felt-a) 35%, var(--felt-b));
  box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.5), 0 0 0 10px #1a1206, 0 0 0 12px #3b2a12, 0 40px 80px -20px rgba(0, 0, 0, 0.9);
  transform: perspective(900px) rotateX(18deg);
}
.mini-pot { display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 5px; border-radius: 99px; background: rgba(0, 0, 0, 0.45); font-weight: 800; font-size: 14px; }
.dotc { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle, var(--gold-2) 35%, var(--gold) 36% 60%, #fff 61% 68%, var(--gold) 69%); }
.mini-board { display: flex; gap: 5px; }
.mini-board :deep(.pcard.md) { --w: 46px; }
.mini-board :deep(.phc) { border-color: rgba(255, 255, 255, 0.15); background: rgba(0, 0, 0, 0.12); }
.mini-status { font-size: 13px; font-weight: 800; padding: 4px 12px; border-radius: 99px; background: var(--gold); color: #2a1700; transition: background 0.4s; }
.mini-status.win { background: linear-gradient(90deg, #4ade80, #22c55e); color: #052e16; }
.float { position: absolute; animation: floaty 6s ease-in-out infinite; }
.f1 { left: 2%; top: 6%; }
.f2 { right: 4%; top: 0; animation-delay: 1s; }
.f3 { right: 12%; bottom: 4%; animation-delay: 2s; }
@keyframes floaty { 50% { transform: translateY(-14px) rotate(8deg); } }
.eq-card {
  position: absolute; left: 0; bottom: 6%; width: 210px; padding: 12px 14px; border-radius: 16px;
  background: rgba(22, 31, 69, 0.92); border: 1px solid var(--line-2); box-shadow: var(--shadow-lg); backdrop-filter: blur(8px);
  animation: floaty 7s ease-in-out infinite 0.5s;
}
.eq-card b { display: block; font-size: 14px; margin: 2px 0 8px; }
.eq-bar { height: 6px; border-radius: 9px; background: rgba(255, 255, 255, 0.1); overflow: hidden; margin-right: 46px; }
.eq-bar div { height: 100%; background: #4ade80; transition: width 0.8s var(--ease); }
.eq-pct { position: absolute; right: 14px; bottom: 9px; font-weight: 900; font-size: 20px; color: #4ade80; }

.sec { padding: 46px 0 10px; }
.sec-head { text-align: center; margin-bottom: 26px; }
.sec-head h2 { font-size: clamp(26px, 4vw, 38px); font-weight: 900; margin-top: 8px; letter-spacing: -0.02em; }
.modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.mode h3 { font-size: 19px; font-weight: 800; margin: 14px 0 6px; }
.micon, .ficon {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: #2a1700;
  background: linear-gradient(135deg, var(--gold-2), var(--gold-deep)); box-shadow: 0 10px 24px -10px rgba(245, 181, 68, 0.8);
}
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.feat { display: flex; gap: 14px; padding: 18px; border-radius: 18px; background: rgba(22, 31, 69, 0.55); border: 1px solid var(--line); transition: border-color 0.25s, transform 0.3s var(--ease); }
.feat:hover { border-color: var(--line-2); transform: translateY(-2px); }
.ficon { width: 44px; height: 44px; border-radius: 14px; flex: none; background: rgba(245, 181, 68, 0.12); color: var(--gold-2); box-shadow: none; border: 1px solid rgba(245, 181, 68, 0.25); }
.feat h3 { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.step { position: relative; padding: 22px; border-radius: 20px; background: rgba(22, 31, 69, 0.55); border: 1px solid var(--line); }
.snum { position: absolute; right: 18px; top: 10px; font-size: 54px; font-weight: 900; color: rgba(255, 255, 255, 0.06); line-height: 1; }
.sicon { color: var(--gold-2); }
.step h3 { font-size: 17px; font-weight: 800; margin: 12px 0 4px; }
.faq { display: flex; flex-direction: column; gap: 10px; max-width: 760px; margin: 0 auto; }
.qa { border-radius: 16px; background: rgba(22, 31, 69, 0.55); border: 1px solid var(--line); transition: border-color 0.25s; }
.qa[open] { border-color: rgba(245, 181, 68, 0.35); }
.qa summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; font-weight: 700; font-size: 16px; }
.qa summary::-webkit-details-marker { display: none; }
.qa .qi { color: var(--gold-2); transition: transform 0.3s var(--spring); flex: none; }
.qa[open] .qi { transform: rotate(45deg); }
.qa p { padding: 0 18px 16px; animation: rise 0.35s var(--ease); }
.final {
  margin-top: 50px; text-align: center; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;
  background: radial-gradient(ellipse at 50% 0%, rgba(245, 181, 68, 0.2), transparent 65%), var(--surface);
}
.final h2 { font-size: clamp(26px, 4vw, 36px); font-weight: 900; }
.lfoot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 30px 0 calc(10px + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 520px) {
  .visual { height: 300px; }
  .eq-card { width: 180px; }
  .lhead :deep(.word) { font-size: 18px !important; }
}
</style>
