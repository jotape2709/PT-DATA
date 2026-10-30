"""
Gera as bases do site "Cartão de Ponto" (public/data/*.json).

Entradas
  etl/curated/historico.json   série nacional curada (presidência, Câmara), com fonte por linha
  data/snapshots/*.json        snapshots oficiais já agregados (TSE e API da Câmara)

Saídas
  public/data/historico.json   série nacional + indicadores calculados (margens, ganho entre turnos)
  public/data/listas_2026.json votos de cada lista para deputado federal em 2026, por UF
  public/data/plenario.json    votações nominais do Plenário (matriz deputado x votação)
  public/data/quality.json     relatório de integridade (escrito por etl/audit.py)

Só usa a biblioteca padrão do Python 3.10+.

Uso:
  python etl/derive.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

try:
    from .audit import audit_all, validate_dataset
    from .seats import allocate
except ImportError:  # executado como script
    from audit import audit_all, validate_dataset
    from seats import allocate

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "etl" / "curated" / "historico.json"
SNAP = ROOT / "data" / "snapshots"
OUT = ROOT / "public" / "data"

ALVO_2026 = "Federação PT/PC do B/PV"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(name: str, payload) -> None:
    validate_dataset(name, payload)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    print(f"gravado {path.relative_to(ROOT)} ({path.stat().st_size >> 10} KB)")


def build_historico(cur: dict) -> dict:
    pres = []
    for p in cur["presidencia"]:
        row = dict(p)
        t1, t2, adv = p["turno1"], p["turno2"], p["adversario"]
        if t2:
            row["ganhoEntreTurnos"] = {
                "votos": t2["votos"] - t1["votos"],
                "pontos": round(t2["pct"] - t1["pct"], 2),
            }
            if adv.get("votosTurno2"):
                row["margemTurno2"] = {
                    "votos": t2["votos"] - adv["votosTurno2"],
                    "pontos": round(t2["pct"] - (100 - t2["pct"]), 2),
                }
        pres.append(row)

    camara = []
    for c in cur["camara"]:
        row = dict(c)
        row["pctCadeiras"] = round(c["cadeiras"] * 100 / c["total"], 2)
        camara.append(row)

    return {
        "provenance": {
            "kind": "curado",
            "label": "Série nacional curada · TSE via fontes citadas linha a linha",
            "generatedAt": now_iso(),
        },
        "fundacao": cur["fundacao"],
        "presidencia": pres,
        "camara": camara,
        "federacao2026": cur["federacao2026"],
    }


def build_listas(cur: dict, sim: dict) -> dict:
    ufs = {}
    for uf, listas in sorted(sim["ufs"].items()):
        ufs[uf] = {"listas": dict(sorted(listas.items(), key=lambda kv: -kv[1]))}
    seats = cur["cadeirasPorUF"]
    modelo = {uf: allocate(v["listas"], seats[uf])["seats"].get(ALVO_2026, 0) for uf, v in ufs.items()}
    return {
        "provenance": {**sim["provenance"], "derivedAt": now_iso(), "via": "snapshot simulador_base.json (ETL Sol Vermelho, TSE)"},
        "ano": sim["year"],
        "alvo": ALVO_2026,
        "cadeirasPorUF": seats,
        "ufs": ufs,
        "modeloCadeirasAlvo": modelo,
    }


def build_plenario(cam: dict) -> dict:
    votes = [{"id": v["id"], "data": v["data"], "descricao": v["descricao"], "ballots": v["ballots"]} for v in cam["votes"]]
    return {
        "provenance": {**cam["provenance"], "derivedAt": now_iso(), "via": "snapshot camara.json (ETL Sol Vermelho, API da Câmara)"},
        "window": cam["window"],
        "deputies": cam["deputies"],
        "votes": votes,
    }


def main() -> None:
    cur = load(CURATED)
    write("historico.json", build_historico(cur))
    write("listas_2026.json", build_listas(cur, load(SNAP / "simulador_base.json")))
    write("plenario.json", build_plenario(load(SNAP / "camara.json")))
    report = audit_all(OUT, SNAP / "eleicoes.json")
    print(f"auditoria: {'ok' if report['passed'] else 'FALHOU'} · {sum(len(d['checks']) for d in report['datasets'])} verificações")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
