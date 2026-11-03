import './styles/main.css';
import { DATA } from './data/load';
import { renderPresidencia } from './chapters/presidencia';
import { renderCamara } from './chapters/camara';
import { renderVirada } from './chapters/virada';
import { renderMapa } from './chapters/mapa';
import { renderPlenario, type PlenarioState } from './chapters/plenario';
import { initLab } from './chapters/lab';
import { renderMetodo } from './chapters/metodo';
import { fitIrtAsync } from './engine/irt-client';
import { computeCohesion } from './engine/cohesion';
import { stampOnEnter } from './core/motion';
import { playIntro } from './core/intro';

document.documentElement.classList.add('js');

const { historico, listas, plenario } = DATA;

// The IRT model runs off the main thread while the first chapters render.
const ptIdx = computeCohesion(plenario).ptIdx;
const irt = fitIrtAsync(plenario.votes.map((v) => v.ballots), plenario.deputies.length, ptIdx);

const chapters: [string, () => void][] = [
  ['presidência', () => renderPresidencia(historico)],
  ['câmara', () => renderCamara(historico)],
  ['virada', () => renderVirada(historico)],
  ['mapa', () => renderMapa(listas, historico)],
];
let plenState: PlenarioState | null = null;
chapters.push(['plenário', () => (plenState = renderPlenario(plenario, irt))]);
chapters.push(['laboratório', () => initLab(DATA, () => plenState!)]);
chapters.push(['método', () => renderMetodo(DATA)]);

for (const [name, fn] of chapters) {
  try {
    fn();
  } catch (err) {
    console.error(`Falha ao montar ${name}`, err);
  }
}

// Abertura: a cunha vermelha corta o cartão, a estrela gira e os campos são carimbados.
const head = document.querySelector<HTMLElement>('.head')!;
playIntro().then(() => {
  requestAnimationFrame(() => {
    head.classList.add('is-in');
    head.querySelector('[data-wedge]')!.classList.add('is-in');
  });
  stampOnEnter(head);
});

// Navigation: highlight the section in view and fill the progress bar.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.bar__nav a')];
const barEl = document.querySelector<HTMLElement>('[data-bar]')!;
const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]')!;
const here = document.querySelector<HTMLElement>('[data-here]')!;
let scrim: HTMLElement | null = null;
const setOpen = (open: boolean) => {
  barEl.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (open && !scrim) {
    scrim = document.createElement('div');
    scrim.className = 'bar__scrim';
    scrim.addEventListener('click', () => setOpen(false));
    document.body.appendChild(scrim);
  } else if (!open && scrim) {
    scrim.remove();
    scrim = null;
  }
};
toggle.addEventListener('click', () => setOpen(!barEl.classList.contains('is-open')));
links.forEach((a) => a.addEventListener('click', () => setOpen(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && barEl.classList.contains('is-open')) {
    setOpen(false);
    toggle.focus();
  }
});
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => {
        const on = a.getAttribute('href') === `#${e.target.id}`;
        a.classList.toggle('is-here', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
        if (on) here.textContent = a.querySelector('.bar__lbl')?.textContent ?? 'Seções';
      });
    }
  },
  { rootMargin: '-45% 0px -50% 0px' },
);
// No topo da página, antes da primeira seção, o botão diz "Seções".
window.addEventListener('scroll', () => {
  if (window.scrollY < 200) here.textContent = 'Seções';
}, { passive: true });
document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));

const bar = document.querySelector<HTMLElement>('[data-progress]')!;
const onScroll = () => {
  const h = document.documentElement;
  bar.style.width = `${(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100}%`;
};
document.addEventListener('scroll', onScroll, { passive: true });
onScroll();
