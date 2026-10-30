import type { Historico } from '../data/types';
import { $, esc, int, pct1 } from '../core/format';
import { onEnter } from '../core/motion';
import { showTip, hideTip } from '../core/tooltip';
import { linkList } from './presidencia';

export function renderCamara(h: Historico) {
  const c = h.camara;
  const peak = c.reduce((a, b) => (b.cadeiras > a.cadeiras ? b : a));
  const afterPeak = c.filter((x) => x.ano > peak.ano);
  const trough = afterPeak.reduce((a, b) => (b.cadeiras < a.cadeiras ? b : a));
  const first = c[0];
  const last = c[c.length - 1];
  const withPct = c.filter((x) => x.pct != null);
  const maxPct = withPct.reduce((a, b) => (b.pct! > a.pct! ? b : a));

  $('[data-h="camara"]').textContent =
    `A bancada chegou a ${peak.cadeiras} em ${peak.ano}, caiu a ${trough.cadeiras} em ${trough.ano} e voltou a ${last.cadeiras} em ${last.ano}.`;
  $('[data-lede="camara"]').innerHTML =
    `Cada ponto é um deputado federal eleito pelo PT. Em ${first.ano} eram ${first.cadeiras} de ${first.total}; em ${last.ano}, ${last.cadeiras} de ${last.total} (${pct1((last.cadeiras * 100) / last.total)} da Câmara). ` +
    `A fatia dos votos para a Câmara foi de ${pct1(first.pct!)} em ${first.ano} a ${pct1(maxPct.pct!)} no pico de ${maxPct.ano}.`;

  const tally = $('[data-tally]');
  tally.setAttribute('aria-label', c.map((x) => `${x.ano}: ${x.cadeiras} cadeiras`).join('; '));
  const maxRows = Math.ceil(peak.cadeiras / 5);
  tally.innerHTML = c
    .map((x, ci) => {
      const dots = Array.from({ length: x.cadeiras }, (_, k) => `<i style="--d:${ci * 70 + k * 7}"></i>`).join('');
      return `<div class="tally__col" data-i="${ci}" tabindex="0" aria-label="${x.ano}: ${x.cadeiras} cadeiras">
        <span class="tally__n">${x.cadeiras}</span>
        <span class="tally__pct">${x.pct != null ? pct1(x.pct) + ' dos votos' : 'votos em apuração'}</span>
        <div class="tally__dots" style="--rows:${maxRows}">${dots}</div>
        <span class="tally__year"><span class="y-full">${x.ano}</span><span class="y-short">’${String(x.ano).slice(2)}</span></span>
      </div>`;
    })
    .join('');
  onEnter(tally, () => tally.classList.add('is-in'), 0.3);

  tally.querySelectorAll<HTMLElement>('.tally__col').forEach((col) => {
    const x = c[Number(col.dataset.i)];
    const html = () =>
      `<b>${x.ano}</b> · ${x.cadeiras} de ${x.total} cadeiras (${pct1((x.cadeiras * 100) / x.total)})<br>` +
      (x.votos ? `<span class="k">${int(x.votos)} votos · ${pct1(x.pct!)} dos válidos</span>` : `<span class="k">${esc(x.nota ?? '')}</span>`);
    col.addEventListener('pointermove', (e) => showTip(html(), e.clientX, e.clientY));
    col.addEventListener('pointerleave', hideTip);
    col.addEventListener('focus', () => {
      const r = col.getBoundingClientRect();
      showTip(html(), r.left, r.top);
    });
    col.addEventListener('blur', hideTip);
  });

  const notes = c.filter((x) => x.nota).map((x) => `${x.ano}: ${x.nota}`);
  $('[data-tally-note]').textContent = notes.join(' ');
  $('[data-source="camara"]').innerHTML = `Fonte: TSE, via ${linkList(c.map((x) => [String(x.ano), x.fonte]))}.`;
}
