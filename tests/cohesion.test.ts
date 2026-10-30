import { describe, expect, it } from 'vitest';
import { ballotValue, computeCohesion, groupLine } from '../src/engine/cohesion';
import type { Plenario } from '../src/data/types';

const plen: Plenario = {
  provenance: { kind: 't', label: 't', generatedAt: '' },
  window: { from: '2026-01-01', to: '2026-01-03' },
  deputies: [
    { id: 1, nome: 'a', partido: 'PT', uf: 'SP' },
    { id: 2, nome: 'b', partido: 'PT', uf: 'BA' },
    { id: 3, nome: 'c', partido: 'PT', uf: 'MG' },
    { id: 4, nome: 'd', partido: 'PL', uf: 'RJ' },
    { id: 5, nome: 'e', partido: 'PL', uf: 'SC' },
  ],
  votes: [
    { id: 'v1', data: '2026-01-01', descricao: '', ballots: 'SSSNN' },
    { id: 'v2', data: '2026-01-02', descricao: '', ballots: 'SSNNO' },
    { id: 'v3', data: '2026-01-03', descricao: '', ballots: 'NN-SS' },
  ],
};

describe('cohesion', () => {
  it('codifica votos: obstrução conta como não, ausência é NaN', () => {
    expect(ballotValue('S')).toBe(1);
    expect(ballotValue('O')).toBe(-1);
    expect(ballotValue('A')).toBe(0);
    expect(Number.isNaN(ballotValue('-'))).toBe(true);
  });

  it('linha do grupo é o sinal de sim − não', () => {
    expect(groupLine('SSN--', [0, 1, 2]).line).toBe(1);
    expect(groupLine('SN---', [0, 1]).line).toBe(0);
  });

  it('calcula Rice, concordância entre partidos e fidelidade', () => {
    const r = computeCohesion(plen);
    const pt = r.parties.find((p) => p.partido === 'PT')!;
    // v1: 3-0 → 1; v2: 2-1 → 1/3; v3: 0-2 → 1  → média 7/9
    expect(pt.rice).toBeCloseTo(7 / 9, 6);
    const pl = r.parties.find((p) => p.partido === 'PL')!;
    expect(pl.withPT).toBe(0); // sempre contra a maioria do PT
    // Deputado c (i=2) votou contra a maioria do PT em v2 e esteve ausente em v3.
    expect(r.deputies[2].n).toBe(2);
    expect(r.deputies[2].withPT).toBeCloseTo(0.5, 6);
    expect(r.ptFidelity).toBeCloseTo(7 / 8, 6);
    expect(r.divisive.length).toBe(0); // menos de 10 votos por votação
  });
});
