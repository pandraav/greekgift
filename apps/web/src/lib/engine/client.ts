import { toWhiteView } from '@greekgift/engine';
import type { EngineLine, PositionEval, Score } from '@greekgift/engine';

/**
 * Stockfish, in a Web Worker, in the reader's own browser.
 *
 * No server engine, no queue, no per-user cost. The build is
 * `stockfish-18-lite-single` — 6.9 MB with the network compiled in, versus
 * 107.7 MB for the full build, and single-threaded so it needs no
 * SharedArrayBuffer and therefore no COOP/COEP headers. Upstream recommends
 * exactly this one, and it is far stronger than anyone reviewing their own
 * blitz games needs.
 */

export const ENGINE_BUILD = 'stockfish-18-lite-single';
const WORKER_URL = `/engine/${ENGINE_BUILD}.js`;

/** UCI `info` lines we care about. */
const INFO = /^info .*?\bdepth (\d+)\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b(?:.*?\bnodes (\d+)\b)?.*?\bpv (.+)$/;

export interface AnalyseOptions {
  /**
   * Fixed node budget. Never a time limit: the same game must produce the
   * same numbers on a fast desktop and a slow phone, and `movetime` cannot
   * promise that.
   */
  nodes: number;
  multipv?: 1 | 2 | 3;
  signal?: AbortSignal;
}

export class EngineBusyError extends Error {
  constructor() {
    super('The engine is already searching');
    this.name = 'EngineBusyError';
  }
}

export class Engine {
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void> | null = null;
  private busy = false;

  /** Boots the worker and waits for `uciok`/`readyok`. Idempotent. */
  start(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(WORKER_URL);
      } catch (cause) {
        reject(new Error(`Could not start the engine worker: ${String(cause)}`));
        return;
      }

      this.worker.onmessage = (event: MessageEvent<string>) => {
        const line = typeof event.data === 'string' ? event.data : '';
        for (const l of this.listeners) l(line);
      };
      this.worker.onerror = (event) => reject(new Error(event.message));

      const onLine = (line: string) => {
        if (line === 'readyok') {
          this.listeners.delete(onLine);
          resolve();
        }
      };
      this.listeners.add(onLine);

      this.send('uci');
      // Determinism: one thread, a fixed small hash. A bigger table would
      // make the result depend on how much memory happened to be free.
      this.send('setoption name Threads value 1');
      this.send('setoption name Hash value 16');
      this.send('isready');
    });

    return this.ready;
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  /** Evaluates one position. Serial — one search at a time per worker. */
  async analyse(fen: string, options: AnalyseOptions): Promise<PositionEval> {
    if (this.busy) throw new EngineBusyError();
    await this.start();
    this.busy = true;

    const multipv = options.multipv ?? 1;

    // UCI scores are relative to the side to move; everything downstream —
    // the contract, the cache, the graph — is from White's. Normalising here,
    // at the one place a raw score enters the system, is what keeps a stored
    // evaluation meaningful on its own.
    const whiteToMove = fen.split(' ')[1] === 'w';

    try {
      return await new Promise<PositionEval>((resolve, reject) => {
        // Keyed by multipv index: later, deeper lines replace earlier ones.
        const best = new Map<number, EngineLine>();

        const onLine = (line: string) => {
          const m = INFO.exec(line);
          if (m) {
            const index = Number(m[2]) as 1 | 2 | 3;
            const raw: Score =
              m[3] === 'mate' ? { mate: Number(m[4]) } : { cp: Number(m[4]) };
            const score = toWhiteView(raw, whiteToMove);
            best.set(index, {
              multipv: index,
              score,
              pv: m[6]!.trim().split(/\s+/),
              depth: Number(m[1]),
              nodes: m[5] ? Number(m[5]) : options.nodes,
            });
            return;
          }

          if (line.startsWith('bestmove')) {
            cleanup();
            const lines = [...best.values()].sort((a, b) => a.multipv - b.multipv);
            if (lines.length === 0) {
              // Mate or stalemate on the board: no move to search.
              resolve({ fen, nodes: options.nodes, engineBuild: ENGINE_BUILD, lines: [] });
              return;
            }
            resolve({ fen, nodes: options.nodes, engineBuild: ENGINE_BUILD, lines });
          }
        };

        const onAbort = () => {
          this.send('stop');
          cleanup();
          reject(new DOMException('Analysis cancelled', 'AbortError'));
        };

        const cleanup = () => {
          this.listeners.delete(onLine);
          options.signal?.removeEventListener('abort', onAbort);
          this.busy = false;
        };

        if (options.signal?.aborted) {
          this.busy = false;
          reject(new DOMException('Analysis cancelled', 'AbortError'));
          return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });

        this.listeners.add(onLine);
        this.send(`setoption name MultiPV value ${multipv}`);
        this.send(`position fen ${fen}`);
        this.send(`go nodes ${options.nodes}`);
      });
    } finally {
      this.busy = false;
    }
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listeners.clear();
    this.busy = false;
  }
}
