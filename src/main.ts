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
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle('is-here', a.getAttribute('href') === `#${e.target.id}`));
    }
  },
  { rootMargin: '-45% 0px -50% 0px' },
);
document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));

const bar = document.querySelector<HTMLElement>('[data-progress]')!;
const onScroll = () => {
  const h = document.documentElement;
  bar.style.width = `${(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100}%`;
};
document.addEventListener('scroll', onScroll, { passive: true });
onScroll();
