export type Provenance = { kind: string; label: string; generatedAt: string; derivedAt?: string; via?: string };

export type Presidencia = {
  ano: number;
  candidato: string;
  turno1: { votos: number; pct: number; posicao: 1 | 2 };
  turno2: { votos: number; pct: number } | null;
  adversario: { nome: string; partido: string; votosTurno2: number | null };
  lider1turno: { nome: string; pct: number } | null;
  resultado: 'vitória' | 'derrota';
  ganhoEntreTurnos?: { votos: number; pontos: number };
  margemTurno2?: { votos: number; pontos: number };
  fonte: string;
};

export type CamaraAno = {
  ano: number;
  cadeiras: number;
  total: number;
  votos: number | null;
  pct: number | null;
  pctCadeiras: number;
  nota?: string;
  fonte: string;
};

export type Historico = {
  provenance: Provenance;
  fundacao: { data: string; local: string; registroDefinitivoTSE: string; fonte: string };
  presidencia: Presidencia[];
  camara: CamaraAno[];
  federacao2026: { nome: string; cadeirasReais: number; ptCadeiras: number; fonte: string };
};

export type Listas2026 = {
  provenance: Provenance;
  ano: number;
  alvo: string;
  cadeirasPorUF: Record<string, number>;
  ufs: Record<string, { listas: Record<string, number> }>;
  modeloCadeirasAlvo: Record<string, number>;
};

export type Deputy = { id: number; nome: string; partido: string; uf: string };
export type RollCall = { id: string; data: string; descricao: string; ballots: string };
export type Plenario = { provenance: Provenance; window: { from: string; to: string }; deputies: Deputy[]; votes: RollCall[] };

export type Quality = {
  scope: string;
  checkedAt: string;
  passed: boolean;
  crossFileChecks: string[];
  datasets: { file: string; sha256: string; bytes: number; checks: string[] }[];
};

export type Bundle = { historico: Historico; listas: Listas2026; plenario: Plenario; quality: Quality };
