import type { Historico, Presidencia } from '../data/types';
import { $, esc, int, pct2 } from '../core/format';
import { reducedMotion, stamp, tilt } from '../core/motion';

export type PresFacts = {
  n: number;
  top2: number;
  wins: number;
  runoffs: Presidencia[];
  leaderWon: number;
  comebacks: Presidencia[];
  maxVotes: Presidencia;
  maxPct: Presidencia;
};

export function presFacts(h: Historico): PresFacts {
  const p = h.presidencia;
  const runoffs = p.filter((x) => x.turno2);
  const leaderWon = runoffs.filter((x) => (x.turno1.posicao === 1) === (x.resultado === 'vitória')).length;
  const comebacks = runoffs.filter((x) => x.turno1.posicao === 2 && x.resultado === 'vitória');
  const best = (f: (x: Presidencia) => number) => p.reduce((a, b) => (f(b) > f(a) ? b : a));
  return {
    n: p.length,
    top2: p.filter((x) => x.turno1.posicao <= 2).length,
    wins: p.filter((x) => x.resultado === 'vitória').length,
    runoffs,
    leaderWon,
    comebacks,
    maxVotes: best((x) => x.turno2?.votos ?? x.turno1.votos),
    maxPct: best((x) => (x.resultado === 'vitória' ? (x.turno2?.pct ?? x.turno1.pct) : 0)),
  };
}

const bar = (pct: number, win: boolean) =>
  `<div class="log__bar" aria-hidden="true"><span class="${win ? 'is-pt-win' : ''}" style="width:${pct}%"></span></div>`;

function row(p: Presidencia, i: number): string {
  const t1 = p.turno1;
  const t2 = p.turno2;
  const win = p.resultado === 'vitória';
  const comeback = t1.posicao === 2 && win;
  const opp = p.adversario;
  const who = t2 ? `vs. ${esc(opp.nome)} (${esc(opp.partido)})` : p.lider1turno ? `${esc(p.lider1turno.nome)} eleito no 1º turno` : '';
  return `
  <div class="log__row${comeback ? ' is-highlight' : ''}" role="row">
    <div class="log__year" role="rowheader">${p.ano}</div>
    <div class="log__cell" role="cell">
      <div class="log__num"><span class="stamp" data-stamp style="--rot:${tilt(i * 3 + 1)}">${pct2(t1.pct).replace('%', '')}</span><span class="log__pos">${t1.posicao}º lugar</span></div>
      ${bar(t1.pct, false)}
    </div>
    <div class="log__cell" role="cell">
      ${
        t2
          ? `<div class="log__num"><span class="stamp${win ? ' stamp--pt' : ''}" data-stamp style="--rot:${tilt(i * 3 + 2)}">${pct2(t2.pct).replace('%', '')}</span></div>${bar(t2.pct, win)}`
          : `<span class="log__empty">sem 2º turno</span>`
      }
    </div>
    <div class="log__obs" role="cell">
      <span><strong>${esc(p.candidato)}</strong></span>
      <span class="badge ${comeback ? 'badge--virada' : win ? 'badge--win' : 'badge--loss'}" data-stamp style="--rot:${tilt(i * 7 + 5, 4)}">${win ? (comeback ? 'virada' : 'eleito') : 'não eleito'}</span>
      <span class="who">${who}</span>
    </div>
  </div>`;
}

export function renderPresidencia(h: Historico) {
  const f = presFacts(h);
  const log = $('[data-log]');
  log.innerHTML =
    `<div class="log__row log__row--head" role="row">
      <div role="columnheader" class="label">Ano</div>
      <div role="columnheader" class="label">1º turno · %</div>
      <div role="columnheader" class="label">2º turno · %</div>
      <div role="columnheader" class="label log__obs">Observação</div>
    </div>` + h.presidencia.map(row).join('');

  const last = h.presidencia[h.presidencia.length - 1];
  const thesis = $('[data-thesis]');
  const allTop2 = f.top2 === f.n;
  $('.thesis__title', thesis).textContent = allTop2
    ? `Em ${f.n} eleições presidenciais, o PT nunca ficou fora dos dois primeiros.`
    : `Em ${f.n} eleições presidenciais, o PT ficou entre os dois primeiros ${f.top2} vezes.`;
  const cb = f.comebacks[0];
  $('.thesis__lede', thesis).innerHTML = cb
    ? `Venceu ${f.wins}. Em ${cb.ano}, ${esc(cb.candidato)} saiu do 1º turno em segundo lugar, com ${pct2(cb.turno1.pct)}, e venceu o 2º com ${pct2(cb.turno2!.pct)}: a única virada em ${f.runoffs.length} segundos turnos desde 1989.`
    : `Venceu ${f.wins}.`;

  const maxV = f.maxVotes.turno2 ?? f.maxVotes.turno1;
  const stats: [string, string, boolean][] = [
    [`${f.wins}/${f.n}`, 'eleições vencidas', false],
    [int(maxV.votos), `votos em ${f.maxVotes.ano}, a maior votação da série`, true],
    [pct2(f.maxPct.turno2?.pct ?? f.maxPct.turno1.pct), `maior fatia dos votos válidos (${f.maxPct.ano})`, false],
    [`${f.leaderWon}/${f.runoffs.length}`, `segundos turnos vencidos por quem liderou o 1º; a exceção é ${last.ano}`, false],
  ];
  $('[data-thesis-stats]').innerHTML = stats
    .map(([v, t, red], i) => `<div class="stat"><span class="stamp${red ? ' stamp--pt' : ''}" data-stamp style="--rot:${tilt(40 + i)}">${v}</span><p>${t}</p></div>`)
    .join('');

  const run = (offset: number) => {
    const rows = [...log.querySelectorAll<HTMLElement>('.log__row:not(.log__row--head)')];
    rows.forEach((r, i) => {
      r.querySelectorAll('[data-stamp]').forEach((s, k) => stamp(s, offset + i * 150 + k * 70));
      r.querySelectorAll<HTMLElement>('.log__bar span').forEach((b) => {
        if (reducedMotion) return;
        b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 420, delay: offset + i * 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      });
    });
    thesis.querySelectorAll('[data-stamp]').forEach((s, i) => stamp(s, offset + rows.length * 150 + 200 + i * 120));
  };
  run(reducedMotion ? 0 : 900);
  $('[data-replay]').addEventListener('click', () => run(0));

  $('[data-source="presidencia"]').innerHTML =
    `Fonte: TSE, totais consultados em ${linkList(h.presidencia.map((p) => [String(p.ano), p.fonte]))}. Percentuais sobre votos válidos; totais podem variar algumas centenas de votos entre a divulgação e retotalizações.`;
}

export function linkList(items: [string, string][]): string {
  const seen = new Map<string, string[]>();
  for (const [label, url] of items) {
    if (!seen.has(url)) seen.set(url, []);
    seen.get(url)!.push(label);
  }
  return [...seen].map(([url, labels]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${labels.join(', ')}</a>`).join(' · ');
}
