import { describe, expect, it } from 'vitest';
import { encode, fitIrt } from '../src/engine/irt';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}

describe('IRT 1D', () => {
  it('recupera posições simuladas e orienta o grupo de referência à esquerda', () => {
    const r = rng(7);
    const n = 200, m = 120;
    const truth = Float64Array.from({ length: n }, () => (r() - 0.5) * 4);
    const ballots: string[] = [];
    for (let j = 0; j < m; j++) {
      const b = (r() < 0.5 ? -1 : 1) * (1 + r() * 2);
      const a = (r() - 0.5) * 3;
      let s = '';
      for (let i = 0; i < n; i++) {
        if (r() < 0.1) { s += '-'; continue; }
        const p = 1 / (1 + Math.exp(-(b * truth[i] - a)));
        s += r() < p ? 'S' : 'N';
      }
      ballots.push(s);
    }
    // Reference: the 30 deputies with the lowest true position.
    const ref = [...truth.keys()].sort((x, y) => truth[x] - truth[y]).slice(0, 30);
    const fit = fitIrt({ n, m, y: encode(ballots, n), ref });
    expect(pearson(fit.theta, truth)).toBeGreaterThan(0.95);
    expect(fit.accuracy).toBeGreaterThan(fit.baseline);
    expect(fit.accuracy).toBeGreaterThan(0.8);
  });
});
