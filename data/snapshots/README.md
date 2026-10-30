Snapshots agregados das fontes oficiais, lidos por `etl/derive.py`.

| Arquivo | Fonte | Gerado em |
| --- | --- | --- |
| camara.json | API de Dados Abertos da Câmara, votações nominais do Plenário | 2026-10-27 |
| simulador_base.json | TSE, votos para deputado federal por lista e UF, 2026 | 2026-10-27 |
| eleicoes.json | TSE, votos válidos para deputado federal por UF (usado para conciliação) | 2026-10-27 |

Gerados pelo ETL do projeto Sol Vermelho, que agrega todas as listas e todas as votações. `python etl/run.py` (versão PT) regrava esta pasta.
