import type { Database, SqlJsStatic } from 'sql.js';
import type { Bundle } from '../data/types';
import { $, esc } from '../core/format';
import { onEnter } from '../core/motion';
import type { PlenarioState } from './plenario';

type Preset = { title: string; sql: string };

/** Pages embedded in sandboxed frames can't start downloads: offer copy instead. */
export const COPY_MODE = import.meta.env.MODE === 'artifact';

export async function copyText(text: string, btn: HTMLButtonElement, done: string) {
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = done;
  } catch {
    btn.textContent = 'Não foi possível copiar';
  }
  setTimeout(() => (btn.textContent = label), 1800);
}

const PRESETS: Preset[] = [
  {
    title: 'Ganho entre turnos, do maior ao menor',
    sql: `SELECT ano, candidato, t1_pct, t2_pct,
       ROUND(t2_pct - t1_pct, 2) AS ganho_pp,
       t2_votos - t1_votos       AS ganho_votos
FROM presidencia
WHERE t2_pct IS NOT NULL
ORDER BY ganho_pp DESC;`,
  },
  {
    title: 'Partidos que mais votam como a maioria do PT',
    sql: `SELECT partido,
       COUNT(*)                      AS deputados,
       ROUND(AVG(com_pt) * 100, 1)   AS pct_com_pt,
       ROUND(AVG(theta), 2)          AS posicao_media
FROM deputados
WHERE com_pt IS NOT NULL
GROUP BY partido
HAVING deputados >= 2
ORDER BY pct_com_pt DESC;`,
  },
  {
    title: 'Coesão do PT mês a mês (Rice)',
    sql: `SELECT substr(data, 1, 7) AS mes,
       COUNT(*)            AS votacoes,
       ROUND(AVG(ABS(pt_sim - pt_nao) * 1.0 / (pt_sim + pt_nao)), 3) AS rice_pt
FROM votacoes
WHERE pt_sim + pt_nao > 0
GROUP BY mes
ORDER BY mes;`,
  },
  {
    title: 'Federação por UF em 2026',
    sql: `SELECT l.uf, l.votos, u.cadeiras,
       ROUND(100.0 * l.votos / u.validos, 2) AS pct_validos
FROM listas_2026 AS l
JOIN (SELECT uf, SUM(votos) AS validos, MAX(cadeiras_uf) AS cadeiras
      FROM listas_2026 GROUP BY uf) AS u USING (uf)
WHERE l.lista LIKE 'Federação PT%'
ORDER BY pct_validos DESC;`,
  },
  {
    title: 'Votações em que a maioria do PT ficou em minoria',
    sql: `SELECT data, pt_sim, pt_nao, sim, nao, substr(descricao, 1, 90) AS descricao
FROM votacoes
WHERE (pt_sim > pt_nao AND nao > sim)
   OR (pt_nao > pt_sim AND sim > nao)
ORDER BY data DESC;`,
  },
  {
    title: 'Deputados mais ao centro do eixo',
    sql: `SELECT nome, partido, uf, ROUND(theta, 2) AS theta, presentes
FROM deputados
WHERE presentes >= 50
ORDER BY ABS(theta)
LIMIT 15;`,
  },
];

const SCHEMA: [string, string][] = [
  ['presidencia', 'ano, candidato, t1_votos, t1_pct, t1_posicao, t2_votos, t2_pct, resultado, adversario'],
  ['camara', 'ano, cadeiras, total_cadeiras, votos, pct_votos'],
  ['listas_2026', 'uf, lista, votos, cadeiras_uf'],
  ['deputados', 'id, nome, partido, uf, theta, com_pt, presentes'],
  ['votacoes', 'id, data, descricao, sim, nao, abst, obstr, pt_sim, pt_nao, corte'],
  ['votos', 'votacao_id, deputado_id, voto (S, N, A, O)'],
];

export function initLab(data: Bundle, plen: () => PlenarioState) {
  const editor = $('[data-sql]') as HTMLTextAreaElement;
  const status = $('[data-status]');
  const out = $('[data-out]');
  const run = $('[data-run]') as HTMLButtonElement;
  const csvBtn = $('[data-csv]') as HTMLButtonElement;
  const presets = $('[data-presets]');
  let db: Database | null = null;
  let last: { columns: string[]; values: unknown[][] } | null = null;

  presets.innerHTML = PRESETS.map((p, i) => `<button type="button" data-p="${i}" aria-pressed="${i === 0}">${esc(p.title)}</button>`).join('');
  $('[data-schema]').innerHTML = SCHEMA.map(([t, c]) => `<li><b>${t}</b><br>${esc(c)}</li>`).join('');
  editor.value = PRESETS[0].sql;
  if (COPY_MODE) csvBtn.textContent = 'Copiar CSV';

  presets.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-p]');
    if (!b) return;
    presets.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    editor.value = PRESETS[Number(b.dataset.p)].sql;
    exec();
  });
  run.addEventListener('click', exec);
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      exec();
    }
  });
  csvBtn.addEventListener('click', () => {
    if (!last) return;
    const q = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [last.columns.map(q).join(','), ...last.values.map((r) => r.map(q).join(','))].join('\n');
    if (COPY_MODE) copyText(csv, csvBtn, 'CSV copiado');
    else download('consulta.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  });

  async function boot() {
    if (db) return;
    status.textContent = 'Carregando o SQLite…';
    try {
      const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm-browser.wasm?url')]);
      // In the one-file build the wasm is a data: URL; decode it so no fetch is needed.
      const wasmBinary = wasmUrl.startsWith('data:') ? Uint8Array.from(atob(wasmUrl.slice(wasmUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer : undefined;
      const SQL: SqlJsStatic = await initSqlJs(wasmBinary ? ({ wasmBinary } as never) : { locateFile: () => wasmUrl });
      db = new SQL.Database();
      await waitFor(() => !!plen().irt, 15000);
      fill(db, data, plen());
      status.textContent = 'Pronto. 6 tabelas carregadas.';
      exec();
    } catch (err) {
      status.textContent = `Não foi possível carregar o SQLite: ${err instanceof Error ? err.message : err}`;
      status.classList.add('is-error');
    }
  }

  function exec() {
    if (!db) {
      boot();
      return;
    }
    status.classList.remove('is-error');
    const t0 = performance.now();
    try {
      const res = db.exec(editor.value);
      const r = res[res.length - 1];
      if (!r) {
        out.innerHTML = '';
        last = null;
        csvBtn.disabled = true;
        status.textContent = 'Consulta executada, sem linhas de resultado.';
        return;
      }
      last = r;
      csvBtn.disabled = false;
      const shown = r.values.slice(0, 300);
      out.innerHTML = `<table><thead><tr>${r.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${shown
        .map((row) => `<tr>${row.map((v) => `<td class="${typeof v === 'number' ? 'num' : ''}">${v == null ? '<span class="muted">null</span>' : esc(typeof v === 'number' ? fmtNum(v) : String(v))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
      status.textContent = `${r.values.length} linha${r.values.length === 1 ? '' : 's'} em ${Math.max(1, Math.round(performance.now() - t0))} ms${r.values.length > 300 ? ' · mostrando 300; o CSV leva todas' : ''}.`;
    } catch (err) {
      status.textContent = `Erro no SQL: ${err instanceof Error ? err.message : err}`;
      status.classList.add('is-error');
    }
  }

  onEnter($('[data-lab]'), boot, 0);
}

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));

function waitFor(cond: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > ms ? resolve() : setTimeout(tick, 100));
    tick();
  });
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fill(db: Database, data: Bundle, st: PlenarioState) {
  const { historico: h, listas: l, plenario: p } = data;
  db.run(`
    CREATE TABLE presidencia (ano INTEGER PRIMARY KEY, candidato TEXT, t1_votos INTEGER, t1_pct REAL, t1_posicao INTEGER, t2_votos INTEGER, t2_pct REAL, resultado TEXT, adversario TEXT);
    CREATE TABLE camara (ano INTEGER PRIMARY KEY, cadeiras INTEGER, total_cadeiras INTEGER, votos INTEGER, pct_votos REAL);
    CREATE TABLE listas_2026 (uf TEXT, lista TEXT, votos INTEGER, cadeiras_uf INTEGER, PRIMARY KEY (uf, lista));
    CREATE TABLE deputados (id INTEGER PRIMARY KEY, nome TEXT, partido TEXT, uf TEXT, theta REAL, com_pt REAL, presentes INTEGER);
    CREATE TABLE votacoes (id TEXT PRIMARY KEY, data TEXT, descricao TEXT, sim INTEGER, nao INTEGER, abst INTEGER, obstr INTEGER, pt_sim INTEGER, pt_nao INTEGER, corte REAL);
    CREATE TABLE votos (votacao_id TEXT, deputado_id INTEGER, voto TEXT);
  `);
  const ins = (sql: string, rows: unknown[][]) => {
    const s = db.prepare(sql);
    db.run('BEGIN');
    for (const r of rows) s.run(r as never);
    db.run('COMMIT');
    s.free();
  };
  ins('INSERT INTO presidencia VALUES (?,?,?,?,?,?,?,?,?)', h.presidencia.map((x) => [x.ano, x.candidato, x.turno1.votos, x.turno1.pct, x.turno1.posicao, x.turno2?.votos ?? null, x.turno2?.pct ?? null, x.resultado, `${x.adversario.nome} (${x.adversario.partido})`]));
  ins('INSERT INTO camara VALUES (?,?,?,?,?)', h.camara.map((x) => [x.ano, x.cadeiras, x.total, x.votos, x.pct]));
  ins('INSERT INTO listas_2026 VALUES (?,?,?,?)', Object.entries(l.ufs).flatMap(([uf, v]) => Object.entries(v.listas).map(([k, n]) => [uf, k, n, l.cadeirasPorUF[uf]])));
  const ds = st.cohesion.deputies;
  ins('INSERT INTO deputados VALUES (?,?,?,?,?,?,?)', p.deputies.map((d, i) => [d.id, d.nome, d.partido, d.uf, st.irt ? st.irt.theta[i] : null, Number.isNaN(ds[i].withPT) ? null : ds[i].withPT, ds[i].present]));
  const ptIdx = st.cohesion.ptIdx;
  ins(
    'INSERT INTO votacoes VALUES (?,?,?,?,?,?,?,?,?,?)',
    p.votes.map((v, j) => {
      const cnt = { S: 0, N: 0, A: 0, O: 0 } as Record<string, number>;
      for (const ch of v.ballots) if (ch in cnt) cnt[ch]++;
      let ps = 0;
      let pn = 0;
      for (const i of ptIdx) {
        if (v.ballots[i] === 'S') ps++;
        else if (v.ballots[i] === 'N' || v.ballots[i] === 'O') pn++;
      }
      const cut = st.irt ? st.irt.cut[j] : null;
      return [v.id, v.data, v.descricao, cnt.S, cnt.N, cnt.A, cnt.O, ps, pn, cut != null && Number.isFinite(cut) ? cut : null];
    }),
  );
  const rows: unknown[][] = [];
  p.votes.forEach((v) => {
    for (let i = 0; i < v.ballots.length; i++) if (v.ballots[i] !== '-') rows.push([v.id, p.deputies[i].id, v.ballots[i]]);
  });
  ins('INSERT INTO votos VALUES (?,?,?)', rows);
}
