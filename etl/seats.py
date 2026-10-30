"""
Alocação proporcional simplificada da Câmara (Código Eleitoral, arts. 106 a 109).

Espelha src/engine/seats.ts; os testes dos dois lados usam os mesmos casos.

1. QE = votos válidos / cadeiras, arredondando a fração para baixo quando <= 0,5.
2. QP = floor(votos da lista / QE).
3. Sobras uma a uma pela maior média votos / (cadeiras + 1). Regra de 2021:
   só disputam as sobras as listas com pelo menos 80% do QE.
4. Se nenhuma lista atinge o QE, todas disputam pelas maiores médias.

Não modela os pisos individuais de 10% e 20% do QE para candidatos.
"""

from __future__ import annotations

import math


def quociente_eleitoral(validos: int, cadeiras: int) -> int:
    if cadeiras <= 0:
        raise ValueError("cadeiras deve ser positivo")
    bruto = validos / cadeiras
    piso = math.floor(bruto)
    return piso + 1 if bruto - piso > 0.5 else piso


def allocate(votos: dict[str, int], cadeiras: int, regra: str = "2022") -> dict:
    listas = [k for k, v in votos.items() if v > 0]
    validos = sum(votos[k] for k in listas)
    res = {k: 0 for k in listas}
    if not listas or validos == 0:
        return {"seats": res, "qe": 0}
    qe = quociente_eleitoral(validos, cadeiras)
    for k in listas:
        res[k] = votos[k] // qe if qe else 0
    atribuidas = sum(res.values())
    alguma = any(votos[k] >= qe for k in listas)
    elegiveis = [k for k in listas if votos[k] >= 0.8 * qe] if regra == "2022" and alguma else list(listas)
    if not elegiveis:
        elegiveis = list(listas)
    for _ in range(atribuidas, cadeiras):
        melhor = max(elegiveis, key=lambda k: (votos[k] / (res[k] + 1), votos[k], [-ord(c) for c in k]))
        res[melhor] += 1
    return {"seats": res, "qe": qe}
