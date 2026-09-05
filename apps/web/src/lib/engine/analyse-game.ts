import type { PositionEval, Review } from '@greekgift/engine';

import { EnginePool, type PoolProgress } from './pool';
import { ANALYSIS_MULTIPV, ANALYSIS_NODES, ENGINE_BUILD } from './settings';

/**
 * Reviewing one game, from the browser.
 *
 * The engine runs here, on the reader's machine, so a review costs us nothing
 * and queues behind nobody. The server keeps what comes out, which is why the
 * second person to open a game waits for a fetch instead of for Stockfish.
 */

export interface AnalysisState {
  phase: 'idle' | 'loading' | 'analysing' | 'saving' | 'done' | 'error';
  /** Positions evaluated in this run, out of the number that needed it. */
  done: number;
  total: number;
  /** Positions that were already in the cache, so nobody paid for them twice. */
  reused: number;
  etaSeconds: number | null;
  review: Review | null;
  error: string | null;
}

export const INITIAL_ANALYSIS: AnalysisState = {
  phase: 'idle',
  done: 0,
  total: 0,
  reused: 0,
  etaSeconds: null,
  review: null,
  error: null,
};

interface CacheResponse {
  review: Review | null;
  cached: Record<string, PositionEval>;
}

const key = `nodes=${ANALYSIS_NODES}&build=${encodeURIComponent(ENGINE_BUILD)}`;

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown; error?: unknown });
    if (typeof detail.detail === 'string') return detail.detail;
    if (typeof detail.error === 'string') return detail.error;
  }
  return fallback;
}

export interface RunOptions {
  gameId: string;
  /** Every position of the game, from the starting one. */
  fens: string[];
  onState: (update: Partial<AnalysisState>) => void;
  signal?: AbortSignal;
}

/**
 * Fetches whatever is already known, evaluates the rest, and stores the lot.
 *
 * Returns the review the server built. Positions arrive back in game order
 * whether they came from the cache or the engine, because `buildReview` pairs
 * them with moves by index and a shuffled array would be a silent disaster.
 */
export async function runAnalysis({
  gameId,
  fens,
  onState,
  signal,
}: RunOptions): Promise<Review> {
  onState({ phase: 'loading', error: null });

  const cacheResponse = await fetch(`/api/games/${gameId}/review?${key}`, { signal });
  if (!cacheResponse.ok) {
    throw new Error(messageFrom(await readJson(cacheResponse), 'Could not reach the cache'));
  }
  const { review: existing, cached } = (await cacheResponse.json()) as CacheResponse;

  if (existing) {
    onState({ phase: 'done', review: existing, done: 0, total: 0, reused: fens.length });
    return existing;
  }

  const missing = [...new Set(fens.filter((fen) => !cached[fen]))];
  onState({
    phase: 'analysing',
    done: 0,
    total: missing.length,
    reused: fens.length - missing.length,
  });

  const pool = new EnginePool();
  const fresh = new Map<string, PositionEval>();

  try {
    if (missing.length > 0) {
      const results = await pool.analyseAll(missing, {
        nodes: ANALYSIS_NODES,
        multipv: ANALYSIS_MULTIPV,
        ...(signal ? { signal } : {}),
        onProgress: ({ done, total, etaSeconds }: PoolProgress) =>
          onState({ done, total, etaSeconds }),
      });
      for (const [i, result] of results.entries()) fresh.set(missing[i]!, result);
    }
  } finally {
    // Four wasm instances is a lot of memory to leave lying around once the
    // last position is done — or once the reader navigates away mid-run.
    pool.terminate();
  }

  const evals = fens.map((fen) => cached[fen] ?? fresh.get(fen)!);

  onState({ phase: 'saving', etaSeconds: null });

  const saved = await fetch(`/api/games/${gameId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodes: ANALYSIS_NODES, engineBuild: ENGINE_BUILD, evals }),
    ...(signal ? { signal } : {}),
  });

  if (!saved.ok) {
    throw new Error(messageFrom(await readJson(saved), 'Could not save the review'));
  }

  const { review } = (await saved.json()) as { review: Review };
  onState({ phase: 'done', review });
  return review;
}
