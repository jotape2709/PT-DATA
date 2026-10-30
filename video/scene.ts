/**
 * Animação de 39 s (1080 × 1350, 4:5) para redes sociais, desenhada em canvas.
 * Tudo é função do tempo `t`: `window.seek(t)` desenha o quadro exato, o que
 * permite renderizar quadro a quadro (video/render.cjs) sem depender do relógio.
 */
import '../src/styles/main.css';
import { DATA } from '../src/data/load';
import { computeCohesion } from '../src/engine/cohesion';
import { encode, fitIrt } from '../src/engine/irt';
import { margins } from '../src/engine/seats';
import { TILE } from '../src/chapters/mapa';

if (location.search.includes('render')) document.body.classList.add('render');

const W = 1080;
const H = 1350;
const C = {
  paper: '#f1e8d6', paper2: '#e7dcc5', rule: '#cdbea0', red: '#c8161d', deep: '#6f0a0e',
  gold: '#f2b705', ink: '#1a1512', muted: '#6b5f55', night: '#120e0d',
};
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// ------------------------------------------------------------------ dados
const { historico: h, listas: l, plenario: p } = DATA;
const pres = h.presidencia;
const cam = h.camara;
const runs = pres.filter((x) => x.turno2);
const coh = computeCohesion(p);
const irt = fitIrt({ n: p.deputies.length, m: p.votes.length, y: encode(p.votes.map((v) => v.ballots), p.deputies.length), ref: coh.ptIdx });
const cols = p.deputies.map((_, i) => i).sort((a, b) => irt.theta[a] - irt.theta[b]);
const block = (j: number) => (Math.abs(irt.beta[j]) < 0.05 || !Number.isFinite(irt.cut[j]) ? 2 : irt.beta[j] < 0 ? 0 : 1);
const rows = p.votes.map((_, j) => j).sort((a, b) => block(a) - block(b) || (irt.cut[a] || 0) - (irt.cut[b] || 0));
const ufRows = Object.entries(l.ufs).map(([uf, v]) => {
  const valid = Object.values(v.listas).reduce((a, b) => a + b, 0);
  return { uf, share: (v.listas[l.alvo] ?? 0) / valid, ...margins(v.listas, l.cadeirasPorUF[uf], l.alvo) };
});
const close = ufRows.filter((r) => r.toNext != null && r.toNext < 40000).sort((a, b) => a.toNext! - b.toNext!);
const nearest = close[0];

// Punch card pre-rendered once (it is the heaviest layer).
const PW = 960;
const PH = 600;
const punch = document.createElement('canvas');
punch.width = PW;
punch.height = PH;
{
  const g = punch.getContext('2d')!;
  const cw = PW / cols.length;
  const rh = PH / rows.length;
  const pos = new Int32Array(p.deputies.length);
  cols.forEach((i, k) => (pos[i] = k));
  rows.forEach((j, r) => {
    const b = p.votes[j].ballots;
    for (let i = 0; i < b.length; i++) {
      const ch = b[i];
      if (ch === '-') continue;
      g.fillStyle = ch === 'S' ? C.red : ch === 'A' ? 'rgba(26,21,18,.35)' : C.ink;
      g.fillRect(pos[i] * cw, r * rh + 0.3, cw + 0.15, rh - 0.5);
    }
  });
}

// ---------------------------------------------------------------- helpers
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = (n: number) => n.toLocaleString('pt-BR');

type Fam = 'text' | 'stamp' | 'mono';
function font(size: number, weight = 700, fam: Fam = 'text', stretch: CanvasFontStretch = 'normal') {
  const f = fam === 'text' ? 'Archivo' : fam === 'stamp' ? 'Doto' : 'Martian Mono';
  ctx.font = `${weight} ${size}px "${f}"`;
  ctx.fontStretch = stretch;
}
function text(s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}
/** The signature clunk: scale 1.5 → 1 with a slight tilt and blur-free ink. */
function stamp(s: string, x: number, y: number, size: number, color: string, t: number, at: number, align: CanvasTextAlign = 'left', rot = 0) {
  const k = prog(t, at, at + 0.24);
  if (k <= 0) return;
  const sc = 1 + 0.5 * (1 - back(k)) * (k < 1 ? 1 : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(sc, sc);
  font(size, 900, 'stamp');
  ctx.globalAlpha = clamp(k * 2);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, 0.8, 0.6);
  ctx.globalAlpha = clamp(k * 2) * 0.35;
  ctx.fillText(s, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}
function wrap(s: string, x: number, y: number, maxW: number, lh: number, color: string, alpha = 1): number {
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      text(line, x, yy, color, 'left', alpha);
      line = w;
      yy += lh;
    } else line = test;
  }
  text(line, x, yy, color, 'left', alpha);
  return yy;
}
function star(cx: number, cy: number, r: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
function rect(x: number, y: number, w: number, hh: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, hh);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ frame
function chrome(label: string) {
  rect(0, 0, W, H, C.paper);
  ctx.strokeStyle = 'rgba(181,22,28,.06)';
  ctx.lineWidth = 1;
  for (let y = 60; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  rect(0, 0, W, 40, C.paper2);
  for (let x = 20; x < W; x += 40) {
    ctx.beginPath();
    ctx.arc(x, 20, 8, 0, Math.PI * 2);
    ctx.fillStyle = C.deep;
    ctx.fill();
  }
  font(19, 700, 'text', 'condensed');
  text('CARTÃO DE PONTO · O PT EM DADOS', 60, 92, C.red);
  text(label, W - 60, 92, C.ink, 'right');
  rect(60, 106, W - 120, 2, C.ink);
  rect(60, H - 86, W - 120, 2, C.ink);
  font(19, 700, 'text', 'condensed');
  text('github.com/jotape2709/PT-DATA', 60, H - 50, C.ink);
  font(19, 500, 'text', 'condensed');
  text('Fontes: TSE · Câmara dos Deputados', W - 60, H - 50, C.muted, 'right');
}

function headline(lines: string[], t: number, at: number, size = 64, y0 = 200, colors: string[] = []) {
  font(size, 900, 'text', 'extra-condensed');
  lines.forEach((s, i) => {
    const k = easeOut(prog(t, at + i * 0.12, at + i * 0.12 + 0.5));
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(0, (1 - k) * 24);
    text(s, 60, y0 + i * size * 0.98, colors[i] ?? C.ink);
    ctx.restore();
  });
}

// ----------------------------------------------------------------- scenes
function sceneTitle(t: number) {
  rect(0, 0, W, H, C.paper);
  for (let x = 20; x < W; x += 40) {
    ctx.beginPath();
    ctx.arc(x, 20, 8, 0, Math.PI * 2);
    ctx.fillStyle = C.deep;
    ctx.fill();
  }
  // Wedge from the bottom-right.
  const k = easeInOut(prog(t, 0.1, 1.1));
  ctx.save();
  ctx.beginPath();
  const top = 700 - k * 0;
  ctx.moveTo(W, top - 40 + (1 - k) * 700);
  ctx.lineTo(W, H);
  ctx.lineTo(W - k * (W + 200), H);
  ctx.lineTo(W - k * (W + 200) + 340 * k, H - 600 * k);
  ctx.closePath();
  ctx.fillStyle = C.red;
  ctx.fill();
  ctx.restore();
  if (k > 0.6) {
    const a = prog(t, 0.7, 1.2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(-200 + 300, H);
    ctx.lineTo(-200 + 300 + 26, H);
    ctx.lineTo(-200 + 300 + 26 + 340, H - 600);
    ctx.lineTo(-200 + 300 + 340, H - 600);
    ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.restore();
  }
  font(22, 700, 'text', 'condensed');
  text('CARTÃO DE PONTO · REGISTRO DE PRESENÇA NAS URNAS E NO PLENÁRIO', 60, 120, C.red, 'left', prog(t, 0.2, 0.6));
  headline(['O PT'], t, 0.3, 230, 340, [C.red]);
  headline(['EM DADOS'], t, 0.45, 230, 560, [C.ink]);
  const s = back(prog(t, 1.0, 1.9));
  if (s > 0) star(820, 1010, 120 * s, (1 - s) * -2.5, C.gold);
  stamp('1982', 460, 1080, 110, C.gold, t, 1.7);
  stamp('2026', 560, 1210, 110, C.gold, t, 2.05);
  font(26, 600, 'text', 'condensed');
  text('10 eleições presidenciais · 12 para a Câmara · 269 votações nominais', 60, 680, C.ink, 'left', prog(t, 2.4, 2.9));
}

function scenePres(t: number) {
  chrome('PRESIDÊNCIA · 1989 → 2026');
  headline(['10 eleições presidenciais.', 'Sempre entre os dois primeiros.'], t, 0, 66, 190, [C.ink, C.red]);
  const x0 = 60;
  const yTop = 330;
  const rh = 76;
  font(18, 700, 'text', 'condensed');
  text('ANO', x0 + 10, yTop, C.red);
  text('1º TURNO · %', 200, yTop, C.red);
  text('2º TURNO · %', 520, yTop, C.red);
  text('RESULTADO', 820, yTop, C.red);
  rect(x0, yTop + 14, W - 120, 2, C.red);
  pres.forEach((r, i) => {
    const at = 0.6 + i * 0.42;
    const y = yTop + 40 + i * rh;
    const comeback = r.turno1.posicao === 2 && r.resultado === 'vitória';
    if (comeback) rect(x0, y - 16, W - 120, rh, C.gold, 0.35 * prog(t, at + 1.2, at + 1.6));
    rect(x0, y + rh - 16, W - 120, 1, C.rule);
    font(26, 700, 'mono');
    text(String(r.ano), x0 + 10, y + 34, C.ink, 'left', prog(t, at, at + 0.15));
    stamp(fmt2(r.turno1.pct), 200, y + 36, 42, C.ink, t, at, 'left');
    const b1 = easeOut(prog(t, at, at + 0.5));
    rect(200, y + 48, 260, 6, C.paper2);
    rect(200, y + 48, 260 * (r.turno1.pct / 100) * b1, 6, C.ink, 0.75);
    rect(200 + 130, y + 42, 2, 18, C.ink, 0.8);
    font(18, 600, 'text', 'condensed');
    text(`${r.turno1.posicao}º lugar`, 360, y + 34, C.muted, 'left', prog(t, at, at + 0.2));
    if (r.turno2) {
      const win = r.resultado === 'vitória';
      stamp(fmt2(r.turno2.pct), 520, y + 36, 42, win ? C.red : C.ink, t, at + 0.12);
      rect(520, y + 48, 260, 6, C.paper2);
      rect(520, y + 48, 260 * (r.turno2.pct / 100) * easeOut(prog(t, at + 0.12, at + 0.6)), 6, win ? C.red : C.ink, win ? 1 : 0.75);
      rect(520 + 130, y + 42, 2, 18, C.ink, 0.8);
    } else {
      font(20, 500, 'text', 'condensed');
      text('sem 2º turno', 520, y + 34, C.muted, 'left', prog(t, at, at + 0.2));
    }
    // badge
    const k = prog(t, at + 0.25, at + 0.5);
    if (k > 0) {
      const lbl = comeback ? '★ VIRADA' : r.resultado === 'vitória' ? 'ELEITO' : 'NÃO ELEITO';
      ctx.save();
      ctx.translate(830, y + 26);
      ctx.rotate(((i % 3) - 1) * 0.03);
      ctx.scale(1 + 0.4 * (1 - back(k)), 1 + 0.4 * (1 - back(k)));
      font(18, 800, 'text', 'condensed');
      const w = ctx.measureText(lbl).width + 20;
      ctx.globalAlpha = clamp(k * 2);
      if (comeback) rect(0, -16, w, 30, C.gold);
      ctx.strokeStyle = comeback ? C.ink : r.resultado === 'vitória' ? C.red : C.ink;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(0, -16, w, 30);
      text(lbl, 10, 6, comeback ? C.ink : r.resultado === 'vitória' ? C.red : C.ink, 'left', clamp(k * 2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  });
}

function sceneCamara(t: number) {
  chrome('CÂMARA · 1982 → 2026');
  const peak = cam.reduce((a, b) => (b.cadeiras > a.cadeiras ? b : a));
  const trough = cam.filter((x) => x.ano > peak.ano).reduce((a, b) => (b.cadeiras < a.cadeiras ? b : a));
  const last = cam[cam.length - 1];
  headline(['Deputados federais', 'eleitos pelo PT'], t, 0, 72, 200, [C.ink, C.red]);
  font(28, 500, 'text');
  wrap(`De ${cam[0].cadeiras} em ${cam[0].ano} a ${peak.cadeiras} em ${peak.ano}. Caiu a ${trough.cadeiras} em ${trough.ano} e voltou a ${last.cadeiras} em ${last.ano}.`, 60, 350, 900, 38, C.ink, prog(t, 0.4, 0.9));
  const base = 1140;
  const cw = (W - 120) / cam.length;
  const d = 14.2;
  const g = 1.6;
  rect(60, base + 6, W - 120, 3, C.ink);
  cam.forEach((x, ci) => {
    const cx = 60 + ci * cw + (cw - (5 * d + 4 * g)) / 2;
    const at = 0.8 + ci * 0.28;
    const shown = Math.floor(x.cadeiras * easeOut(prog(t, at, at + 0.7)));
    for (let k = 0; k < shown; k++) {
      const col = k % 5;
      const row = Math.floor(k / 5);
      ctx.beginPath();
      ctx.arc(cx + col * (d + g) + d / 2, base - row * (d + g) - d / 2, d / 2, 0, Math.PI * 2);
      ctx.fillStyle = x === peak || x === last ? C.red : C.red;
      ctx.fill();
    }
    const rowsN = Math.ceil(x.cadeiras / 5);
    stamp(String(x.cadeiras), cx + (5 * d + 4 * g) / 2, base - rowsN * (d + g) - 18, 34, x === last ? C.red : C.ink, t, at + 0.55, 'center');
    font(17, 700, 'mono');
    text(String(x.ano), cx + (5 * d + 4 * g) / 2, base + 36, C.muted, 'center', prog(t, at, at + 0.2));
  });
  // gold marker on 2026
  const k = prog(t, 4.4, 4.8);
  if (k > 0) {
    const ci = cam.length - 1;
    const cx = 60 + ci * cw + cw / 2;
    star(cx, base + 72, 14 * back(k), 0, C.gold);
  }
}

function sceneVirada(t: number) {
  chrome('SEGUNDOS TURNOS · 1989 → 2026');
  headline(['Em 8 segundos turnos,', 'quem liderou o 1º venceu 7.'], t, 0, 64, 190, [C.ink, C.ink]);
  const focus = runs[runs.length - 1];
  font(30, 700, 'text');
  text(`A exceção é ${focus.ano}.`, 60, 340, C.red, 'left', prog(t, 0.5, 0.9));
  const x1 = 260;
  const x2 = 820;
  const lo = 10;
  const hi = 66;
  const y = (v: number) => 420 + ((hi - v) / (hi - lo)) * 700;
  font(18, 700, 'text', 'condensed');
  text('1º TURNO', x1, 405, C.red, 'center');
  text('2º TURNO', x2, 405, C.red, 'center');
  rect(x1 - 20, y(50), x2 - x1 + 40, 2, C.ink);
  font(16, 700, 'text', 'condensed');
  text('LINHA DOS 50%', (x1 + x2) / 2, y(50) - 10, C.ink, 'center');
  const others = runs.filter((r) => r !== focus);
  const all = [...others, focus];
  // label dodging on each side
  const dodge = (vals: number[]) => {
    const idx = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = idx.map((d) => d.v);
    for (let pass = 0; pass < 40; pass++) for (let k = 1; k < out.length; k++) if (out[k] - out[k - 1] < 26) { const pu = (26 - (out[k] - out[k - 1])) / 2; out[k - 1] -= pu; out[k] += pu; }
    const res: number[] = [];
    idx.forEach((d, k) => (res[d.i] = out[k]));
    return res;
  };
  const l1 = dodge(all.map((r) => y(r.turno1.pct)));
  const l2 = dodge(all.map((r) => y(r.turno2!.pct)));
  all.forEach((r, i) => {
    const isF = r === focus;
    const at = isF ? 3.0 : 0.8 + i * 0.25;
    const k = easeInOut(prog(t, at, at + (isF ? 1.1 : 0.6)));
    if (k <= 0) return;
    const a = y(r.turno1.pct);
    const b = y(r.turno2!.pct);
    ctx.save();
    ctx.strokeStyle = isF ? C.red : r.turno1.posicao === 2 ? C.muted : C.ink;
    ctx.globalAlpha = isF ? 1 : 0.5;
    ctx.lineWidth = isF ? 7 : 3;
    if (!isF && r.turno1.posicao === 2) ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(x1, a);
    ctx.lineTo(x1 + (x2 - x1) * k, a + (b - a) * k);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x1, a, isF ? 9 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isF ? C.red : C.ink;
    ctx.fill();
    font(isF ? 22 : 18, isF ? 800 : 600, 'mono');
    text(`${r.ano} · ${fmt2(r.turno1.pct)}`, x1 - 18, l1[i] + 6, isF ? C.red : C.ink, 'right', isF ? 1 : 0.8);
    if (k >= 1) {
      ctx.beginPath();
      ctx.arc(x2, b, isF ? 9 : 5, 0, Math.PI * 2);
      ctx.fill();
      text(`${fmt2(r.turno2!.pct)} · ${r.ano}`, x2 + 18, l2[i] + 6, isF ? C.red : C.ink, 'left', isF ? 1 : 0.8);
    }
  });
  const kk = prog(t, 4.3, 4.6);
  if (kk > 0) {
    const g = focus.ganhoEntreTurnos!;
    ctx.save();
    ctx.translate(60, 1170);
    ctx.globalAlpha = kk;
    rect(0, -40, W - 120, 60, C.gold);
    font(28, 800, 'text', 'condensed');
    text(`★ ${focus.candidato}: ${fmt2(focus.turno1.pct)}% → ${fmt2(focus.turno2!.pct)}% (+${fmt2(g.pontos)} pontos, +${fmt1(g.votos / 1e6)} milhões de votos)`, 20, 0, C.ink);
    ctx.restore();
  }
}

function scenePunch(t: number) {
  chrome('PLENÁRIO · OUT/2025 → OUT/2026');
  headline([`${p.votes.length} votações. ${p.deputies.length} deputados.`, 'Um cartão perfurado.'], t, 0, 62, 190, [C.ink, C.red]);
  font(24, 500, 'text');
  text('Cada coluna é um deputado; cada linha, uma votação. Vermelho é Sim, preto é Não.', 60, 330, C.ink, 'left', prog(t, 0.4, 0.8));
  const x0 = 60;
  const y0 = 400;
  // PT tick strip
  const cw = PW / cols.length;
  const ks = prog(t, 0.6, 1.2);
  cols.forEach((i, k) => {
    const isPT = p.deputies[i].partido === 'PT';
    rect(x0 + k * cw, y0 - (isPT ? 34 : 14) * ks, Math.max(1, cw - 0.2), (isPT ? 34 : 14) * ks, isPT ? C.gold : 'rgba(26,21,18,.35)');
  });
  font(16, 700, 'text', 'condensed');
  text('◀ POLO DO PT', x0, y0 - 44, C.ink, 'left', ks);
  text('POLO OPOSTO ▶', x0 + PW, y0 - 44, C.ink, 'right', ks);
  const reveal = easeInOut(prog(t, 0.9, 3.2));
  const hh = PH * reveal;
  if (hh > 0) ctx.drawImage(punch, 0, 0, PW, hh, x0, y0 + 6, PW, hh);
  if (reveal > 0 && reveal < 1) rect(x0 - 6, y0 + 6 + hh - 2, PW + 12, 4, C.gold);
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 - 8, y0 - 2, PW + 16, PH + 16);
  stamp(`${fmt1(irt.accuracy * 100)}%`, 60, 1150, 72, C.red, t, 3.5);
  font(23, 500, 'text');
  text('dos votos previstos por um modelo de um eixo só (IRT)', 330, 1118, C.ink, 'left', prog(t, 3.6, 3.9));
  text(`palpite ingênuo: ${fmt1(irt.baseline * 100)}% · PT votou com a própria bancada em ${fmt1(coh.ptFidelity * 100)}%`, 330, 1152, C.muted, 'left', prog(t, 3.8, 4.1));
}

function sceneMapa(t: number) {
  chrome('CÂMARA 2026 · FEDERAÇÃO PT/PCDOB/PV');
  headline([`Em ${close.length} UFs, menos de 40 mil votos`, 'separaram a federação de', 'mais uma cadeira.'], t, 0, 56, 180, [C.ink, C.ink, C.red]);
  const size = 98;
  const gap = 8;
  const ox = 60;
  const oy = 380;
  const maxShare = Math.max(...ufRows.map((r) => r.share));
  const ramp = (u: number) => {
    const stops = [[231, 220, 197], [236, 160, 140], [200, 22, 29], [106, 8, 12]];
    const s = clamp(u, 0, 0.999) * 3;
    const k = Math.floor(s);
    const f = s - k;
    return `rgb(${stops[k].map((v, i) => Math.round(v + (stops[k + 1][i] - v) * f)).join(',')})`;
  };
  for (const r of ufRows) {
    const [c, rr] = TILE[r.uf];
    const at = 0.4 + (c + rr) * 0.08;
    const k = back(prog(t, at, at + 0.35));
    if (k <= 0) continue;
    const x = ox + c * (size + gap);
    const y = oy + rr * (size + gap);
    const u = r.share / maxShare;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(k, k);
    rect(-size / 2, -size / 2, size, size, ramp(u));
    const dark = u > 0.48;
    font(26, 900, 'text', 'condensed');
    text(r.uf, -size / 2 + 10, -size / 2 + 32, dark ? C.gold : C.ink);
    font(17, 600, 'mono');
    text(`${fmt1(r.share * 100)}%`, -size / 2 + 10, size / 2 - 12, dark ? '#fff' : C.ink);
    if (r.uf === nearest.uf && t > 2.2) {
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 7;
      ctx.strokeRect(-size / 2 + 3, -size / 2 + 3, size - 6, size - 6);
    }
    ctx.restore();
  }
  // callout
  const k = prog(t, 2.2, 2.6);
  if (k > 0) {
    const bx = 700;
    const by = 560;
    ctx.save();
    ctx.globalAlpha = k;
    rect(bx, by, 320, 300, C.night);
    font(20, 700, 'text', 'condensed');
    text(`${nearest.uf === 'DF' ? 'DISTRITO FEDERAL' : nearest.uf}`, bx + 22, by + 44, C.gold);
    ctx.restore();
    stamp(int(nearest.toNext!), bx + 22, by + 130, 66, C.gold, t, 2.5);
    ctx.save();
    ctx.globalAlpha = k;
    font(22, 500, 'text');
    text('votos a mais teriam dado', bx + 22, by + 180, '#efe5d2');
    text(`à federação a ${nearest.current + 1}ª cadeira`, bx + 22, by + 210, '#efe5d2');
    font(16, 500, 'text');
    text('modelo de distribuição de cadeiras', bx + 22, by + 262, '#b2a48f');
    ctx.restore();
  }
  font(20, 500, 'text');
  text('Cor: fatia dos votos válidos da federação em cada UF', 60, 1230, C.muted, 'left', prog(t, 1.2, 1.6));
}

function sceneEnd(t: number) {
  rect(0, 0, W, H, C.red);
  const k = easeInOut(prog(t, 0, 0.8));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * k, 0);
  ctx.lineTo(W * k - 360, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.restore();
  const s = back(prog(t, 0.5, 1.3));
  if (s > 0) star(900, 220, 110 * s, (1 - s) * 2, C.gold);
  headline(['CARTÃO', 'DE PONTO'], t, 0.4, 170, 420, [C.ink, C.red]);
  font(40, 700, 'text', 'condensed');
  text('o PT em dados · 1982–2026', 60, 700, C.ink, 'left', prog(t, 0.9, 1.3));
  font(26, 500, 'text');
  const a = prog(t, 1.2, 1.6);
  text('Eleições, bancada, mapa de 2026 e votações nominais,', 60, 790, C.ink, 'left', a);
  text('com método aberto e SQL no navegador.', 60, 828, C.ink, 'left', a);
  const b = back(prog(t, 1.6, 2.1));
  if (b > 0) {
    ctx.save();
    ctx.translate(60, 900);
    ctx.scale(b, b);
    rect(0, 0, 640, 84, C.gold);
    font(36, 800, 'text', 'condensed');
    text('github.com/jotape2709/PT-DATA', 24, 55, C.ink);
    ctx.restore();
  }
  font(22, 600, 'text', 'condensed');
  text('PROJETO INDEPENDENTE DE JOÃO PEDRO · DADOS DO TSE E DA CÂMARA', 60, 1070, C.ink, 'left', prog(t, 2.0, 2.4));
}

// ------------------------------------------------------------- timeline
const SCENES: [number, (t: number) => void][] = [
  [4.6, sceneTitle],
  [7.4, scenePres],
  [5.4, sceneCamara],
  [6.2, sceneVirada],
  [6.4, scenePunch],
  [5.0, sceneMapa],
  [4.6, sceneEnd],
];
export const DURATION = SCENES.reduce((a, [d]) => a + d, 0);

function wipe(k: number) {
  // A red-and-ink diagonal band sweeping left → right; k in [0,1].
  const x = -700 + k * (W + 1400);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x + 700, 0);
  ctx.lineTo(x + 300, H);
  ctx.lineTo(x - 400, H);
  ctx.closePath();
  ctx.fillStyle = C.red;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 700, 0);
  ctx.lineTo(x + 730, 0);
  ctx.lineTo(x + 330, H);
  ctx.lineTo(x + 300, H);
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
}

function seek(t: number) {
  let start = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const [d, fn] = SCENES[i];
    if (t < start + d || i === SCENES.length - 1) {
      fn(t - start);
      const end = start + d;
      // Wipe straddling each cut: second half at the start of a scene, first half at the end.
      if (i > 0 && t - start < 0.35) wipe(0.5 + (t - start) / 0.7);
      if (i < SCENES.length - 1 && end - t < 0.35) wipe((0.35 - (end - t)) / 0.7);
      return;
    }
    start += d;
  }
}

declare global {
  interface Window { seek: (t: number) => void; ready: Promise<void>; DURATION: number }
}
window.seek = seek;
window.DURATION = DURATION;
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('900 100px "Archivo"'),
    document.fonts.load('900 100px "Doto"'),
    document.fonts.load('700 20px "Martian Mono"'),
  ]);
  await document.fonts.ready;
})();

// Preview loop when opened in a browser.
window.ready.then(() => {
  if (document.body.classList.contains('render')) return;
  const t0 = performance.now();
  const loop = () => {
    seek(((performance.now() - t0) / 1000) % DURATION);
    requestAnimationFrame(loop);
  };
  loop();
});
