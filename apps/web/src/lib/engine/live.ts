import type { EngineLine, PositionEval } from '@greekgift/engine';
import { useEffect, useState } from 'react';

import { Engine, EngineBusyError } from './client';
import { LIVE_NODES } from './settings';

/**
 * The engine on lines the reader explores (design §8).
 *
 * The review's stored lines stop where the game stops. Once the reader drags
 * a piece, the position on the board is one nobody analysed, so a dedicated
 * engine searches it here, in the browser, at a fixed budget. It is separate
 * from the analysis pool, which is terminated after a review run, and it
 * lives as long as the page. Results are cached in memory per FEN and never
 * written to `position_evals`: the budget differs from the stored one.
 */

/** Live budget, nodes (settings.ts): about 4 s at ~241k nodes/s. */
export { LIVE_NODES };
const LIVE_MULTIPV = 3 as const;
/** Positions kept in memory; the oldest goes first. */
export const LIVE_CACHE_SIZE = 256;

export interface LiveLines {
  status: 'idle' | 'running' | 'done' | 'error';
  fen: string | null;
  /** White's view, multipv 1..3. */
  lines: EngineLine[];
  /** Latest reported depth. */
  depth: number;
  nodes: number;
}

export interface LiveOptions {
  signal: AbortSignal;
  onInfo?: (lines: EngineLine[], depth: number) => void;
}

/** What the live analyser needs from an engine: `Engine` from client.ts fits. */
export interface LiveEngine {
  analyse(
    fen: string,
    options: {
      nodes: number;
      multipv?: 1 | 2 | 3;
      signal?: AbortSignal;
      onInfo?: (lines: EngineLine[], depth: number) => void;
    },
  ): Promise<PositionEval>;
}

const abortError = () => new DOMException('Analysis cancelled', 'AbortError');
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One analyser: an engine, a cache, and the rule that a new request never
 * waits behind a stale one. Exported as a factory so tests can hand it a fake
 * engine; the page uses the module's single instance below.
 */
export function createLiveAnalyser(
  getEngine: () => LiveEngine,
  { nodes = LIVE_NODES, capacity = LIVE_CACHE_SIZE }: { nodes?: number; capacity?: number } = {},
) {
  const cache = new Map<string, PositionEval>();

  const remember = (fen: string, result: PositionEval) => {
    cache.delete(fen);
    cache.set(fen, result);
    while (cache.size > capacity) cache.delete(cache.keys().next().value!);
  };

  async function analyse(fen: string, { signal, onInfo }: LiveOptions): Promise<PositionEval> {
    const hit = cache.get(fen);
    if (hit) return hit;
    if (signal.aborted) throw abortError();

    const engine = getEngine();
    // A search that was just cancelled may still be draining its `bestmove`;
    // the engine says so with EngineBusyError. Ask again shortly rather than
    // fail the reader's next step.
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await engine.analyse(fen, { nodes, multipv: LIVE_MULTIPV, signal, onInfo });
        if (signal.aborted) throw abortError();
        remember(fen, result);
        return result;
      } catch (error) {
        if (error instanceof EngineBusyError && attempt < 40 && !signal.aborted) {
          await wait(50);
          continue;
        }
        throw error;
      }
    }
  }

  return {
    analyse,
    cached: (fen: string): PositionEval | undefined => cache.get(fen),
    size: () => cache.size,
  };
}

let engine: Engine | null = null;
const shared = createLiveAnalyser(() => (engine ??= new Engine()));

/** Analyse one position with the shared live engine. Cached per FEN. */
export function analyseLive(fen: string, opts: LiveOptions): Promise<PositionEval> {
  return shared.analyse(fen, opts);
}

const IDLE: LiveLines = { status: 'idle', fen: null, lines: [], depth: 0, nodes: LIVE_NODES };

const doneFrom = (fen: string, result: PositionEval): LiveLines => ({
  status: 'done',
  fen,
  lines: result.lines,
  depth: result.lines[0]?.depth ?? 0,
  nodes: result.nodes,
});

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * React hook: runs `analyseLive` on `fen` (null = idle) and cancels the
 * previous search whenever `fen` changes. `stored` is asked first, so an
 * explored line that transposes back into a game position shows that
 * position's stored lines instead of searching again.
 */
export function useLiveLines(
  fen: string | null,
  stored?: (fen: string) => PositionEval | undefined,
): LiveLines {
  const [state, setState] = useState<LiveLines>(IDLE);

  const known = fen ? (stored?.(fen) ?? shared.cached(fen)) : undefined;

  useEffect(() => {
    if (!fen || known) return;
    const controller = new AbortController();
    analyseLive(fen, {
      signal: controller.signal,
      onInfo: (lines, depth) => {
        if (controller.signal.aborted) return;
        setState({ status: 'running', fen, lines, depth, nodes: LIVE_NODES });
      },
    })
      .then((result) => {
        if (!controller.signal.aborted) setState(doneFrom(fen, result));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setState({ status: 'error', fen, lines: [], depth: 0, nodes: LIVE_NODES });
      });
    return () => controller.abort();
  }, [fen, known]);

  if (!fen) return IDLE;
  if (known) return doneFrom(fen, known);
  // Until the first report for this position, it is running with nothing yet:
  // the state may still hold the previous position's lines, which must not show.
  if (state.fen !== fen) return { status: 'running', fen, lines: [], depth: 0, nodes: LIVE_NODES };
  return state;
}
