import { describe, expect, it } from 'vitest';
import { allocate, margins, quocienteEleitoral, seatsWith } from '../src/engine/seats';
import listas from '../public/data/listas_2026.json';

describe('quociente eleitoral', () => {
  it('arredonda a fração para baixo até 0,5 e para cima acima disso', () => {
    expect(quocienteEleitoral(1050, 10)).toBe(105);
    expect(quocienteEleitoral(1055, 10)).toBe(105); // 105,5 → 105
    expect(quocienteEleitoral(1056, 10)).toBe(106); // 105,6 → 106
  });
});

describe('allocate', () => {
  it('distribui exatamente as cadeiras e respeita o piso de 80% do QE nas sobras', () => {
    // QE = 100. C tem 79 votos (< 80% do QE) e fica fora das sobras.
    const r = allocate({ A: 520, B: 401, C: 79 }, 10);
    expect(r.qe).toBe(100);
    expect(Object.values(r.seats).reduce((a, b) => a + b, 0)).toBe(10);
    expect(r.seats.C).toBe(0);
    expect(r.seats).toEqual({ A: 6, B: 4, C: 0 });
  });

  it('sem lista que atinja o QE, todas disputam pelas maiores médias', () => {
    const r = allocate({ A: 30, B: 30, C: 30, D: 10 }, 2);
    expect(Object.values(r.seats).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('reproduz o modelo gravado pela auditoria em Python (2026, 27 UFs)', () => {
    for (const [uf, v] of Object.entries(listas.ufs)) {
      const seats = (listas.cadeirasPorUF as Record<string, number>)[uf];
      const r = allocate(v.listas as Record<string, number>, seats);
      expect(Object.values(r.seats).reduce((a, b) => a + b, 0)).toBe(seats);
      expect(r.seats[listas.alvo] ?? 0).toBe((listas.modeloCadeirasAlvo as Record<string, number>)[uf]);
    }
  });
});

describe('margins', () => {
  it('encontra o menor acréscimo que rende mais uma cadeira e a folga até perder uma', () => {
    const v = { A: 520, B: 401, C: 79 };
    const m = margins(v, 10, 'B');
    expect(m.current).toBe(4);
    expect(m.toNext).not.toBeNull();
    expect(seatsWith(v, 10, 'B', m.toNext!)).toBe(5);
    expect(seatsWith(v, 10, 'B', m.toNext! - 1)).toBe(4);
    expect(seatsWith(v, 10, 'B', -m.cushion)).toBe(4);
    expect(seatsWith(v, 10, 'B', -(m.cushion + 1))).toBe(3);
  });
});
