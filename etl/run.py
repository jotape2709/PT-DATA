"""
ETL completo do "Cartão de Ponto · o PT em dados".

Baixa os arquivos abertos do TSE e a API de Dados Abertos da Câmara e grava,
em data/snapshots/, os agregados que etl/derive.py transforma nas bases do site:

  eleicoes.json         por ano: eleitos do PT por UF, votos do PT e válidos por UF (Câmara)
  simulador_base.json   votos de cada lista por UF na eleição mais recente (mapa de 2026)
  presidente_uf.json    votos do candidato do PT e válidos por UF, em cada turno
  financas.json         receitas declaradas pelas candidaturas do PT, por fonte
  camara.json           votações nominais do Plenário, com a orientação do PT

Só usa a biblioteca padrão do Python 3.10+. Os arquivos brutos ficam em
etl/.cache/ (fora do versionamento). Depois rode `python etl/derive.py`.

Uso:
  python etl/run.py                                 # tudo, anos padrão
  python etl/run.py --so camara --dias 365
  python etl/run.py --so eleicoes --anos 2018 2022 2026
  python etl/run.py --so presidencia --anos 1998 2002 2006 2010 2014 2018 2022 2026
  python etl/run.py --so financas --anos 2014 2018 2022 2026
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "snapshots"
CACHE = Path(__file__).resolve().parent / ".cache"

TSE = "https://cdn.tse.jus.br/estatistica/sead/odsele"
CAMARA = "https://dadosabertos.camara.leg.br/api/v2"

PARTIDO = "PT"
ANOS_GERAIS = [2006, 2010, 2014, 2018, 2022, 2026]
ANOS_PRESIDENCIA = [1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026]
CARGO_PRESIDENTE = "1"
CARGO_DEP_FEDERAL = "6"
NULOS = {"", "#NULO#", "#NULO", "#NE#", "#NE", "-1", "-3"}
UFS = {
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
    "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
}
BALLOT = {"Sim": "S", "Não": "N", "Abstenção": "A", "Obstrução": "O"}

csv.field_size_limit(sys.maxsize if sys.maxsize < 2**31 else 2**31 - 1)


# --------------------------------------------------------------------- util


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.upper().split())


def download(url: str, dest: Path, retries: int = 4) -> Path | None:
    """Baixa `url` uma vez para o cache. Devolve None quando o arquivo não existe."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cartao-de-ponto-etl/1.0"})
            with urllib.request.urlopen(req, timeout=120) as res, open(tmp, "wb") as fh:
                total = int(res.headers.get("Content-Length") or 0)
                done, last = 0, time.time()
                while chunk := res.read(1 << 20):
                    fh.write(chunk)
                    done += len(chunk)
                    if time.time() - last > 2:
                        pct = f" {done * 100 // total}%" if total else ""
                        log(f"  baixando {dest.name}: {done >> 20} MB{pct}")
                        last = time.time()
            tmp.replace(dest)
            return dest
        except urllib.error.HTTPError as err:
            if err.code in (403, 404):
                log(f"  indisponível ({err.code}): {url}")
                return None
            log(f"  erro HTTP {err.code}, nova tentativa ({attempt + 1}/{retries})")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            log(f"  falha de rede ({err}), nova tentativa ({attempt + 1}/{retries})")
        time.sleep(2 ** (attempt + 1))
    return None


def get_json(url: str, retries: int = 4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "cartao-de-ponto-etl/1.0"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            if err.code != 429 and err.code < 500:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f"Falha ao ler {url}")


def pick_members(zf: zipfile.ZipFile, prefix: str) -> list[str]:
    """CSVs de um zip do TSE: o arquivo nacional (_BRASIL) quando existe, senão um por UF."""
    names = [n for n in zf.namelist() if Path(n).name.lower().startswith(prefix) and n.lower().endswith((".csv", ".txt"))]
    brasil = [n for n in names if "_BRASIL" in n.upper()]
    if brasil:
        return brasil
    return [n for n in names if Path(n).stem.split("_")[-1].upper() in UFS] or names


def read_rows(zf: zipfile.ZipFile, member: str):
    with zf.open(member) as raw:
        yield from read_csv(io.TextIOWrapper(raw, encoding="latin-1", newline=""))


def read_csv(text) -> "iter[dict]":
    reader = csv.reader(text, delimiter=";", quotechar='"')
    header = [" ".join(h.split()).upper() for h in next(reader)]
    for row in reader:
        if len(row) == len(header):
            yield dict(zip(header, row))


def to_int(v: str) -> int:
    try:
        return int(float((v or "0").replace(",", ".")))
    except ValueError:
        return 0


def to_float_br(v: str) -> float:
    try:
        return float((v or "0").replace(".", "").replace(",", ".")) if "," in (v or "") else float(v or 0)
    except ValueError:
        return 0.0


def first_key(row: dict, *keys: str) -> str | None:
    return next((k for k in keys if k in row), None)


def write(name: str, payload) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    log(f"gravado {path.relative_to(ROOT)} ({path.stat().st_size >> 10} KB)")


# ------------------------------------------------------------- agregadores


def list_key(row: dict) -> str:
    """Lista que disputa a proporcional: federação (2022+), coligação (até 2018) ou partido."""
    fed = row.get("SG_FEDERACAO", "")
    if fed and fed.upper() not in NULOS:
        return f"Federação {fed}"
    tipo = norm(row.get("TP_AGREMIACAO", ""))
    col = row.get("NM_COLIGACAO", "")
    if tipo.startswith("COLIGACAO") and col and col.upper() not in NULOS:
        return f"Coligação {col}"
    return row.get("SG_PARTIDO", "?")


def row_votes(row: dict) -> int:
    k_nom = first_key(row, "QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOMINAIS")
    k_leg = first_key(row, "QT_TOTAL_VOTOS_LEG_VALIDOS", "QT_VOTOS_LEGENDA_VALIDOS", "QT_VOTOS_LEGENDA")
    return (to_int(row[k_nom]) if k_nom else 0) + (to_int(row[k_leg]) if k_leg else 0)


def aggregate_votacao(rows, partido: str = PARTIDO) -> dict:
    """Agrega linhas de votacao_partido_munzona: Câmara (1º turno) e Presidência (turnos 1 e 2)."""
    cam_pt: dict[str, int] = defaultdict(int)
    cam_val: dict[str, int] = defaultdict(int)
    listas: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    pres: dict[str, dict[str, list[int]]] = {"1": defaultdict(lambda: [0, 0]), "2": defaultdict(lambda: [0, 0])}
    for row in rows:
        votos = row_votes(row)
        if not votos:
            continue
        uf = row.get("SG_UF", "")
        if uf not in UFS:
            continue  # exterior (ZZ) e linhas de totalização ficam fora
        turno = row.get("NR_TURNO", "1")
        cargo = row.get("CD_CARGO", "")
        sigla = row.get("SG_PARTIDO", "").upper()
        if cargo == CARGO_PRESIDENTE and turno in pres:
            pres[turno][uf][1] += votos
            if sigla == partido:
                pres[turno][uf][0] += votos
        elif cargo == CARGO_DEP_FEDERAL and turno == "1":
            cam_val[uf] += votos
            listas[uf][list_key(row)] += votos
            if sigla == partido:
                cam_pt[uf] += votos
    return {
        "camara": {"votesByUF": dict(cam_pt), "validByUF": dict(cam_val)},
        "listas": {uf: dict(v) for uf, v in listas.items()},
        "presidente": {t: {uf: v for uf, v in d.items()} for t, d in pres.items() if d},
    }


def aggregate_candidatos(rows, partido: str = PARTIDO) -> dict:
    """Eleitos do partido para a Câmara, por UF."""
    eleitos: dict[str, list[str]] = defaultdict(list)
    vistos: set[str] = set()
    for row in rows:
        if row.get("SG_PARTIDO", "").upper() != partido or row.get("NR_TURNO", "1") != "1":
            continue
        if row.get("CD_CARGO", "") != CARGO_DEP_FEDERAL:
            continue
        sq = row.get("SQ_CANDIDATO", "")
        if sq in vistos:
            continue
        vistos.add(sq)
        sit = norm(row.get("DS_SIT_TOT_TURNO", ""))
        if sit.startswith("ELEITO") or sit == "MEDIA":  # até 2010 o TSE marca sobras como "MÉDIA"
            eleitos[row.get("SG_UF", "")].append((row.get("NM_URNA_CANDIDATO") or row.get("NM_CANDIDATO") or "").title())
    return dict(eleitos)


# ------------------------------------------------------------------ etapas


def etapa_eleicoes(anos: list[int]) -> None:
    eleicoes, presid = [], {}
    base = None
    for ano in anos:
        log(f"Eleição {ano}")
        pv = download(f"{TSE}/votacao_partido_munzona/votacao_partido_munzona_{ano}.zip", CACHE / f"votacao_partido_munzona_{ano}.zip")
        pc = download(f"{TSE}/consulta_cand/consulta_cand_{ano}.zip", CACHE / f"consulta_cand_{ano}.zip")
        if not pv and not pc:
            log(f"  {ano}: arquivos ainda não publicados pelo TSE")
            continue
        e: dict = {"year": ano, "status": "confirmado", "camara": {}}
        if pc:
            zf = zipfile.ZipFile(pc)
            el = aggregate_candidatos(r for m in pick_members(zf, "consulta_cand") for r in read_rows(zf, m))
            by_uf = {uf: len(n) for uf, n in el.items()}
            e["camara"].update({"seats": sum(by_uf.values()), "byUF": by_uf, "names": el})
        if pv:
            zf = zipfile.ZipFile(pv)
            agg = aggregate_votacao(r for m in pick_members(zf, "votacao_partido_munzona") for r in read_rows(zf, m))
            e["camara"].update(agg["camara"])
            if agg["presidente"]:
                presid[str(ano)] = agg["presidente"]
            if agg["listas"]:
                base = {"year": ano, "ufs": agg["listas"]}
        eleicoes.append(e)
        log(f"  {ano}: {e['camara'].get('seats', '?')} deputados eleitos pelo {PARTIDO}")

    prov = {"kind": "tse", "label": "TSE · Portal de Dados Abertos", "generatedAt": now_iso()}
    if eleicoes:
        write("eleicoes.json", {"provenance": prov, "partido": PARTIDO, "elections": eleicoes})
    if presid:
        write("presidente_uf.json", {"provenance": {**prov, "label": "TSE · votos para presidente por UF e turno"}, "partido": PARTIDO, "anos": presid})
    if base:
        write("simulador_base.json", {"provenance": {**prov, "label": f"TSE · votos para deputado federal {base['year']}"}, **base})


FONTES = [("ESPECIAL", "Fundo Eleitoral (FEFC)"), ("PARTIDARIO", "Fundo Partidário")]


def classificar(fonte: str, origem: str) -> str | None:
    f, o = norm(fonte), norm(origem)
    if "OUTROS CANDIDATOS" in o:
        return None  # repasses entre candidatos contariam duas vezes
    for chave, rotulo in FONTES:
        if chave in f:
            return rotulo
    if "FINANCIAMENTO COLETIVO" in o or "INTERNET" in o:
        return "Financiamento coletivo"
    if "PESSOAS FISICAS" in o or "PESSOA FISICA" in o:
        return "Pessoas físicas"
    if "PROPRIOS" in o:
        return "Recursos próprios"
    return "Outros"


def etapa_financas(anos: list[int]) -> None:
    out = {}
    for ano in [a for a in anos if a >= 2014]:
        log(f"Finanças {ano}")
        p = None
        for nome in (f"prestacao_de_contas_eleitorais_candidatos_{ano}.zip", f"prestacao_contas_final_{ano}.zip", f"prestacao_final_{ano}.zip"):
            p = download(f"{TSE}/prestacao_contas/{nome}", CACHE / nome)
            if p:
                break
        if not p:
            continue
        zf = zipfile.ZipFile(p)
        membros = [m for m in (pick_members(zf, f"receitas_candidatos_{ano}") or pick_members(zf, "receitas_candidatos")) if "doador_originario" not in m.lower()]
        fontes: dict[str, float] = defaultdict(float)
        cands: set[str] = set()
        for m in membros:
            for row in read_rows(zf, m):
                if (row.get("SG_PARTIDO") or row.get("SIGLA PARTIDO", "")).upper() != PARTIDO:
                    continue
                k_val = first_key(row, "VR_RECEITA", "VALOR RECEITA")
                rot = classificar(row.get("DS_FONTE_RECEITA") or row.get("FONTE RECURSO", ""), row.get("DS_ORIGEM_RECEITA") or row.get("TIPO RECEITA", ""))
                if not k_val or not rot:
                    continue
                fontes[rot] += to_float_br(row[k_val])
                cands.add(row.get("SQ_CANDIDATO") or row.get("SEQUENCIAL CANDIDATO", ""))
        if fontes:
            out[str(ano)] = {"total": round(sum(fontes.values()), 2), "fontes": {k: round(v, 2) for k, v in fontes.items()}, "candidatos": len(cands)}
    if out:
        write("financas.json", {"provenance": {"kind": "tse", "label": "TSE · prestação de contas das candidaturas", "generatedAt": now_iso()}, "partido": PARTIDO, "years": out})


def orientation(ori: list[dict], partido: str = PARTIDO) -> str:
    """Orientação do partido numa votação: S, N, L (liberado) ou '-' se ausente."""
    # Tokens só de letras: "Fdr PT-PCdoB-PV" e "PT/PCdoB/PV" contêm PT; "PTB" não.
    o = next((x for x in ori if partido in re.split(r"[^A-Z]+", norm(x.get("siglaPartidoBloco") or ""))), None)
    return {"Sim": "S", "Não": "N", "Obstrução": "N", "Liberado": "L"}.get((o or {}).get("orientacaoVoto") or "", "-")


def etapa_camara(dias: int) -> None:
    log(f"Câmara: votações nominais do Plenário nos últimos {dias} dias")
    fim = date.today()
    votacoes, cursor = [], fim
    while (fim - cursor).days < dias:
        ini = max(cursor - timedelta(days=89), date(cursor.year, 1, 1))
        url = f"{CAMARA}/votacoes?idOrgao=180&dataInicio={ini}&dataFim={cursor}&ordem=DESC&ordenarPor=dataHoraRegistro&itens=200"
        while url:
            page = get_json(url) or {}
            votacoes.extend(page.get("dados", []))
            url = next((l["href"] for l in page.get("links", []) if l.get("rel") == "next"), None)
        cursor = ini - timedelta(days=1)
    log(f"  {len(votacoes)} votações encontradas, lendo os votos")

    def detalhe(v):
        votos = (get_json(f"{CAMARA}/votacoes/{v['id']}/votos") or {}).get("dados", [])
        if len(votos) < 200:
            return None  # votação simbólica
        ori = (get_json(f"{CAMARA}/votacoes/{v['id']}/orientacoes") or {}).get("dados", [])
        return v, votos, orientation(ori)

    with ThreadPoolExecutor(max_workers=6) as pool:
        linhas = [r for r in pool.map(detalhe, votacoes) if r]
    log(f"  {len(linhas)} votações nominais")
    if not linhas:
        return
    idx: dict[int, int] = {}
    deputados = []
    for _, votos, _ in sorted(linhas, key=lambda r: r[0]["data"]):
        for vt in votos:
            d = vt["deputado_"]
            if d["id"] not in idx:
                idx[d["id"]] = len(deputados)
                deputados.append({"id": d["id"], "nome": d["nome"], "partido": d["siglaPartido"], "uf": d["siglaUf"]})
    saida = []
    for v, votos, orient in sorted(linhas, key=lambda r: r[0]["data"]):
        chars = ["-"] * len(deputados)
        for vt in votos:
            chars[idx[vt["deputado_"]["id"]]] = BALLOT.get(vt["tipoVoto"], "A")
        saida.append({"id": v["id"], "data": v["data"], "descricao": v.get("descricao", "")[:240], "orientacaoPT": orient, "ballots": "".join(chars)})
    write("camara.json", {
        "provenance": {"kind": "camara", "label": "Câmara dos Deputados · API de Dados Abertos", "generatedAt": now_iso()},
        "window": {"from": saida[0]["data"], "to": saida[-1]["data"]},
        "deputies": deputados,
        "votes": saida,
    })


# -------------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--so", choices=["eleicoes", "presidencia", "financas", "camara"], action="append", help="executa só esta etapa (pode repetir)")
    ap.add_argument("--anos", type=int, nargs="+", help="anos de eleição geral")
    ap.add_argument("--dias", type=int, default=365, help="janela de votações da Câmara, em dias")
    args = ap.parse_args()
    etapas = args.so or ["eleicoes", "financas", "camara"]
    falhas = []
    for etapa in etapas:
        try:
            if etapa in ("eleicoes", "presidencia"):
                etapa_eleicoes(args.anos or (ANOS_PRESIDENCIA if etapa == "presidencia" else ANOS_GERAIS))
            elif etapa == "financas":
                etapa_financas(args.anos or ANOS_GERAIS)
            elif etapa == "camara":
                etapa_camara(args.dias)
        except Exception as err:  # uma fonte fora do ar não bloqueia as outras
            log(f"ERRO na etapa {etapa}: {err}")
            falhas.append(etapa)
    if falhas:
        log(f"Concluído com falhas em: {', '.join(falhas)}")
        sys.exit(1)
    log("Concluído. Rode `python etl/derive.py` e depois `npm run build`.")


if __name__ == "__main__":
    main()
