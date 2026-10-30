/**
 * Alocação proporcional simplificada da Câmara (Código Eleitoral, arts. 106 a 109).
 * Espelha etl/seats.py; a auditoria em Python reproduz os mesmos números.
 *
 * 1. QE = válidos / cadeiras, arredondando a fração para baixo quando <= 0,5.
 * 2. QP = floor(votos da lista / QE).
 * 3. Sobras pela maior média votos / (cadeiras + 1); pela regra de 2021,
 *    só listas com ao menos 80% do QE disputam as sobras.
 * 4. Se nenhuma lista atinge o QE, todas disputam pelas maiores médias.
 *
 * Os pisos individuais de candidatos (10% e 20% do QE) exigem votos por
 * candidato e não são modelados.
 */

export type Votes = Record<string, number>;
export type Allocation = { seats: Record<string, number>; qe: number };

export function quocienteEleitoral(valid: number, seats: number): number {
  if (seats <= 0) throw new Error('seats must be positive');
  const raw = valid / seats;
  const floor = Math.floor(raw);
  return raw - floor > 0.5 ? floor + 1 : floor;
}

export function allocate(votes: Votes, seats: number): Allocation {
  const lists = Object.keys(votes).filter((k) => votes[k] > 0);
  const valid = lists.reduce((s, k) => s + votes[k], 0);
  const res: Record<string, number> = Object.fromEntries(lists.map((k) => [k, 0]));
  if (!lists.length || valid === 0) return { seats: res, qe: 0 };

  const qe = quocienteEleitoral(valid, seats);
  let assigned = 0;
  for (const k of lists) {
    res[k] = qe ? Math.floor(votes[k] / qe) : 0;
    assigned += res[k];
  }
  const any = lists.some((k) => votes[k] >= qe);
  let eligible = any ? lists.filter((k) => votes[k] >= 0.8 * qe) : lists;
  if (!eligible.length) eligible = lists;

  for (let r = assigned; r < seats; r++) {
    let best = eligible[0];
    let bestAvg = -1;
    for (const k of eligible) {
      const avg = votes[k] / (res[k] + 1);
      if (avg > bestAvg || (avg === bestAvg && (votes[k] > votes[best] || (votes[k] === votes[best] && k < best)))) {
        best = k;
        bestAvg = avg;
      }
    }
    res[best] += 1;
  }
  return { seats: res, qe };
}

/** Seats of `target` after adding `delta` votes to it (negative removes votes). */
export function seatsWith(votes: Votes, seats: number, target: string, delta: number): number {
  const v = { ...votes, [target]: Math.max(0, (votes[target] ?? 0) + delta) };
  return allocate(v, seats).seats[target] ?? 0;
}

/**
 * Smallest number of extra votes that gives `target` one more seat, and the
 * largest loss it could absorb keeping its seats (both under the model).
 * Seat counts are monotonic in the list's own votes, so a binary search works.
 */
export function margins(votes: Votes, seats: number, target: string): { current: number; toNext: number | null; cushion: number } {
  const current = seatsWith(votes, seats, target, 0);
  const own = votes[target] ?? 0;
  const total = Object.values(votes).reduce((a, b) => a + b, 0);

  let toNext: number | null = null;
  if (current < seats) {
    let lo = 0;
    let hi = Math.max(1, total * 2);
    if (seatsWith(votes, seats, target, hi) > current) {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (seatsWith(votes, seats, target, mid) > current) hi = mid;
        else lo = mid;
      }
      toNext = hi;
    }
  }

  let cushion = own;
  if (current > 0) {
    let lo = 0;
    let hi = own;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (seatsWith(votes, seats, target, -mid) < current) hi = mid;
      else lo = mid;
    }
    cushion = lo;
  }
  return { current, toNext, cushion };
}
