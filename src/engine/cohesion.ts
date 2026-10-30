import type { Plenario } from '../data/types';

/** +1 Sim, -1 Não (obstrução conta como Não), 0 abstenção, NaN ausente. */
export function ballotValue(c: string): number {
  if (c === 'S') return 1;
  if (c === 'N' || c === 'O') return -1;
  if (c === 'A') return 0;
  return NaN;
}

/** Majority position of a group in one roll call: +1, -1 or 0 when tied/empty. */
export function groupLine(ballots: string, idx: number[]): { line: number; yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const i of idx) {
    const v = ballotValue(ballots[i]);
    if (v === 1) yes++;
    else if (v === -1) no++;
  }
  return { line: Math.sign(yes - no), yes, no };
}

export type PartyStat = {
  partido: string;
  size: number;
  /** Rice: mean |yes − no| / (yes + no) over roll calls where the party voted. */
  rice: number;
  /** Share of roll calls in which the party majority matched the PT majority. */
  withPT: number;
  /** Number of roll calls with both majorities defined. */
  n: number;
};

export type DeputyStat = { i: number; withPT: number; n: number; present: number };

export type Divisive = { j: number; yes: number; no: number; rice: number };

export type CohesionResult = {
  parties: PartyStat[];
  deputies: DeputyStat[];
  ptIdx: number[];
  ptLines: number[];
  ptRice: number;
  ptFidelity: number;
  divisive: Divisive[];
};

export function partyIndex(p: Plenario): Map<string, number[]> {
  const m = new Map<string, number[]>();
  p.deputies.forEach((d, i) => {
    if (!m.has(d.partido)) m.set(d.partido, []);
    m.get(d.partido)!.push(i);
  });
  return m;
}

export function computeCohesion(p: Plenario, ref = 'PT'): CohesionResult {
  const groups = partyIndex(p);
  const ptIdx = groups.get(ref) ?? [];
  const ptStats = p.votes.map((v) => groupLine(v.ballots, ptIdx));
  const ptLines = ptStats.map((s) => s.line);

  const parties: PartyStat[] = [];
  for (const [partido, idx] of groups) {
    let riceSum = 0;
    let riceN = 0;
    let hit = 0;
    let n = 0;
    p.votes.forEach((v, j) => {
      const g = groupLine(v.ballots, idx);
      if (g.yes + g.no > 0) {
        riceSum += Math.abs(g.yes - g.no) / (g.yes + g.no);
        riceN++;
      }
      if (g.line !== 0 && ptLines[j] !== 0) {
        n++;
        if (g.line === ptLines[j]) hit++;
      }
    });
    parties.push({ partido, size: idx.length, rice: riceN ? riceSum / riceN : NaN, withPT: n ? hit / n : NaN, n });
  }
  parties.sort((a, b) => b.size - a.size || a.partido.localeCompare(b.partido));

  const deputies: DeputyStat[] = p.deputies.map((_, i) => {
    let hit = 0;
    let n = 0;
    let present = 0;
    p.votes.forEach((v, j) => {
      const val = ballotValue(v.ballots[i]);
      if (!Number.isNaN(val)) present++;
      if (val !== 0 && !Number.isNaN(val) && ptLines[j] !== 0) {
        n++;
        if (val === ptLines[j]) hit++;
      }
    });
    return { i, withPT: n ? hit / n : NaN, n, present };
  });

  let fh = 0;
  let ft = 0;
  for (const i of ptIdx) {
    fh += deputies[i].withPT * deputies[i].n || 0;
    ft += deputies[i].n;
  }

  const divisive: Divisive[] = ptStats
    .map((s, j) => ({ j, yes: s.yes, no: s.no, rice: s.yes + s.no ? Math.abs(s.yes - s.no) / (s.yes + s.no) : 1 }))
    .filter((d) => d.yes + d.no >= 10)
    .sort((a, b) => a.rice - b.rice || b.yes + b.no - (a.yes + a.no))
    .slice(0, 6);

  const ptRice = parties.find((x) => x.partido === ref)?.rice ?? NaN;
  return { parties, deputies, ptIdx, ptLines, ptRice, ptFidelity: ft ? fh / ft : NaN, divisive };
}
