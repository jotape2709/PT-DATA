"""Testes do ETL e da auditoria (python -m unittest discover -s tests -p "*_test.py")."""

import io
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "etl"))

import audit  # noqa: E402
import run  # noqa: E402
from seats import allocate, quociente_eleitoral  # noqa: E402

CSV = """\
"NR_TURNO";"CD_CARGO";"SG_UF";"SG_PARTIDO";"SG_FEDERACAO";"TP_AGREMIACAO";"NM_COLIGACAO";"QT_VOTOS_NOMINAIS_VALIDOS";"QT_TOTAL_VOTOS_LEG_VALIDOS"
"1";"6";"SP";"PT";"PT/PC do B/PV";"FEDERAÇÃO";"#NULO#";"100";"20"
"1";"6";"SP";"PV";"PT/PC do B/PV";"FEDERAÇÃO";"#NULO#";"30";"0"
"1";"6";"SP";"PL";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"200";"10"
"1";"1";"SP";"PT";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"400";"0"
"1";"1";"SP";"PL";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"500";"0"
"2";"1";"SP";"PT";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"480";"0"
"2";"1";"SP";"PL";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"460";"0"
"1";"6";"ZZ";"PT";"#NULO#";"PARTIDO ISOLADO";"#NULO#";"9";"0"
"""


class EtlTest(unittest.TestCase):
    def rows(self):
        return list(run.read_csv(io.StringIO(CSV)))

    def test_agrega_camara_listas_e_presidencia(self):
        agg = run.aggregate_votacao(self.rows())
        self.assertEqual(agg["camara"]["votesByUF"], {"SP": 120})
        self.assertEqual(agg["camara"]["validByUF"], {"SP": 360})
        self.assertEqual(agg["listas"]["SP"], {"Federação PT/PC do B/PV": 150, "PL": 210})
        self.assertEqual(agg["presidente"]["1"]["SP"], [400, 900])
        self.assertEqual(agg["presidente"]["2"]["SP"], [480, 940])
        self.assertNotIn("ZZ", agg["camara"]["validByUF"])

    def test_eleitos_contam_media_e_ignoram_duplicatas(self):
        rows = [
            {"SG_PARTIDO": "PT", "NR_TURNO": "1", "CD_CARGO": "6", "SQ_CANDIDATO": "1", "DS_SIT_TOT_TURNO": "ELEITO POR QP", "SG_UF": "BA", "NM_URNA_CANDIDATO": "ANA"},
            {"SG_PARTIDO": "PT", "NR_TURNO": "1", "CD_CARGO": "6", "SQ_CANDIDATO": "1", "DS_SIT_TOT_TURNO": "ELEITO POR QP", "SG_UF": "BA", "NM_URNA_CANDIDATO": "ANA"},
            {"SG_PARTIDO": "PT", "NR_TURNO": "1", "CD_CARGO": "6", "SQ_CANDIDATO": "2", "DS_SIT_TOT_TURNO": "MÉDIA", "SG_UF": "BA", "NM_URNA_CANDIDATO": "BIA"},
            {"SG_PARTIDO": "PT", "NR_TURNO": "1", "CD_CARGO": "6", "SQ_CANDIDATO": "3", "DS_SIT_TOT_TURNO": "SUPLENTE", "SG_UF": "BA", "NM_URNA_CANDIDATO": "CAU"},
            {"SG_PARTIDO": "PL", "NR_TURNO": "1", "CD_CARGO": "6", "SQ_CANDIDATO": "4", "DS_SIT_TOT_TURNO": "ELEITO", "SG_UF": "BA", "NM_URNA_CANDIDATO": "DUDA"},
        ]
        self.assertEqual(run.aggregate_candidatos(rows), {"BA": ["Ana", "Bia"]})

    def test_orientacao_do_pt_em_blocos(self):
        ori = [{"siglaPartidoBloco": "PL", "orientacaoVoto": "Não"}, {"siglaPartidoBloco": "PT", "orientacaoVoto": "Sim"}]
        self.assertEqual(run.orientation(ori), "S")
        self.assertEqual(run.orientation([{"siglaPartidoBloco": "Fdr PT-PCdoB-PV", "orientacaoVoto": "Não"}]), "N")
        self.assertEqual(run.orientation([{"siglaPartidoBloco": "PTB", "orientacaoVoto": "Sim"}]), "-")
        self.assertEqual(run.orientation([{"siglaPartidoBloco": "PT/PCdoB/PV", "orientacaoVoto": "Liberado"}]), "L")
        self.assertEqual(run.orientation([]), "-")

    def test_classificacao_de_receitas(self):
        self.assertEqual(run.classificar("Fundo Especial", ""), "Fundo Eleitoral (FEFC)")
        self.assertEqual(run.classificar("Outros Recursos", "Recursos de outros candidatos"), None)
        self.assertEqual(run.classificar("", "Recursos de pessoas físicas"), "Pessoas físicas")

    def test_alocacao_igual_ao_typescript(self):
        self.assertEqual(quociente_eleitoral(1055, 10), 105)
        self.assertEqual(quociente_eleitoral(1056, 10), 106)
        self.assertEqual(allocate({"A": 520, "B": 401, "C": 79}, 10)["seats"], {"A": 6, "B": 4, "C": 0})

    def test_bases_publicadas_passam_na_auditoria(self):
        out = ROOT / "public" / "data"
        for name in ("historico.json", "listas_2026.json", "plenario.json"):
            checks = audit.validate_dataset(name, json.loads((out / name).read_text(encoding="utf-8")))
            self.assertTrue(checks, name)

    def test_auditoria_reprova_percentual_inconsistente(self):
        h = json.loads((ROOT / "public" / "data" / "historico.json").read_text(encoding="utf-8"))
        h["presidencia"][-1]["turno2"]["pct"] = 55.0
        with self.assertRaises(audit.AuditError):
            audit.check_historico(h)


if __name__ == "__main__":
    unittest.main()
