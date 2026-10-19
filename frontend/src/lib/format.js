export { formatChips } from '@shared/poker.js';

export function formatSigned(n, fmt) {
  const v = Number(n) || 0;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
}

export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export const STAGE_LABEL = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  done: 'Mano terminada',
};

export const ACTION_LABEL = {
  fold: 'Se retira',
  check: 'Pasa',
  call: 'Iguala',
  bet: 'Apuesta',
  raise: 'Sube',
  allin: 'All-in',
  sb: 'Ciega peq.',
  bb: 'Ciega gr.',
  // la viuda
  pass: 'Pasa',
  swap: 'Cambió 1',
  widow: 'Se llevó la viuda',
  knock: 'Tocó',
};

export const MODES = [
  { value: 'live', icon: 'hand', label: 'En vivo', short: 'En vivo', desc: 'Cartas físicas y fichas. El dealer pone el board y cada uno registra sus cartas.' },
  { value: 'random', icon: 'dice', label: 'Aleatorio', short: 'Aleatorio', desc: 'Con fichas. La app baraja y reparte las cartas y el board.' },
  { value: 'viuda', icon: 'cards', label: 'Viuda', short: 'Viuda', desc: 'Sin fichas. 5 cartas a cada uno y 5 en el centro: cambia, pasa o toca. Gana la mejor mano.' },
];
// las mesas y grupos antiguos «sin dinero» juegan a la viuda
export const normMode = (m) => (m === 'offline' ? 'viuda' : m);
export const noChips = (m) => normMode(m) === 'viuda';
export const modeInfo = (m) => MODES.find((x) => x.value === normMode(m)) || MODES[0];

export const CHIP_COLORS = [
  { base: '#f59e0b', edge: '#fde68a', text: '#fff' },
  { base: '#dc2626', edge: '#fecaca', text: '#fff' },
  { base: '#e2611f', edge: '#fed7aa', text: '#fff' },
  { base: '#16a34a', edge: '#bbf7d0', text: '#fff' },
  { base: '#1f2433', edge: '#9ca3af', text: '#e5e7eb' },
  { base: '#2563eb', edge: '#bfdbfe', text: '#fff' },
  { base: '#c026d3', edge: '#f5d0fe', text: '#fff' },
  { base: '#a16207', edge: '#fde68a', text: '#fff' },
];
