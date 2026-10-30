import { encode, fitIrt } from './irt';

type Msg = { ballots: string[]; n: number; ref: number[] };

self.onmessage = (e: MessageEvent<Msg>) => {
  try {
    const { ballots, n, ref } = e.data;
    const fit = fitIrt({ n, m: ballots.length, y: encode(ballots, n), ref });
    (self as unknown as Worker).postMessage({ fit }, [fit.theta.buffer, fit.cut.buffer, fit.alpha.buffer, fit.beta.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : 'Falha no modelo' });
  }
};
