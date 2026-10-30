"""
Auditoria de consistência das bases publicadas em public/data/.

Verifica esquemas, intervalos e conciliações entre arquivos e grava
public/data/quality.json com as verificações, tamanhos e SHA-256.
Mede consistência interna; não certifica cada registro contra a fonte oficial.

Uso:
  python etl/audit.py
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

try:
    from .seats import allocate
except ImportError:
    from seats import allocate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
SNAP_ELEICOES = ROOT / "data" / "snapshots" / "eleicoes.json"

UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
    "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
}
BALLOT_CHARS = set("SNAO-")


class AuditError(ValueError):
    pass


def _need(cond: bool, msg: str) -> str:
    if not cond:
        raise AuditError(msg)
    return msg


def check_historico(d: dict) -> list[str]:
    ok: list[str] = []
    pres = d["presidencia"]
    ok.append(_need(len(pres) >= 10, "10 eleições presidenciais desde 1989"))
    anos = [p["ano"] for p in pres]
    ok.append(_need(anos == sorted(anos) and len(set(anos)) == len(anos), "anos presidenciais únicos e em ordem"))
    for p in pres:
        t1, t2 = p["turno1"], p["turno2"]
        _need(0 < t1["pct"] < 100 and t1["votos"] > 0, f"{p['ano']}: 1º turno válido")
        _need(t1["posicao"] in (1, 2), f"{p['ano']}: posição no 1º turno é 1 ou 2")
        if t2:
            _need(t2["votos"] > t1["votos"], f"{p['ano']}: 2º turno maior que o 1º em votos")
            adv = p["adversario"].get("votosTurno2")
            if adv:
                calc = t2["votos"] * 100 / (t2["votos"] + adv)
                _need(abs(calc - t2["pct"]) < 0.02, f"{p['ano']}: % do 2º turno confere com os votos ({calc:.2f} vs {t2['pct']})")
            venceu = t2["pct"] > 50
        else:
            venceu = t1["pct"] > 50
        _need((p["resultado"] == "vitória") == venceu, f"{p['ano']}: resultado coerente com o percentual")
    ok.append("percentuais do 2º turno conciliados com os votos dos dois finalistas")
    ok.append("resultado de cada eleição coerente com o percentual de votos válidos")
    cam = d["camara"]
    for c in cam:
        _need(0 < c["cadeiras"] <= c["total"], f"Câmara {c['ano']}: cadeiras dentro do total")
        if c["pct"] is not None:
            _need(0 < c["pct"] < 100, f"Câmara {c['ano']}: % de votos plausível")
    ok.append(f"Câmara: {len(cam)} eleições com cadeiras dentro do total da Casa")
    for row in pres + cam:
        _need(str(row.get("fonte", "")).startswith("https://"), f"{row['ano']}: fonte citada")
    ok.append("toda linha da série cita uma fonte https")
    return ok


def check_listas(d: dict, validos_snapshot: dict | None) -> list[str]:
    ok: list[str] = []
    ufs = d["ufs"]
    ok.append(_need(set(ufs) == UFS, "27 unidades federativas presentes"))
    seats = d["cadeirasPorUF"]
    ok.append(_need(set(seats) == UFS and sum(seats.values()) == 513, "513 cadeiras distribuídas pelas 27 UFs"))
    alvo = d["alvo"]
    for uf, v in ufs.items():
        _need(all(isinstance(x, int) and x >= 0 for x in v["listas"].values()), f"{uf}: votos inteiros e não negativos")
        _need(alvo in v["listas"], f"{uf}: lista-alvo presente")
    ok.append(f"lista-alvo ({alvo}) presente nas 27 UFs")
    if validos_snapshot:
        for uf, v in ufs.items():
            soma = sum(v["listas"].values())
            _need(soma == validos_snapshot.get(uf), f"{uf}: soma das listas = válidos do snapshot ({soma} vs {validos_snapshot.get(uf)})")
        ok.append("soma das listas conciliada com os votos válidos de 2026 em cada UF")
    for uf, v in ufs.items():
        res = allocate(v["listas"], seats[uf])["seats"]
        _need(sum(res.values()) == seats[uf], f"{uf}: modelo distribui exatamente {seats[uf]} cadeiras")
        _need(res.get(alvo, 0) == d["modeloCadeirasAlvo"][uf], f"{uf}: cadeiras do modelo reproduzidas")
    ok.append("modelo de cadeiras reproduzido na auditoria e fechando o total de cada UF")
    return ok


def check_plenario(d: dict) -> list[str]:
    ok: list[str] = []
    n = len(d["deputies"])
    ok.append(_need(n > 500, f"{n} deputados na janela"))
    ids = [x["id"] for x in d["deputies"]]
    ok.append(_need(len(set(ids)) == n, "ids de deputados únicos"))
    for x in d["deputies"]:
        _need(x["uf"] in UFS and x["partido"], f"deputado {x['id']}: UF e partido válidos")
    ok.append("todo deputado tem UF válida e partido")
    vids = set()
    for v in d["votes"]:
        _need(len(v["ballots"]) == n, f"votação {v['id']}: uma marca por deputado")
        _need(set(v["ballots"]) <= BALLOT_CHARS, f"votação {v['id']}: marcas S/N/A/O/-")
        _need(re.fullmatch(r"\d{4}-\d{2}-\d{2}", v["data"]) is not None, f"votação {v['id']}: data ISO")
        _need(d["window"]["from"] <= v["data"] <= d["window"]["to"], f"votação {v['id']}: dentro da janela")
        vids.add(v["id"])
    ok.append(_need(len(vids) == len(d["votes"]), f"{len(vids)} votações nominais com id único"))
    ok.append("cada votação tem uma marca por deputado, data ISO dentro da janela")
    presentes = min(sum(c != "-" for c in v["ballots"]) for v in d["votes"])
    ok.append(_need(presentes >= 200, f"toda votação tem ao menos 200 votos registrados (mínimo {presentes})"))
    return ok


CHECKS = {
    "historico.json": lambda d, ctx: check_historico(d),
    "listas_2026.json": lambda d, ctx: check_listas(d, ctx.get("validos2026")),
    "plenario.json": lambda d, ctx: check_plenario(d),
}


def validate_dataset(name: str, payload: dict, ctx: dict | None = None) -> list[str]:
    fn = CHECKS.get(name)
    if not fn:
        return []
    return fn(payload, ctx or _context())


def _context() -> dict:
    if not SNAP_ELEICOES.exists():
        return {}
    e = json.loads(SNAP_ELEICOES.read_text(encoding="utf-8"))
    y = next((x for x in e["elections"] if x["year"] == 2026), None)
    return {"validos2026": (y or {}).get("camara", {}).get("validByUF")}


def audit_all(out: Path = OUT, snap_eleicoes: Path = SNAP_ELEICOES) -> dict:
    ctx = _context() if snap_eleicoes == SNAP_ELEICOES else {}
    datasets, passed, cross = [], True, []
    for name in CHECKS:
        path = out / name
        raw = path.read_bytes()
        try:
            checks = validate_dataset(name, json.loads(raw), ctx)
        except AuditError as err:
            checks, passed = [f"FALHA: {err}"], False
        datasets.append({"file": name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "checks": checks})
    try:
        hist = json.loads((out / "historico.json").read_text(encoding="utf-8"))
        lis = json.loads((out / "listas_2026.json").read_text(encoding="utf-8"))
        modelo = sum(lis["modeloCadeirasAlvo"].values())
        real = hist["federacao2026"]["cadeirasReais"]
        cross.append(f"Modelo de cadeiras: {modelo} para a federação vs {real} reais em 2026 (diferença {modelo - real:+d})")
        _need(abs(modelo - real) <= 8, "modelo de cadeiras a até 8 cadeiras do resultado real da federação")
        cross.append("Modelo de cadeiras dentro da tolerância de 8 cadeiras do resultado oficial")
    except (AuditError, KeyError, FileNotFoundError) as err:
        cross.append(f"FALHA: {err}")
        passed = False
    report = {
        "scope": "Consistência interna dos snapshots; não certifica registros contra as fontes oficiais.",
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "passed": passed,
        "crossFileChecks": cross,
        "datasets": datasets,
    }
    (out / "quality.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report


if __name__ == "__main__":
    r = audit_all()
    for d in r["datasets"]:
        print(f"{d['file']}: {len(d['checks'])} verificações")
    for c in r["crossFileChecks"]:
        print(c)
    raise SystemExit(0 if r["passed"] else 1)
