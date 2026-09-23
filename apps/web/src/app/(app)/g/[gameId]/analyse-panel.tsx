'use client';

import type { Review } from '@greekgift/engine';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, CardBody, Notice } from '@/components/ui';
import {
  INITIAL_ANALYSIS,
  runAnalysis,
  type AnalysisState,
} from '@/lib/engine/analyse-game';
import { estimateLabel } from '@/lib/engine/estimate';

/**
 * Where a review comes from.
 *
 * The engine is a 5 MB download and a minute or more of everybody's laptop fan,
 * so it is never started without being asked. Once it has run once the answer
 * is on the server and nobody is ever asked again.
 */

/**
 * The pool's usual size on a laptop. Fixed rather than read from the browser,
 * so the server-rendered copy and the hydrated one say the same thing.
 */
const ESTIMATE_WORKERS = 4;

const seconds = (value: number | null) => {
  if (value === null) return null;
  if (value < 60) return `${Math.ceil(value)}s`;
  return `${Math.round(value / 60)} min`;
};

export function AnalysePanel({
  gameId,
  fens,
  onReview,
}: {
  gameId: string;
  fens: string[];
  onReview: (review: Review) => void;
}) {
  const [state, setState] = useState<AnalysisState>(INITIAL_ANALYSIS);
  const abort = useRef<AbortController | null>(null);

  const update = useCallback(
    (patch: Partial<AnalysisState>) => setState((s) => ({ ...s, ...patch })),
    [],
  );

  // Leaving the page mid-run must stop four wasm workers, not orphan them.
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const review = await runAnalysis({
        gameId,
        fens,
        onState: update,
        signal: controller.signal,
      });
      onReview(review);
    } catch (error) {
      if (controller.signal.aborted) return;
      update({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Something went wrong',
      });
    }
  };

  const running =
    state.phase === 'loading' || state.phase === 'analysing' || state.phase === 'saving';
  const pct = state.total > 0 ? (state.done / state.total) * 100 : 0;
  const eta = seconds(state.etaSeconds);

  return (
    <Card>
      <CardBody>
        <h2 className="mt-0 mb-2 font-display text-[20px] font-semibold">
          Review this game
        </h2>
        <p className="mt-0 mb-4 max-w-[58ch] text-[14.5px] text-ink-2">
          Stockfish runs in this browser, on this machine — {fens.length} positions,{' '}
          {estimateLabel(fens.length, ESTIMATE_WORKERS)}. The result is saved, so this only happens
          once per game, for everyone.
        </p>

        {state.phase === 'error' && state.error ? (
          <Notice tone="lacquer" icon="!" className="mb-4">
            {state.error}
          </Notice>
        ) : null}

        {running ? (
          <div>
            <div className="flex items-baseline justify-between gap-3 font-mono text-[12.5px] text-ink-2">
              <span>
                {state.phase === 'loading'
                  ? 'Checking what is already analysed…'
                  : state.phase === 'saving'
                    ? 'Saving the review…'
                    : `${state.done} / ${state.total} positions`}
              </span>
              {eta && state.phase === 'analysing' ? <span>about {eta} left</span> : null}
            </div>
            <span className="mt-2 block h-[6px] overflow-hidden rounded-full bg-paper-3">
              <i
                className="block h-full rounded-full bg-brass transition-[width] duration-300"
                style={{ width: `${state.phase === 'saving' ? 100 : pct}%` }}
              />
            </span>
            {state.reused > 0 ? (
              <p className="mt-2 mb-0 text-[12.5px] text-ink-3">
                {state.reused === 1
                  ? '1 position came from the cache — it had been analysed before.'
                  : `${state.reused} positions came from the cache — they had been analysed before.`}
              </p>
            ) : null}
          </div>
        ) : (
          <Button variant="primary" onClick={start}>
            {state.phase === 'error' ? 'Try again' : 'Run the review'}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
