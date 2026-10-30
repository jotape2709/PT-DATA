export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Small deterministic tilt so stamps don't look machine-perfect. */
export function tilt(seed: number, max = 2.4): string {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return `${((x - Math.floor(x)) * 2 - 1) * max}deg`;
}

/** Stamps one element (the signature "clunk"). */
export function stamp(e: Element, delay = 0) {
  if (reducedMotion) {
    e.classList.add('is-stamped');
    return;
  }
  window.setTimeout(() => {
    e.classList.remove('is-stamped');
    void (e as HTMLElement).offsetWidth;
    e.classList.add('is-stamped');
  }, delay);
}

/** Runs `fn` once when `target` first enters the viewport. */
export function onEnter(target: Element, fn: () => void, threshold = 0.25) {
  if (!('IntersectionObserver' in window)) return fn();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          io.disconnect();
          fn();
        }
      }
    },
    { threshold, rootMargin: '0px 0px -8% 0px' },
  );
  io.observe(target);
}

/** Stamps every [data-stamp] inside `root` in sequence when it enters view. */
export function stampOnEnter(root: Element, step = 90) {
  onEnter(root, () => root.querySelectorAll('[data-stamp]').forEach((s, i) => stamp(s, i * step)));
}

export function revealAll() {
  document.querySelectorAll('.reveal').forEach((e) => onEnter(e, () => e.classList.add('is-in'), 0.1));
}
