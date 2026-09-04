import type { PositionEval } from '@greekgift/engine';

import { Engine, type AnalyseOptions } from './client';

/**
 * A handful of engines chewing through a game's positions at once.
 *
 * One worker at 241k nodes/sec needs about five and a half minutes for a
 * 40-move game at a million nodes a position — measured, not guessed. Nobody
 * waits that long. Positions are independent, though, so they parallelise
 * perfectly, and the wall-clock divides by the number of workers.
 *
 * Each worker holds its own 7 MB wasm instance, so the count is deliberately
 * modest: the browser has other things to do, and beyond four the return
 * flattens while memory does not.
 */

const MAX_WORKERS = 4;

export function workerCount(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 4;
  // Leave a core for the UI thread, and never spawn more workers than there
  // is work — a five-move game does not want four engines.
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1));
}

export interface PoolProgress {
  done: number;
  total: number;
  /** Rolling estimate, seconds. Null until there is enough to estimate from. */
  etaSeconds: number | null;
}

export interface AnalyseAllOptions extends Omit<AnalyseOptions, 'signal'> {
  signal?: AbortSignal;
  onProgress?: (progress: PoolProgress) => void;
  workers?: number;
}

export class EnginePool {
  private engines: Engine[] = [];

  /** Boots the workers in parallel so the wasm compiles once, concurrently. */
  async start(count = workerCount()): Promise<void> {
    if (this.engines.length >= count) return;
    while (this.engines.length < count) this.engines.push(new Engine());
    await Promise.all(this.engines.map((e) => e.start()));
  }

  /**
   * Evaluates every position, in order out, order preserved.
   *
   * Work is pulled rather than pre-assigned: positions vary enormously in how
   * long they take, and handing each worker a fixed slice would leave three
   * idle while the fourth ground through the endgame.
   */
  async analyseAll(
    fens: string[],
    options: AnalyseAllOptions,
  ): Promise<PositionEval[]> {
    const count = Math.min(options.workers ?? workerCount(), Math.max(1, fens.length));
    await this.start(count);

    const results = new Array<PositionEval>(fens.length);
    const started = performance.now();
    let next = 0;
    let done = 0;

    const report = () => {
      const elapsed = (performance.now() - started) / 1000;
      const eta =
        done >= count && done < fens.length
          ? ((elapsed / done) * (fens.length - done))
          : null;
      options.onProgress?.({ done, total: fens.length, etaSeconds: eta });
    };

    const run = async (engine: Engine) => {
      for (;;) {
        if (options.signal?.aborted) return;
        const index = next++;
        if (index >= fens.length) return;

        results[index] = await engine.analyse(fens[index]!, {
          nodes: options.nodes,
          multipv: options.multipv,
          signal: options.signal,
        });
        done++;
        report();
      }
    };

    report();
    await Promise.all(this.engines.slice(0, count).map(run));

    if (options.signal?.aborted) {
      throw new DOMException('Analysis cancelled', 'AbortError');
    }
    return results;
  }

  terminate() {
    for (const engine of this.engines) engine.terminate();
    this.engines = [];
  }
}
