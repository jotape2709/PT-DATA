import { scaleSequential, scaleSequentialLog } from 'd3-scale';
import type { Historico, Listas2026 } from '../data/types';
import { $, UF_NOME, esc, int, listLabel, pct1, pct2 } from '../core/format';
import { stamp, stampOnEnter, tilt } from '../core/motion';
import { allocate, margins } from '../engine/seats';

/** Tile cartogram: [column, row] for each UF. */
export const TILE: Record<string, [number, number]> = {
  RR: [2, 0], AP: [3, 0],
  AM: [1, 1], PA: [2, 1], MA: [3, 1], CE: [4, 1], RN: [5, 1],
  AC: [0, 2], RO: [1, 2], TO: [2, 2], PI: [3, 2], PE: [4, 2], PB: [5, 2],
  MT: [1, 3], GO: [2, 3], BA: [3, 3], SE: [4, 3], AL: [5, 3],
  MS: [1, 4], DF: [2, 4], MG: [3, 4], ES: [4, 4],
  PR: [1, 5], SP: [2, 5], RJ: [3, 5],
  SC: [1, 6],
  RS: [1, 7],
};

type Metric = 'share' | 'seats' | 'next';
type UFRow = { uf: string; votes: number; valid: number; share: number; seats: number; total: number; toNext: number | null; cushion: number };

const RED = (t: number) => {
  // papel → vermelho → vermelho profundo
  const stops = [
    [231, 220, 197], // papel
    [236, 160, 140],
    [200, 22, 29],   // vermelho
    [106, 8, 12],    // vermelho profundo
  ];
  const s = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
  const k = Math.floor(s);
  const u = s - k;
  const c = stops[k].map((v, i) => Math.round(v + (stops[k + 1][i] - v) * u));
  return `rgb(${c.join(',')})`;
};

export function mapRows(l: Listas2026): UFRow[] {
  return Object.entries(l.ufs).map(([uf, v]) => {
    const valid = Object.values(v.listas).reduce((a, b) => a + b, 0);
    const votes = v.listas[l.alvo] ?? 0;
    const total = l.cadeirasPorUF[uf];
    const m = margins(v.listas, total, l.alvo);
    return { uf, votes, valid, share: votes / valid, seats: m.current, total, toNext: m.toNext, cushion: m.cushion };
  });
}

export function renderMapa(l: Listas2026, h: Historico) {
  const rows = mapRows(l);
  const byUF = new Map(rows.map((r) => [r.uf, r]));
  const sumVotes = rows.reduce((a, r) => a + r.votes, 0);
  const sumValid = rows.reduce((a, r) => a + r.valid, 0);
  const sumSeats = rows.reduce((a, r) => a + r.seats, 0);
  const close = rows.filter((r) => r.toNext != null && r.toNext < 40000).sort((a, b) => a.toNext! - b.toNext!);
  const fed = h.federacao2026;

  $('[data-h="mapa"]').textContent = `Em ${close.length} UFs, menos de 40 mil votos separaram a federação de mais uma cadeira.`;
  $('[data-lede="mapa"]').innerHTML =
    `A Federação PT/PCdoB/PV somou ${int(sumVotes)} votos para deputado federal (${pct2((sumVotes * 100) / sumValid)} dos válidos). ` +
    `Pela regra de distribuição modelada aqui, isso rende ${sumSeats} cadeiras; o resultado oficial foi ${fed.cadeirasReais}, das quais ${fed.ptCadeiras} do PT. ` +
    `Escolha uma UF para ver a conta.`;

  const tiles = $('[data-tiles]');
  tiles.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
  tiles.innerHTML = Object.entries(TILE)
    .map(
      ([uf, [c, r]]) =>
        `<button type="button" class="tile" data-uf="${uf}" aria-pressed="false" style="grid-column:${c + 1};grid-row:${r + 1}" aria-label="${UF_NOME[uf]}">
          <span class="tile__uf">${uf}</span><span class="tile__v"></span>
        </button>`,
    )
    .join('');

  let metric: Metric = 'share';
  let selected = close[0]?.uf ?? 'SP';

  const shareScale = scaleSequential(RED).domain([0, Math.max(...rows.map((r) => r.share))]);
  const seatScale = scaleSequential(RED).domain([0, 1]);
  const nextVals = rows.filter((r) => r.toNext != null).map((r) => r.toNext!);
  const nextScale = scaleSequentialLog((t: number) => RED(1 - t)).domain([Math.min(...nextVals), Math.max(...nextVals)]);

  const fmtNext = (n: number | null) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n < 10000 ? 1 : 0 })} mil` : int(n));

  function paint() {
    tiles.querySelectorAll<HTMLButtonElement>('.tile').forEach((t) => {
      const r = byUF.get(t.dataset.uf!)!;
      let fill = '';
      let txt = '';
      let tval = 0;
      if (metric === 'share') {
        fill = shareScale(r.share);
        txt = pct1(r.share * 100);
        tval = r.share / shareScale.domain()[1];
      } else if (metric === 'seats') {
        fill = seatScale(r.seats / r.total);
        txt = `${r.seats}/${r.total}`;
        tval = r.seats / r.total;
      } else {
        fill = r.toNext == null ? 'var(--card-2)' : nextScale(r.toNext);
        txt = fmtNext(r.toNext);
        tval = r.toNext == null ? 0 : 1 - Math.log(r.toNext / nextScale.domain()[0]) / Math.log(nextScale.domain()[1] / nextScale.domain()[0]);
      }
      t.style.backgroundColor = fill;
      t.classList.toggle('is-dark', tval > 0.48);
      t.querySelector('.tile__v')!.textContent = txt;
      t.setAttribute('aria-pressed', String(t.dataset.uf === selected));
      t.setAttribute('aria-label', `${UF_NOME[r.uf]}: ${txt}`);
    });
    const leg = $('[data-map-legend]');
    const ramp = `<span class="ramp">${Array.from({ length: 8 }, (_, i) => `<i style="background:${RED(i / 7)}"></i>`).join('')}</span>`;
    if (metric === 'share') leg.innerHTML = `<span>0%${ramp}${pct1(shareScale.domain()[1] * 100)} dos votos válidos da UF</span>`;
    else if (metric === 'seats') leg.innerHTML = `<span>nenhuma${ramp}todas as cadeiras da UF</span><span class="muted">Modelo: ${sumSeats} cadeiras · oficial: ${fed.cadeirasReais}</span>`;
    else leg.innerHTML = `<span>mais longe${ramp}mais perto da próxima cadeira</span><span class="muted">Escala logarítmica, em votos adicionais</span>`;
  }

  function panel() {
    const r = byUF.get(selected)!;
    const listas = l.ufs[selected].listas;
    const alloc = allocate(listas, r.total);
    const top = Object.entries(listas).sort((a, b) => b[1] - a[1]);
    const shown = top.slice(0, 7);
    if (!shown.some(([k]) => k === l.alvo)) shown.push([l.alvo, listas[l.alvo]]);
    const max = top[0][1];
    const qePct = (alloc.qe / max) * 100;
    const ord = r.seats + 1;
    $('[data-ufpanel]').innerHTML = `
      <p class="label">${selected} · ${r.total} cadeiras na Câmara</p>
      <h3>${UF_NOME[selected]}</h3>
      <div class="facts">
        <div><span class="stamp stamp--pt" data-stamp style="--rot:${tilt(1)}">${pct1(r.share * 100)}</span><p>dos válidos para a federação</p></div>
        <div><span class="stamp" data-stamp style="--rot:${tilt(2)}">${r.seats}/${r.total}</span><p>cadeiras no modelo</p></div>
        <div><span class="stamp" data-stamp style="--rot:${tilt(3)}">${r.toNext == null ? '—' : int(r.toNext)}</span><p>${r.toNext == null ? 'já tem todas' : `votos a mais para a ${ord}ª cadeira`}</p></div>
      </div>
      <div class="bars" role="list">
        ${shown
          .map(([k, v]) => {
            const s = alloc.seats[k] ?? 0;
            return `<div class="bars__row${k === l.alvo ? ' is-alvo' : ''}" role="listitem">
              <span class="bars__name" title="${esc(k)}">${esc(listLabel(k))}</span>
              <span class="bars__track"><span class="bars__fill" style="width:${(v / max) * 100}%"></span>${qePct <= 100 ? `<span class="bars__qe" style="left:${qePct}%"></span>` : ''}</span>
              <span class="bars__seats">${s}</span>
            </div>`;
          })
          .join('')}
      </div>
      <p class="small">Linha tracejada: quociente eleitoral (${int(alloc.qe)} votos). Números à direita: cadeiras no modelo.
      ${r.seats > 0 ? `A federação perderia uma cadeira com ${int(r.cushion + 1)} votos a menos.` : ''}</p>`;
    $('[data-ufpanel]').querySelectorAll('[data-stamp]').forEach((s, i) => stamp(s, i * 80));
  }

  $('[data-metric]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
    if (!b) return;
    metric = b.dataset.m as Metric;
    $('[data-metric]').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    paint();
  });
  tiles.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('.tile');
    if (!t) return;
    selected = t.dataset.uf!;
    paint();
    panel();
  });

  const rank = $('[data-rank]');
  const near = rows.filter((r) => r.toNext != null).sort((a, b) => a.toNext! - b.toNext!).slice(0, 8);
  rank.innerHTML = `<h3>As cadeiras mais próximas</h3>
    <p class="note">Votos que a federação precisaria somar, mantidos os das outras listas, para ganhar mais uma cadeira no modelo.</p>
    <div class="rank__list">${near
      .map(
        (r, i) =>
          `<button type="button" class="rank__item" data-uf="${r.uf}"><span class="uf">${r.uf}</span><span class="stamp" data-stamp style="--rot:${tilt(60 + i)}">${int(r.toNext!)}</span><p>para a ${r.seats + 1}ª cadeira em ${UF_NOME[r.uf]}</p></button>`,
      )
      .join('')}</div>`;
  stampOnEnter(rank);
  rank.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.rank__item');
    if (!b) return;
    selected = b.dataset.uf!;
    paint();
    panel();
    $('[data-tiles]').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  paint();
  panel();

  $('[data-source="mapa"]').innerHTML =
    `Fonte: TSE, votos por lista para deputado federal em ${l.ano}, agregados pelo ETL do projeto (${esc(l.provenance.generatedAt.slice(0, 10))}). ` +
    `Modelo: quociente eleitoral, quociente partidário e sobras por maiores médias com piso de 80% do QE; não aplica os pisos individuais de candidatos. Cadeiras oficiais da federação: <a href="${esc(fed.fonte)}" target="_blank" rel="noopener">${fed.cadeirasReais}</a>.`;
}
