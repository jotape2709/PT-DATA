import type { Plenario } from '../data/types';
import { $, dateBR, dec2, esc, monthBR, share, signed } from '../core/format';
import { onEnter, reducedMotion, stamp, stampOnEnter, tilt } from '../core/motion';
import { hideTip, showTip } from '../core/tooltip';
import { computeCohesion, type CohesionResult } from '../engine/cohesion';
import { responsive } from './virada';
import type { IrtResult } from '../engine/irt';

const VOTE_NAME: Record<string, string> = { S: 'Sim', N: 'Não', O: 'Obstrução', A: 'Abstenção', '-': 'ausente' };

export type PlenarioState = { cohesion: CohesionResult; irt?: IrtResult; order?: number[]; focus?: number };

export function renderPlenario(p: Plenario, irtPromise: Promise<IrtResult>): PlenarioState {
  const c = computeCohesion(p);
  const state: PlenarioState = { cohesion: c };
  const others = c.parties.filter((x) => x.partido !== 'PT' && x.n >= 50 && x.size >= 2).sort((a, b) => b.withPT - a.withPT);
  const top3 = others.slice(0, 3);
  const bottom2 = [...others].sort((a, b) => a.withPT - b.withPT).slice(0, 2);
  const ptN = c.ptIdx.length;

  $('[data-window]').textContent = `${monthBR(p.window.from)} → ${monthBR(p.window.to)}`;
  $('[data-h="plenario"]').textContent = `Os deputados do PT seguiram a maioria da bancada em ${share(c.ptFidelity)} dos votos.`;
  $('[data-lede="plenario"]').innerHTML =
    `Entre os demais partidos, ${top3.map((x) => `${x.partido} (${share(x.withPT)})`).join(', ')} foram os que mais votaram como a maioria do PT; ` +
    `${bottom2.map((x) => `${x.partido} (${share(x.withPT)})`).join(' e ')}, os que menos. ` +
    `A janela vai de ${dateBR(p.window.from)} a ${dateBR(p.window.to)}: ${p.votes.length} votações nominais no Plenário.`;

  const kpis: [string, string][] = [
    [share(c.ptFidelity), 'dos votos de deputados do PT iguais à maioria da bancada'],
    [dec2(c.ptRice), 'índice de Rice do PT (1 = bancada sempre unânime)'],
    [String(p.votes.length), 'votações nominais com ao menos 200 votos'],
    [String(ptN), 'deputados do PT que votaram na janela'],
  ];
  const kp = $('[data-kpis]');
  kp.innerHTML = kpis.map(([v, t], i) => `<div class="kpi"><span class="stamp${i === 0 ? ' stamp--pt' : ''}" data-stamp style="--rot:${tilt(90 + i)}">${v}</span><p>${t}</p></div>`).join('');
  stampOnEnter(kp);

  responsive($('[data-agree]'), (animate) => drawAgreement(others, animate));
  drawDivisive(p, c);

  const sel = $('[data-punch-party]') as HTMLSelectElement;
  sel.innerHTML = `<option value="">nenhum</option>` + c.parties.map((x) => `<option value="${esc(x.partido)}">${esc(x.partido)} (${x.size})</option>`).join('');
  sel.value = '';

  const punch = new PunchCard(p, c);
  let redrawStrip: (() => void) | null = null;
  irtPromise.then((irt) => {
    state.irt = irt;
    punch.setModel(irt);
    drawModel(p, c, irt);
    responsive($('[data-strip]'), (animate) => {
      redrawStrip = () => drawStrip(p, c, irt, state.focus, false);
      drawStrip(p, c, irt, state.focus, animate);
    });
    initFinder(p, c, irt, (i) => {
      state.focus = i ?? undefined;
      punch.setFocus(i);
      redrawStrip?.();
    });
  });

  $('[data-punch-sort]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-s]');
    if (!b) return;
    $('[data-punch-sort]').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    punch.setSort(b.dataset.s as 'cut' | 'date');
  });
  sel.addEventListener('change', () => punch.setParty(sel.value));

  $('[data-source="plenario"]').innerHTML =
    `Fonte: API de Dados Abertos da Câmara dos Deputados, votações nominais do Plenário (snapshot de ${esc(p.provenance.generatedAt.slice(0, 10))}). ` +
    `Maioria = sinal de Sim − Não do grupo; obstrução conta como Não; abstenções e ausências ficam fora. O partido de cada deputado é o do primeiro voto na janela.`;
  return state;
}

function drawAgreement(rows: CohesionResult['parties'], animate: boolean) {
  const svg = $('[data-agree]') as unknown as SVGSVGElement;
  const W = Math.max(320, Math.min(860, svg.parentElement!.clientWidth));
  const narrow = W < 520;
  const rh = narrow ? 24 : 26;
  const m = { t: 26, r: narrow ? 50 : 60, b: 8, l: narrow ? 96 : 118 };
  const H = m.t + rows.length * rh + m.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const x = (v: number) => m.l + v * (W - m.l - m.r);
  const parts: string[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    parts.push(`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t - 6}" y2="${H - m.b}" />`);
    parts.push(`<text class="tick" x="${x(t)}" y="${m.t - 12}" text-anchor="middle">${t * 100}%</text>`);
  }
  rows.forEach((r, i) => {
    const y = m.t + i * rh + rh / 2;
    const rad = 3 + Math.sqrt(r.size) * 0.9;
    parts.push(`<g class="r" data-i="${i}">
      <text x="${m.l - 12}" y="${y + 4}" text-anchor="end">${esc(pname(r.partido, narrow))}</text>
      <line class="stem" x1="${x(0)}" x2="${x(r.withPT)}" y1="${y}" y2="${y}" />
      <circle cx="${x(r.withPT)}" cy="${y}" r="${rad}" />
      <text class="val" x="${x(1) + 10}" y="${y + 4}">${share(r.withPT)}</text>
    </g>`);
  });
  svg.innerHTML = parts.join('');
  svg.querySelectorAll<SVGGElement>('g.r').forEach((g) => {
    const r = rows[Number(g.dataset.i)];
    g.addEventListener('pointermove', (e) =>
      showTip(`<b>${esc(r.partido)}</b> · ${r.size} deputados<br>votou como a maioria do PT em ${share(r.withPT)} de ${r.n} votações<br><span class="k">Rice do partido: ${dec2(r.rice)}</span>`, e.clientX, e.clientY),
    );
    g.addEventListener('pointerleave', hideTip);
  });
  if (!reducedMotion && animate) {
    const circles = [...svg.querySelectorAll<SVGCircleElement>('circle')];
    const stems = [...svg.querySelectorAll<SVGLineElement>('.stem')];
    circles.forEach((cEl) => (cEl.style.opacity = '0'));
    onEnter(svg, () => {
      stems.forEach((s, i) => s.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 500, delay: i * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
      stems.forEach((s) => (s.style.transformOrigin = `${x(0)}px 0`));
      circles.forEach((cEl, i) => cEl.animate([{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, delay: 300 + i * 40, easing: 'cubic-bezier(.2,.9,.25,1.35)', fill: 'forwards' }));
      circles.forEach((cEl) => (cEl.style.transformOrigin = `${cEl.getAttribute('cx')}px ${cEl.getAttribute('cy')}px`));
    });
  }
}

function drawDivisive(p: Plenario, c: CohesionResult) {
  const ol = $('[data-divisive]');
  ol.innerHTML = c.divisive
    .slice(0, 5)
    .map((d) => {
      const v = p.votes[d.j];
      const tot = d.yes + d.no;
      return `<li>
        <span class="date">${dateBR(v.data)}</span>
        <div><div class="split-bar" aria-hidden="true"><span class="s" style="width:${(d.yes / tot) * 100}%"></span><span class="n" style="width:${(d.no / tot) * 100}%"></span></div>
          <div class="counts">PT: ${d.yes} Sim · ${d.no} Não</div></div>
        <span>${esc(v.descricao)}</span>
      </li>`;
    })
    .join('');
}

function drawModel(p: Plenario, c: CohesionResult, irt: IrtResult) {
  const med = (party: string) => {
    const xs = p.deputies.map((d, i) => (d.partido === party ? irt.theta[i] : NaN)).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    return xs.length ? xs[xs.length >> 1] : NaN;
  };
  const sizes = c.parties.filter((x) => x.size >= 10);
  const medians = sizes.map((x) => ({ partido: x.partido, m: med(x.partido) })).sort((a, b) => a.m - b.m);
  const left = medians[0];
  const right = medians[medians.length - 1];
  const box = $('[data-model]');
  box.innerHTML = `
    <div><span class="stamp" data-stamp style="--rot:${tilt(120)}">${share(irt.accuracy)}</span><p>dos votos reproduzidos pelo modelo de uma dimensão (IRT), que só conhece a posição de cada deputado e de cada votação.</p></div>
    <div><span class="stamp" data-stamp style="--rot:${tilt(121)}">${share(irt.baseline)}</span><p>acertaria o palpite ingênuo “todos votam com a maioria do plenário”. O ganho mede quanto o eixo explica.</p></div>
    <div><span class="stamp stamp--pt" data-stamp style="--rot:${tilt(122)}">${signed(left.m)} · ${signed(right.m)}</span><p>medianas de ${esc(left.partido)} e ${esc(right.partido)}, os extremos entre bancadas com 10 ou mais deputados. Eixo em desvios-padrão.</p></div>`;
  stampOnEnter(box);
}

class PunchCard {
  private canvas = $('[data-punch-canvas]') as HTMLCanvasElement;
  private frame = this.canvas.parentElement as HTMLElement;
  private axis = $('[data-punch-axis]');
  private axisCanvas = document.createElement('canvas');
  private cols: number[];
  private rows: number[];
  private sort: 'cut' | 'date' = 'cut';
  private party = '';
  private irt?: IrtResult;
  private W = 0;
  private H = 0;
  private cw = 0;
  private rh = 0;
  private revealed = false;
  private bandRow = document.createElement('div');
  private bandCol = document.createElement('div');
  private bandFocus = document.createElement('div');
  private focus: number | null = null;

  constructor(private p: Plenario, private c: CohesionResult) {
    // Before the model arrives: PT first, then parties by agreement with the PT.
    const agree = new Map(c.parties.map((x) => [x.partido, x.withPT]));
    this.cols = p.deputies.map((_, i) => i).sort((a, b) => (agree.get(p.deputies[b].partido) ?? 0) - (agree.get(p.deputies[a].partido) ?? 0));
    this.rows = p.votes.map((_, j) => j);
    this.axis.appendChild(this.axisCanvas);
    for (const b of [this.bandRow, this.bandCol]) {
      b.style.cssText = 'position:absolute;pointer-events:none;background:rgba(26,21,18,.14);display:none';
      this.frame.appendChild(b);
    }
    this.bandFocus.style.cssText =
      'position:absolute;top:0;bottom:0;pointer-events:none;display:none;background:rgba(242,183,5,.55);box-shadow:0 0 0 1px #1a1512;';
    this.frame.appendChild(this.bandFocus);
    new ResizeObserver(() => this.layout()).observe(this.frame);
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerleave', () => {
      hideTip();
      this.bandRow.style.display = this.bandCol.style.display = 'none';
    });
    onEnter(this.canvas, () => {
      this.revealed = true;
      this.draw(true);
    }, 0.15);
  }

  setModel(irt: IrtResult) {
    this.irt = irt;
    this.cols = this.p.deputies.map((_, i) => i).sort((a, b) => irt.theta[a] - irt.theta[b]);
    this.orderRows();
    this.draw(false);
  }

  setSort(s: 'cut' | 'date') {
    this.sort = s;
    this.orderRows();
    this.draw(this.revealed);
  }

  setParty(p: string) {
    this.party = p;
    this.draw(false);
  }

  setFocus(i: number | null) {
    this.focus = i;
    this.placeFocus();
  }

  private placeFocus() {
    if (this.focus == null || !this.cw) {
      this.bandFocus.style.display = 'none';
      return;
    }
    const k = this.cols.indexOf(this.focus);
    Object.assign(this.bandFocus.style, { display: 'block', left: `${k * this.cw - 1}px`, width: `${Math.max(3, this.cw + 2)}px` });
  }

  private orderRows() {
    const irt = this.irt;
    if (this.sort === 'date' || !irt) this.rows = this.p.votes.map((_, j) => j);
    else {
      // Two blocks: votes where the PT side voted Sim (β < 0), then where it voted Não;
      // inside each block, by cutting point. Near-flat votes (|β| small) go last.
      const block = (j: number) => (Math.abs(irt.beta[j]) < 0.05 || !Number.isFinite(irt.cut[j]) ? 2 : irt.beta[j] < 0 ? 0 : 1);
      this.rows = this.p.votes
        .map((_, j) => j)
        .sort((a, b) => block(a) - block(b) || (irt.cut[a] || 0) - (irt.cut[b] || 0));
    }
  }

  private layout() {
    const w = this.frame.clientWidth;
    if (!w || w === this.W) return;
    this.W = w;
    const n = this.p.deputies.length;
    this.cw = w / n;
    this.rh = w < 600 ? 1.7 : 2.6;
    this.H = Math.round(this.p.votes.length * this.rh);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.height = `${this.H}px`;
    this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ah = this.axis.clientHeight - 16;
    this.axisCanvas.width = Math.round(w * dpr);
    this.axisCanvas.height = Math.round(ah * dpr);
    this.axisCanvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(false);
  }

  private draw(animate: boolean) {
    if (!this.W) return;
    const ctx = this.canvas.getContext('2d')!;
    const { cw, rh, W, H } = this;
    const css = getComputedStyle(document.documentElement);
    const cS = css.getPropertyValue('--pt').trim() || '#c8161d'; // Sim
    const cN = css.getPropertyValue('--graphite').trim() || '#2e2723'; // Não
    const cGold = css.getPropertyValue('--gold').trim() || '#f2b705';
    const pos = new Int32Array(this.p.deputies.length);
    this.cols.forEach((i, k) => (pos[i] = k));
    const gapX = cw > 2.2 ? 0.35 : 0;
    const gapY = rh > 2 ? 0.45 : 0.2;

    const drawRows = (from: number, to: number) => {
      for (let r = from; r < to; r++) {
        const j = this.rows[r];
        const b = this.p.votes[j].ballots;
        const y = r * rh;
        for (const [ch, color, alpha] of [
          ['S', cS, 1],
          ['N', cN, 0.9],
          ['O', cN, 0.9],
          ['A', cN, 0.35],
        ] as const) {
          ctx.fillStyle = color;
          for (let i = 0; i < b.length; i++) {
            if (b[i] !== ch) continue;
            const dim = this.party && this.p.deputies[i].partido !== this.party;
            ctx.globalAlpha = alpha * (dim ? 0.28 : 1);
            ctx.fillRect(pos[i] * cw + gapX / 2, y + gapY / 2, cw - gapX, rh - gapY);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    ctx.clearRect(0, 0, W, H);
    if (animate && !reducedMotion) {
      const total = this.rows.length;
      const t0 = performance.now();
      let done = 0;
      const step = (t: number) => {
        const target = Math.min(total, Math.ceil(((t - t0) / 1100) * total));
        drawRows(done, target);
        done = target;
        if (done < total) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else {
      drawRows(0, this.rows.length);
    }

    // Axis strip: one tick per deputy; PT in red, highlighted party in violet.
    const ax = this.axisCanvas.getContext('2d')!;
    const ah = this.axis.clientHeight - 16;
    ax.clearRect(0, 0, W, ah);
    this.cols.forEach((i, k) => {
      const d = this.p.deputies[i];
      const isPT = d.partido === 'PT';
      const isSel = this.party && d.partido === this.party && !isPT;
      ax.fillStyle = isPT ? cGold : isSel ? cS : 'rgba(46,39,35,.38)';
      const h = isPT || isSel ? ah : ah * 0.45;
      ax.fillRect(k * cw, ah - h, Math.max(1, cw - 0.4), h);
    });
    this.axis.querySelectorAll('.ax-label').forEach((x) => x.remove());
    const label = (txt: string, x: number, align: 'left' | 'right') => {
      const s = document.createElement('span');
      s.className = 'ax-label';
      s.textContent = txt;
      s.style[align === 'left' ? 'left' : 'right'] = `${align === 'left' ? x : W - x}px`;
      this.axis.appendChild(s);
    };
    this.placeFocus();
    if (this.irt) {
      // Median column of the two largest blocs at each end of the axis.
      const big = this.c.parties.filter((x) => x.size >= 10).map((x) => x.partido);
      const medCol = (party: string) => {
        const ks = this.cols.map((i, k) => (this.p.deputies[i].partido === party ? k : -1)).filter((k) => k >= 0);
        return ks[ks.length >> 1];
      };
      const ranked = big.map((b) => ({ b, k: medCol(b) })).sort((a, b) => a.k - b.k);
      const lo = ranked[0];
      const hi = ranked[ranked.length - 1];
      label(`▲ mediana ${lo.b}`, lo.k * cw, 'left');
      label(`mediana ${hi.b} ▲`, (hi.k + 1) * cw, 'right');
    } else {
      label('estimando posições…', 0, 'left');
    }
  }

  private hover(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const k = Math.min(this.cols.length - 1, Math.max(0, Math.floor(x / this.cw)));
    const row = Math.min(this.rows.length - 1, Math.max(0, Math.floor(y / this.rh)));
    const i = this.cols[k];
    const j = this.rows[row];
    const d = this.p.deputies[i];
    const v = this.p.votes[j];
    const ch = v.ballots[i];
    const theta = this.irt ? `<br><span class="k">posição estimada ${signed(this.irt.theta[i])}</span>` : '';
    showTip(
      `<b>${esc(d.nome)}</b> · ${esc(d.partido)}-${d.uf}${theta}<br>${dateBR(v.data)}: <b>${VOTE_NAME[ch] ?? ch}</b><br><span class="k">${esc(v.descricao.slice(0, 150))}${v.descricao.length > 150 ? '…' : ''}</span>`,
      e.clientX,
      e.clientY,
    );
    Object.assign(this.bandRow.style, { display: 'block', left: '0', right: '0', top: `${row * this.rh}px`, height: `${Math.max(2, this.rh)}px` });
    Object.assign(this.bandCol.style, { display: 'block', top: '0', bottom: '0', left: `${k * this.cw}px`, width: `${Math.max(2, this.cw)}px` });
  }
}


/** Short party names for narrow charts. */
const SHORT: Record<string, string> = { SOLIDARIEDADE: 'SOLIDARIED.', REPUBLICANOS: 'REPUBLIC.' };
const pname = (s: string, narrow: boolean) => (narrow ? (SHORT[s] ?? s) : s);

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function initFinder(p: Plenario, c: CohesionResult, irt: IrtResult, onPick: (i: number | null) => void) {
  const input = $('[data-find]') as HTMLInputElement;
  const list = $('[data-list]');
  const card = $('[data-profile]');
  const label = (i: number) => `${p.deputies[i].nome} (${p.deputies[i].partido}-${p.deputies[i].uf})`;
  const order = p.deputies.map((_, i) => i).sort((a, b) => p.deputies[a].nome.localeCompare(p.deputies[b].nome, 'pt-BR'));
  list.innerHTML = order.map((i) => `<option value="${esc(label(i))}"></option>`).join('');
  const byLabel = new Map(order.map((i) => [norm(label(i)), i]));
  const rank = p.deputies.map((_, i) => i).sort((a, b) => irt.theta[a] - irt.theta[b]);
  const pos = new Int32Array(p.deputies.length);
  rank.forEach((i, k) => (pos[i] = k + 1));

  const find = (q: string): number | null => {
    const n = norm(q);
    if (!n) return null;
    if (byLabel.has(n)) return byLabel.get(n)!;
    const hit = order.find((i) => norm(p.deputies[i].nome).startsWith(n)) ?? order.find((i) => norm(p.deputies[i].nome).includes(n));
    return hit ?? null;
  };

  const show = (i: number) => {
    const d = p.deputies[i];
    const st = c.deputies[i];
    const cnt = { S: 0, N: 0, A: 0, X: 0 };
    for (const v of p.votes) {
      const ch = v.ballots[i];
      if (ch === 'S') cnt.S++;
      else if (ch === 'N' || ch === 'O') cnt.N++;
      else if (ch === 'A') cnt.A++;
      else cnt.X++;
    }
    const tot = p.votes.length;
    card.innerHTML = `
      <h4>${esc(d.nome)}</h4>
      <p class="who">${esc(d.partido)} · ${d.uf}</p>
      <div class="finder__facts">
        <div><span class="stamp" data-stamp>${signed(irt.theta[i])}</span><p>posição no eixo; ${pos[i]}ª de ${p.deputies.length} a partir do polo do PT</p></div>
        <div><span class="stamp" data-stamp>${Number.isNaN(st.withPT) ? '—' : share(st.withPT)}</span><p>dos votos iguais à maioria do PT (${st.n} votações)</p></div>
        <div><span class="stamp" data-stamp>${share(st.present / tot)}</span><p>de presença: votou em ${st.present} de ${tot} votações</p></div>
      </div>
      <div class="finder__mix" aria-hidden="true"><span style="width:${(cnt.S / tot) * 100}%"></span><span style="width:${(cnt.N / tot) * 100}%"></span><span style="width:${(cnt.A / tot) * 100}%"></span></div>
      <p class="finder__mixlbl">${cnt.S} Sim · ${cnt.N} Não ou obstrução · ${cnt.A} abstenções · ${cnt.X} ausências</p>`;
    card.querySelectorAll('[data-stamp]').forEach((s, k) => stamp(s, k * 80));
  };

  const pick = () => {
    const i = find(input.value);
    if (i == null) return;
    input.value = label(i);
    show(i);
    onPick(i);
  };
  input.addEventListener('change', pick);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      pick();
    }
  });
}

function drawStrip(p: Plenario, c: CohesionResult, irt: IrtResult, focus: number | undefined, animate: boolean) {
  const svg = $('[data-strip]') as unknown as SVGSVGElement;
  const W = Math.max(320, Math.min(980, svg.parentElement!.clientWidth));
  const narrow = W < 520;
  const groups = c.parties
    .filter((x) => x.size >= 2)
    .map((x) => {
      const idx = p.deputies.map((d, i) => (d.partido === x.partido ? i : -1)).filter((i) => i >= 0);
      const th = idx.map((i) => irt.theta[i]).sort((a, b) => a - b);
      return { partido: x.partido, idx, med: th[th.length >> 1] };
    })
    .sort((a, b) => a.med - b.med);
  const rh = narrow ? 24 : 28;
  const m = { t: 10, r: 16, b: 34, l: narrow ? 108 : 132 };
  const H = m.t + groups.length * rh + m.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of irt.theta) {
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  lo = Math.floor(lo * 2) / 2;
  hi = Math.ceil(hi * 2) / 2;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (W - m.l - m.r);
  const parts: string[] = [];
  for (let v = Math.ceil(lo); v <= hi; v++) {
    parts.push(`<line class="${v === 0 ? 'zero' : 'grid'}" x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${H - m.b + 4}" />`);
    parts.push(`<text class="tick" x="${x(v)}" y="${H - m.b + 18}" text-anchor="middle">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</text>`);
  }
  let focusSvg = '';
  groups.forEach((g, gi) => {
    const yc = m.t + gi * rh + rh / 2;
    const isPT = g.partido === 'PT';
    parts.push(`<text x="${m.l - 12}" y="${yc + 4}" text-anchor="end"${isPT ? ' style="fill:var(--pt);font-weight:800"' : ''}>${esc(pname(g.partido, narrow))} <tspan class="tick">${g.idx.length}</tspan></text>`);
    for (const i of g.idx) {
      const h = Math.sin(p.deputies[i].id * 12.9898) * 43758.5453;
      const jitter = ((h - Math.floor(h)) - 0.5) * (rh - 10);
      const cx = x(irt.theta[i]);
      const cy = yc + jitter;
      parts.push(`<circle class="d${isPT ? ' is-pt' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${narrow ? 2.4 : 3}" data-i="${i}" />`);
      if (focus === i) {
        const anchor = cx > W - 160 ? 'end' : 'start';
        focusSvg = `<circle class="focus" cx="${cx}" cy="${cy}" r="7" /><text class="focus-lbl" x="${cx + (anchor === 'end' ? -12 : 12)}" y="${cy - 9}" text-anchor="${anchor}">${esc(p.deputies[i].nome)}</text>`;
      }
    }
    parts.push(`<line class="med${isPT ? ' is-pt' : ''}" x1="${x(g.med)}" x2="${x(g.med)}" y1="${yc - rh / 2 + 3}" y2="${yc + rh / 2 - 3}" />`);
  });
  parts.push(`<text class="tick" x="${m.l}" y="${H - 2}">◀ polo do PT</text>`);
  parts.push(`<text class="tick" x="${W - m.r}" y="${H - 2}" text-anchor="end">polo oposto ▶</text>`);
  svg.innerHTML = parts.join('') + focusSvg;

  svg.onpointermove = (e) => {
    const t = e.target as SVGElement;
    if (!(t instanceof SVGCircleElement) || t.dataset.i == null) return hideTip();
    const i = Number(t.dataset.i);
    const d = p.deputies[i];
    showTip(`<b>${esc(d.nome)}</b> · ${esc(d.partido)}-${d.uf}<br><span class="k">posição ${signed(irt.theta[i])} · votou como a maioria do PT em ${Number.isNaN(c.deputies[i].withPT) ? '—' : share(c.deputies[i].withPT)}</span>`, e.clientX, e.clientY);
  };
  svg.onpointerleave = hideTip;

  if (animate && !reducedMotion) {
    const dots = [...svg.querySelectorAll<SVGCircleElement>('circle.d')];
    dots.forEach((d) => (d.style.opacity = '0'));
    onEnter(svg, () => {
      dots.forEach((d) => {
        const delay = ((Number(d.getAttribute('cx')) - m.l) / (W - m.l)) * 900;
        d.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay, fill: 'forwards' });
      });
    });
  }
}
