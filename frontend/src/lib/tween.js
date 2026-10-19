import { onUnmounted, ref, watch } from 'vue';

/** Número que se anima hasta su nuevo valor (fichas que suben o bajan). */
export function useTween(source, ms = 700) {
  const out = ref(Number(source.value) || 0);
  let raf = 0;
  watch(source, (to) => {
    cancelAnimationFrame(raf);
    const from = out.value;
    const target = Number(to) || 0;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      out.value = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  onUnmounted(() => cancelAnimationFrame(raf));
  return out;
}
