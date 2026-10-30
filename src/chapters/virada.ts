import type { Historico, Presidencia } from '../data/types';
import { $, dec2, esc, int, millions, pct2, signed } from '../core/format';
import { onEnter, reducedMotion } from '../core/motion';
import { showTip, hideTip } from '../core/tooltip';
import { linkList, presFacts } from './presidencia';


/** Spreads label positions so neighbours stay at least `gap` px apart. */
export function dodge(ys: number[], gap: number, lo: number, hi: number): number[] {
  const idx = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = idx.map((d) => d.y);
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let k = 1; k < out.length; k++) {
      const d = out[k] - out[k - 1];
      if (d < gap) {
        const push = (gap - d) / 2;
        out[k - 1] -= push;
        out[k] += push;
        moved = true;
      }
    }
    for (let k = 0; k < out.length; k++) out[k] = Math.min(hi, Math.max(lo, out[k]));
    if (!moved) break;
  }
  const res = new Array<number>(ys.length);
  idx.forEach((d, k) => (res[d.i] = out[k]));
  return res;
}

export function renderVirada(h: Historico) {
  const f = presFacts(h);
  const runs = f.runoffs;
  const focus = f.comebacks[f.comebacks.length - 1] ?? runs[runs.length - 1];
  const gainRankPts = [...runs].sort((a, b) => b.ganhoEntreTurnos!.pontos - a.ganhoEntreTurnos!.pontos).indexOf(focus) + 1;
  const gap1 = (focus.lider1turno?.pct ?? 0) - focus.turno1.pct;

  $('[data-h="virada"]').textContent =
    `Em ${runs.length} segundos turnos, quem liderou o primeiro venceu ${f.leaderWon}. A exceção é ${focus.ano}.`;
  $('[data-lede="virada"]').innerHTML =
    `${esc(focus.candidato)} foi de ${pct2(focus.turno1.pct)} para ${pct2(focus.turno2!.pct)} (${signed(focus.ganhoEntreTurnos!.pontos)} pontos) e virou sobre ${esc(focus.adversario.nome)}, que tinha ${pct2(focus.lider1turno!.pct)} no 1º turno. ` +
    `Não foi um ganho fora da curva: em pontos, foi o ${gainRankPts}º de ${runs.length}. Bastou porque a distância no 1º turno era de ${dec2(gap1)} ponto${gap1 >= 2 ? 's' : ''}.`;

  responsive($('[data-slope]'), (animate) => drawSlope(runs, focus, animate));
  drawLedger(runs, focus);

  $('[data-source="virada"]').innerHTML =
    `Fonte: TSE, via ${linkList(runs.map((p) => [String(p.ano), p.fonte]))}. Ganho = % do candidato do PT no 2º turno − % no 1º turno, ambos sobre votos válidos; os denominadores mudam entre turnos.`;
}

/** Draws `fn` at the container's width and redraws (without animation) when it changes. */
export function responsive(target: Element, fn: (animate: boolean) => void) {
  let last = 0;
  let first = true;
  const ro = new ResizeObserver(() => {
    const w = Math.round(target.parentElement!.clientWidth);
    if (!w || Math.abs(w - last) < 8) return;
    last = w;
    fn(first);
    first = false;
  });
  ro.observe(target.parentElement!);
}

function drawSlope(runs: Presidencia[], focus: Presidencia, animate: boolean) {
  const svg = $('[data-slope]') as unknown as SVGSVGElement;
  const W = Math.max(320, Math.min(680, svg.parentElement!.clientWidth));
  const narrow = W < 480;
  const H = narrow ? 400 : 440;
  const m = { t: 34, r: narrow ? 92 : 128, b: 26, l: narrow ? 92 : 128 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const lo = 10;
  const hi = 66;
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const x1 = m.l;
  const x2 = W - m.r;

  const parts: string[] = [];
  for (const v of [20, 30, 40, 60]) parts.push(`<line class="grid" x1="${x1}" x2="${x2}" y1="${y(v)}" y2="${y(v)}" />`);
  parts.push(`<line class="half" x1="${x1 - 10}" x2="${x2 + 10}" y1="${y(50)}" y2="${y(50)}" />`);
  parts.push(`<text class="axis-label" x="${(x1 + x2) / 2}" y="${y(50) - 7}" text-anchor="middle" style="fill:var(--ink)">linha dos 50%</text>`);
  parts.push(`<text class="axis-label" x="${x1}" y="16" text-anchor="middle">1º turno</text>`);
  parts.push(`<text class="axis-label" x="${x2}" y="16" text-anchor="middle">2º turno</text>`);

  const ordered = [...runs].sort((a, b) => (a === focus ? 1 : b === focus ? -1 : a.ano - b.ano));
  const ly1 = dodge(ordered.map((p) => y(p.turno1.pct)), 15, m.t, H - m.b);
  const ly2 = dodge(ordered.map((p) => y(p.turno2!.pct)), 15, m.t, H - m.b);

  ordered.forEach((p, i) => {
    const isF = p === focus;
    const second = p.turno1.posicao === 2;
    const cls = `${isF ? ' is-focus' : ''}${second && !isF ? ' is-second' : ''}`;
    const a = y(p.turno1.pct);
    const b = y(p.turno2!.pct);
    parts.push(`<g class="row" data-ano="${p.ano}">
      <line class="ln${cls}" x1="${x1}" y1="${a}" x2="${x2}" y2="${b}" />
      <circle class="pt${isF ? ' is-focus' : ''}" cx="${x1}" cy="${a}" r="${isF ? 5 : 3.5}" />
      <circle class="pt${isF ? ' is-focus' : ''}" cx="${x2}" cy="${b}" r="${isF ? 5 : 3.5}" />
      <text class="yr" x="${x1 - 12}" y="${ly1[i] + 4}" text-anchor="end"${isF ? ' style="fill:var(--pt);font-weight:700"' : ''}>${p.ano} · ${dec2(p.turno1.pct)}</text>
      <text class="yr" x="${x2 + 12}" y="${ly2[i] + 4}" text-anchor="start"${isF ? ' style="fill:var(--pt);font-weight:700"' : ''}>${dec2(p.turno2!.pct)} · ${p.ano}</text>
    </g>`);
  });
  svg.innerHTML = parts.join('');

  svg.querySelectorAll<SVGGElement>('g.row').forEach((g) => {
    const p = runs.find((r) => String(r.ano) === g.dataset.ano)!;
    g.addEventListener('pointermove', (e) =>
      showTip(
        `<b>${p.ano} · ${esc(p.candidato)}</b><br>${pct2(p.turno1.pct)} → ${pct2(p.turno2!.pct)} (${signed(p.ganhoEntreTurnos!.pontos)} p.p.)<br><span class="k">${p.turno1.posicao}º no 1º turno · ${p.resultado} contra ${esc(p.adversario.nome)}</span>`,
        e.clientX,
        e.clientY,
      ),
    );
    g.addEventListener('pointerleave', hideTip);
  });

  if (!reducedMotion && animate) {
    const lines = [...svg.querySelectorAll<SVGLineElement>('.ln')];
    lines.forEach((l) => {
      const len = Math.hypot(+l.getAttribute('x2')! - +l.getAttribute('x1')!, +l.getAttribute('y2')! - +l.getAttribute('y1')!);
      l.style.strokeDasharray = l.classList.contains('is-second') ? '5 4' : `${len}`;
      if (!l.classList.contains('is-second')) l.style.strokeDashoffset = `${len}`;
      else l.style.opacity = '0';
    });
    onEnter(svg, () => {
      lines.forEach((l, i) => {
        const len = Math.hypot(+l.getAttribute('x2')! - +l.getAttribute('x1')!, +l.getAttribute('y2')! - +l.getAttribute('y1')!);
        const isF = l.classList.contains('is-focus');
        const delay = isF ? lines.length * 110 + 200 : i * 110;
        if (l.classList.contains('is-second')) {
          l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay, fill: 'forwards' });
        } else {
          l.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: isF ? 900 : 600, delay, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
        }
      });
    });
  }
}

function drawLedger(runs: Presidencia[], focus: Presidencia) {
  const rows = runs
    .map((p) => {
      const g = p.ganhoEntreTurnos!;
      const mg = p.margemTurno2;
      return `<tr class="${p === focus ? 'is-focus' : ''}">
        <td>${p.ano}</td><td>${p.turno1.posicao}º · ${dec2(p.turno1.pct)}</td><td>${dec2(p.turno2!.pct)}</td>
        <td>${signed(g.pontos)}</td><td>${g.votos >= 0 ? '+' : '−'}${millions(Math.abs(g.votos))}</td>
        <td>${mg ? signed(mg.pontos) : '—'}</td>
      </tr>`;
    })
    .join('');
  $('[data-ledger]').innerHTML = `<table>
    <thead><tr><th scope="col">Ano</th><th scope="col">1º turno</th><th scope="col">2º turno</th><th scope="col">Ganho p.p.</th><th scope="col">Ganho votos</th><th scope="col">Margem final</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="ledger__note">Margem final = % do PT − % do adversário no 2º turno. Em ${focus.ano}: ${int(focus.margemTurno2!.votos)} votos.</p>`;
}
