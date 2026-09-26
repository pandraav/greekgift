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
  /**
   * Streaming: the current best line per multipv index and the depth of the
   * first, at most every 150 ms while the search runs, plus once at the end.
   * The game analysis does not pass it; the live engine does.
   */
  onInfo?: (lines: EngineLine[], depth: number) => void;
}

/** How often `onInfo` may fire while a search runs. */
const INFO_INTERVAL_MS = 150;

export class EngineBusyError extends Error {
  constructor() {
    super('The engine is already searching');
    this.name = 'EngineBusyError';
  }
}

const abortError = () => new DOMException('Analysis cancelled', 'AbortError');

export class Engine {
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void> | null = null;
  private busy = false;
  /**
   * Resolves when a cancelled search has really finished — its own
   * `bestmove` (or `readyok`, if it was cancelled before `go`) has arrived.
   * Until then the worker is still talking about the old position, and a new
   * search would read the old search's `bestmove` as its own.
   */
  private drain: Promise<void> = Promise.resolve();
  private releaseDrain: (() => void) | null = null;

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
        for (const l of [...this.listeners]) l(line);
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

  /**
   * Evaluates one position. Serial — one search at a time per worker.
   *
   * Every search starts from nothing: `ucinewgame`, a cleared hash, and a
   * `readyok` before the position is set. With a cleared hash the result
   * depends only on (fen, nodes, multipv, build), never on what this worker
   * searched before — the property the (fen, nodes, engineBuild) cache key
   * has always assumed.
   */
  async analyse(fen: string, options: AnalyseOptions): Promise<PositionEval> {
    if (options.signal?.aborted) throw abortError();
    await this.start();
    // A cancelled search may still be winding down; wait for its bestmove.
    await this.drain;
    if (options.signal?.aborted) throw abortError();
    if (this.busy) throw new EngineBusyError();
    this.busy = true;

    const multipv = options.multipv ?? 1;

    // UCI scores are relative to the side to move; everything downstream —
    // the contract, the cache, the graph — is from White's. Normalising here,
    // at the one place a raw score enters the system, is what keeps a stored
    // evaluation meaningful on its own.
    const whiteToMove = fen.split(' ')[1] === 'w';

    return new Promise<PositionEval>((resolve, reject) => {
      // Keyed by multipv index: later, deeper lines replace earlier ones.
      const best = new Map<number, EngineLine>();
      let searching = false; // `go` sent
      let settled = false;
      let lastInfo = 0;

      const current = () => [...best.values()].sort((a, b) => a.multipv - b.multipv);
      const emitInfo = () => {
        const lines = current();
        if (lines.length > 0) options.onInfo?.(lines, lines[0]!.depth);
      };

      const finish = () => {
        this.listeners.delete(onLine);
        options.signal?.removeEventListener('abort', onAbort);
        this.busy = false;
      };

      const go = () => {
        searching = true;
        this.send(`setoption name MultiPV value ${multipv}`);
        this.send(`position fen ${fen}`);
        this.send(`go nodes ${options.nodes}`);
      };

      const onLine = (line: string) => {
        if (!searching) {
          if (line !== 'readyok') return;
          if (settled) {
            // Cancelled before `go`: nothing more will come.
            finish();
            this.releaseDrain?.();
            return;
          }
          go();
          return;
        }

        const m = INFO.exec(line);
        if (m) {
          if (settled) return;
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
          if (options.onInfo) {
            const now = Date.now();
            if (now - lastInfo >= INFO_INTERVAL_MS) {
              lastInfo = now;
              emitInfo();
            }
          }
          return;
        }

        if (line.startsWith('bestmove')) {
          finish();
          if (settled) {
            // The stopped search's own bestmove: the worker is free again.
            this.releaseDrain?.();
            return;
          }
          settled = true;
          // No lines is a finished game (mate or stalemate): no move to search.
          emitInfo();
          resolve({ fen, nodes: options.nodes, engineBuild: ENGINE_BUILD, lines: current() });
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        // Reject at once, but keep the worker reserved until the stopped
        // search's bestmove (or the pending readyok) has come through.
        this.drain = new Promise<void>((release) => {
          this.releaseDrain = () => {
            this.releaseDrain = null;
            release();
          };
        });
        if (searching) this.send('stop');
        reject(abortError());
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.listeners.add(onLine);

      this.send('ucinewgame');
      this.send('setoption name Clear Hash');
      this.send('isready');
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listeners.clear();
    this.busy = false;
    this.releaseDrain?.();
    this.drain = Promise.resolve();
  }
}
