import type { Bundle } from '../data/types';
import { RAW_FILES } from '../data/load';
import { $, dateBR, esc } from '../core/format';
import { COPY_MODE, copyText, download } from './lab';

export function renderMetodo(data: Bundle) {
  const q = data.quality;
  const modelo = Object.values(data.listas.modeloCadeirasAlvo).reduce((a, b) => a + b, 0);
  const real = data.historico.federacao2026.cadeirasReais;
  $('[data-lineage]').innerHTML = `
    <div><p class="label">1 · Fontes</p><h3>TSE e Câmara</h3><p>Arquivos de votação por zona, candidaturas e a API de votações nominais. Série nacional com fonte linha a linha.</p></div>
    <div><p class="label">2 · ETL</p><h3>Python, só biblioteca padrão</h3><p><code>etl/run.py</code> baixa e agrega; <code>etl/derive.py</code> gera as bases do PT.</p></div>
    <div><p class="label">3 · Auditoria</p><h3>${q.datasets.reduce((a, d) => a + d.checks.length, 0)} verificações</h3><p><code>etl/audit.py</code> concilia arquivos e grava SHA-256 em <code>quality.json</code>.</p></div>
    <div><p class="label">4 · Site</p><h3>Vite + TypeScript</h3><p>Motores testados com Vitest; modelo IRT em Web Worker; SQLite em WebAssembly.</p></div>`;

  const blocks: [string, string][] = [
    ['Presidência', 'Percentual do candidato do PT sobre votos válidos, em cada turno. A série curada cita a fonte de cada linha; o ETL recalcula 1998–2026 direto do TSE. Totais podem variar algumas centenas de votos entre a divulgação e retotalizações.'],
    ['Câmara', 'Deputados federais eleitos pelo PT em cada pleito, não a bancada em exercício. A fatia de votos soma votos nominais e de legenda do partido. Em 2026 a série mostra cadeiras; os votos por lista estão no mapa.'],
    ['Mapa 2026 e cadeiras', `Votos de cada lista por UF (TSE). O modelo aplica quociente eleitoral, quociente partidário e sobras por maiores médias com piso de 80% do QE, sem os pisos individuais de candidatos. Resultado: ${modelo} cadeiras para a federação, contra ${real} oficiais. “Votos para a próxima cadeira” usa busca binária no próprio modelo, com as demais listas fixas.`],
    ['Coesão e concordância', 'Maioria de um grupo = sinal de Sim − Não; obstrução conta como Não; abstenções e ausências ficam fora. Rice = média de |Sim − Não| / (Sim + Não). Concordância entre partidos só conta votações em que as duas maiorias são definidas.'],
    ['Modelo IRT', 'P(Sim) = σ(β·θ − α), uma dimensão, estimação MAP por ascensão alternada com prioris normais. θ é padronizado; o sinal coloca a mediana do PT à esquerda. O eixo não tem rótulo ideológico: é a direção que mais separa os votos no período. Acerto comparado ao palpite “todos votam com a maioria”.'],
    ['Limites', 'Partido do deputado = o do primeiro voto na janela; trocas de legenda não são reconstruídas. Snapshots não são tempo real. Descrever não é explicar: nada aqui atribui causa a resultados eleitorais.'],
  ];
  $('[data-method]').innerHTML = blocks.map(([t, p]) => `<div><h3>${t}</h3><p>${p}</p></div>`).join('');

  const checks = q.datasets.flatMap((d) => d.checks.map((c) => `${d.file}: ${c}`)).concat(q.crossFileChecks);
  $('[data-quality]').innerHTML = `
    <h3>Relatório de integridade · ${q.passed ? 'aprovado' : 'com falhas'} em ${dateBR(q.checkedAt.slice(0, 10))}</h3>
    <p class="note">${esc(q.scope)}</p>
    <ul>${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p class="sha">${q.datasets.map((d) => `${d.file} · sha256 ${d.sha256}`).join('<br>')}</p>`;

  const dl = $('[data-downloads]');
  dl.innerHTML =
    `<span class="label">${COPY_MODE ? 'Copiar as bases (JSON)' : 'Baixar as bases'}</span>` +
    Object.keys(RAW_FILES)
      .map((f) => `<button class="btn btn--ghost" type="button" data-file="${f}">${f}</button>`)
      .join('');
  dl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-file]');
    if (!b) return;
    const json = JSON.stringify(RAW_FILES[b.dataset.file!], null, 1);
    if (COPY_MODE) copyText(json, b, 'copiado');
    else download(b.dataset.file!, json, 'application/json');
  });

  $('[data-built]').textContent = `Bases auditadas em ${dateBR(q.checkedAt.slice(0, 10))}. Código e ETL na pasta do projeto.`;
}
