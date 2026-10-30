import historico from '../../public/data/historico.json';
import listas from '../../public/data/listas_2026.json';
import plenario from '../../public/data/plenario.json';
import quality from '../../public/data/quality.json';
import type { Bundle, Historico, Listas2026, Plenario, Quality } from './types';

/**
 * The snapshots are bundled at build time: the site is static and the numbers
 * on screen are always the ones audited in quality.json.
 */
export const DATA: Bundle = {
  historico: historico as unknown as Historico,
  listas: listas as unknown as Listas2026,
  plenario: plenario as unknown as Plenario,
  quality: quality as unknown as Quality,
};

export const RAW_FILES: Record<string, unknown> = {
  'historico.json': historico,
  'listas_2026.json': listas,
  'plenario.json': plenario,
  'quality.json': quality,
};
