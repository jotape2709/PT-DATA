import IrtWorker from './irt.worker?worker&inline';
import { encode, fitIrt, type IrtResult } from './irt';

/** Fits the IRT model off the main thread; falls back to the main thread if workers fail. */
export function fitIrtAsync(ballots: string[], n: number, ref: number[]): Promise<IrtResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    const fallback = () => resolve(fitIrt({ n, m: ballots.length, y: encode(ballots, n), ref }));
    try {
      worker = new IrtWorker();
    } catch {
      return fallback();
    }
    const timer = setTimeout(() => {
      worker.terminate();
      fallback();
    }, 20_000);
    worker.onmessage = (e: MessageEvent<{ fit?: IrtResult; error?: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.fit) resolve(e.data.fit);
      else fallback();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      fallback();
    };
    worker.postMessage({ ballots, n, ref });
  });
}
