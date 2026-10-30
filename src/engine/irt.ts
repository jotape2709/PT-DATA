/**
 * Pontos ideais em uma dimensão (modelo IRT de dois parâmetros, estimação MAP).
 *
 *   P(Sim_ij) = σ(β_j · θ_i − α_j)
 *
 * θ_i  posição do deputado i (priori N(0, 1))
 * α_j  dificuldade da votação j, β_j discriminação (priori N(0, 25))
 *
 * Sim = 1; Não e Obstrução = 0; abstenções e ausências ficam de fora.
 * Estimação por ascensão alternada: um passo de Newton por parâmetro,
 * com θ re-padronizado a cada iteração (o modelo só é identificado até
 * translação, escala e sinal). O sinal é fixado pela mediana de um grupo de
 * referência, à esquerda do eixo.
 */

export type IrtInput = { n: number; m: number; y: Int8Array; ref?: number[] };
export type IrtResult = {
  theta: Float64Array;
  alpha: Float64Array;
  beta: Float64Array;
  /** Cutting point of each roll call on the θ axis: α/β (NaN when β≈0). */
  cut: Float64Array;
  /** Share of observed votes classified correctly by p > 0.5. */
  accuracy: number;
  /** Same metric for the naive model that predicts each roll call's majority. */
  baseline: number;
  iterations: number;
  logLik: number;
};

const MISSING = -1;

/** Encodes ballot strings into the 0/1/missing matrix (n deputies × m votes, row-major). */
export function encode(ballots: string[], n: number): Int8Array {
  const m = ballots.length;
  const y = new Int8Array(n * m).fill(MISSING);
  for (let j = 0; j < m; j++) {
    const b = ballots[j];
    for (let i = 0; i < n; i++) {
      const c = b[i];
      if (c === 'S') y[i * m + j] = 1;
      else if (c === 'N' || c === 'O') y[i * m + j] = 0;
    }
  }
  return y;
}

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

export function fitIrt({ n, m, y, ref = [] }: IrtInput, maxIter = 60, tol = 1e-5): IrtResult {
  const theta = new Float64Array(n);
  const alpha = new Float64Array(m);
  const beta = new Float64Array(m);

  // Start: θ from each deputy's agreement with the roll-call majorities, standardized.
  const maj = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const v = y[i * m + j];
      if (v !== MISSING) {
        s += v;
        c++;
      }
    }
    maj[j] = c ? s / c : 0.5;
  }
  // Use the reference group's line to give the start a direction.
  const refLine = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let s = 0;
    for (const i of ref) {
      const v = y[i * m + j];
      if (v !== MISSING) s += v ? 1 : -1;
    }
    refLine[j] = Math.sign(s);
  }
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = 0; j < m; j++) {
      const v = y[i * m + j];
      if (v === MISSING || refLine[j] === 0) continue;
      s += (v ? 1 : -1) === refLine[j] ? -1 : 1;
      c++;
    }
    theta[i] = c ? s / c : 0;
  }
  standardize(theta);
  for (let j = 0; j < m; j++) {
    beta[j] = 1;
    alpha[j] = -Math.log(Math.max(1e-3, maj[j]) / Math.max(1e-3, 1 - maj[j]));
  }

  const PRIOR_AB = 1 / 25;
  let prevLL = -Infinity;
  let it = 0;
  let ll = 0;
  for (; it < maxIter; it++) {
    // Votes: 2-parameter Newton step on (β, α) with a ridge prior.
    for (let j = 0; j < m; j++) {
      let gB = -PRIOR_AB * beta[j];
      let gA = -PRIOR_AB * alpha[j];
      let hBB = -PRIOR_AB;
      let hAA = -PRIOR_AB;
      let hAB = 0;
      for (let i = 0; i < n; i++) {
        const v = y[i * m + j];
        if (v === MISSING) continue;
        const t = theta[i];
        const p = sigmoid(beta[j] * t - alpha[j]);
        const r = v - p;
        const w = p * (1 - p);
        gB += r * t;
        gA -= r;
        hBB -= w * t * t;
        hAA -= w;
        hAB += w * t;
      }
      const det = hBB * hAA - hAB * hAB;
      if (det > 1e-12) {
        const dB = (hAA * gB - hAB * gA) / det;
        const dA = (hBB * gA - hAB * gB) / det;
        beta[j] -= clamp(dB, 2);
        alpha[j] -= clamp(dA, 2);
      }
    }
    // Deputies: 1-parameter Newton step on θ with a N(0,1) prior.
    for (let i = 0; i < n; i++) {
      let g = -theta[i];
      let h = -1;
      const row = i * m;
      for (let j = 0; j < m; j++) {
        const v = y[row + j];
        if (v === MISSING) continue;
        const p = sigmoid(beta[j] * theta[i] - alpha[j]);
        g += (v - p) * beta[j];
        h -= p * (1 - p) * beta[j] * beta[j];
      }
      theta[i] -= clamp(g / h, 1.5);
    }
    // Identification: θ ~ (0, 1); β and α absorb the affine change.
    const { mean, sd } = standardize(theta);
    for (let j = 0; j < m; j++) {
      alpha[j] -= beta[j] * mean;
      beta[j] *= sd;
    }
    ll = logLik(y, n, m, theta, alpha, beta);
    if (Math.abs(ll - prevLL) < tol * Math.abs(ll)) {
      it++;
      break;
    }
    prevLL = ll;
  }

  // Orientation: the reference group sits on the negative side.
  if (ref.length && median(ref.map((i) => theta[i])) > 0) {
    for (let i = 0; i < n; i++) theta[i] = -theta[i];
    for (let j = 0; j < m; j++) beta[j] = -beta[j];
  }

  const cut = new Float64Array(m);
  for (let j = 0; j < m; j++) cut[j] = Math.abs(beta[j]) > 1e-6 ? alpha[j] / beta[j] : NaN;

  let ok = 0;
  let base = 0;
  let tot = 0;
  for (let j = 0; j < m; j++) {
    const majority = maj[j] >= 0.5 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const v = y[i * m + j];
      if (v === MISSING) continue;
      tot++;
      const pred = sigmoid(beta[j] * theta[i] - alpha[j]) > 0.5 ? 1 : 0;
      if (pred === v) ok++;
      if (majority === v) base++;
    }
  }
  return { theta, alpha, beta, cut, accuracy: tot ? ok / tot : NaN, baseline: tot ? base / tot : NaN, iterations: it, logLik: ll };
}

function clamp(x: number, lim: number): number {
  return Number.isFinite(x) ? Math.max(-lim, Math.min(lim, x)) : 0;
}

function standardize(x: Float64Array): { mean: number; sd: number } {
  let s = 0;
  for (const v of x) s += v;
  const mean = s / x.length;
  let q = 0;
  for (const v of x) q += (v - mean) ** 2;
  const sd = Math.sqrt(q / x.length) || 1;
  for (let i = 0; i < x.length; i++) x[i] = (x[i] - mean) / sd;
  return { mean, sd };
}

function logLik(y: Int8Array, n: number, m: number, th: Float64Array, a: Float64Array, b: Float64Array): number {
  let ll = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const v = y[i * m + j];
      if (v === MISSING) continue;
      const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(b[j] * th[i] - a[j])));
      ll += v ? Math.log(p) : Math.log(1 - p);
    }
  }
  return ll;
}
