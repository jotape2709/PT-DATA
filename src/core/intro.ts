import { reducedMotion } from './motion';

const KEY = 'cartao-intro-visto';
const TOTAL = 4300; // ms até as metades do portão começarem a abrir

/**
 * Introdução: o portão da fábrica se abre sobre o cartão. Toca uma vez por
 * sessão, pode ser pulada (botão, clique, Esc ou Enter) e é ignorada com
 * prefers-reduced-motion. Resolve quando o site já está visível.
 */
export function playIntro(): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-intro]');
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch { /* sandbox sem storage */ }
  if (!el || reducedMotion || seen || new URLSearchParams(location.search).has('nointro')) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const html = document.documentElement;
    html.style.overflow = 'hidden';
    el.classList.add('intro--on');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('intro--play')));

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      el.classList.add('intro--out');
      resolve(); // a abertura do cartão começa junto com o portão
      window.setTimeout(() => {
        el.remove();
        html.style.overflow = '';
      }, 950);
      window.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    const timer = window.setTimeout(finish, TOTAL);
    el.addEventListener('click', finish);
    window.addEventListener('keydown', onKey);
  });
}
