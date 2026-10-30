const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n: number) => nf0.format(n);
export const pct1 = (n: number) => `${nf1.format(n)}%`;
export const pct2 = (n: number) => `${nf2.format(n)}%`;
export const dec2 = (n: number) => nf2.format(n);
/** Share 0..1 as "97,4%". */
export const share = (x: number) => `${nf1.format(x * 100)}%`;
export const signed = (n: number, digits = 2) => `${n >= 0 ? '+' : '−'}${(digits === 2 ? nf2 : nf1).format(Math.abs(n))}`;
export const millions = (n: number) => `${nf1.format(n / 1e6)} mi`;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dateBR = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};
export const monthBR = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
};

export const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso',
  PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

/** Shortens TSE list labels for tight layouts. */
export const listLabel = (k: string) =>
  k.replace('Federação PT/PC do B/PV', 'Fed. PT/PCdoB/PV')
    .replace('Federação PSOL/REDE', 'Fed. PSOL/REDE')
    .replace('Federação PSDB/CIDADANIA', 'Fed. PSDB/Cidadania')
    .replace('Federação UNIÃO/PP', 'Fed. União/PP')
    .replace('Federação PRD/SOLIDARIEDADE', 'Fed. PRD/Solidariedade')
    .replace(/^Federação /, 'Fed. ');

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const e = root.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`Elemento ausente: ${sel}`);
  return e;
}
