import { ANALYSIS_NODES } from './settings';

/**
 * How long a review will take, said before anything has run.
 *
 * Calibrated, not guessed: at 2M nodes a 55-position game took about 50 s on
 * four workers (review-overhaul loop, 2026-09-23) — close to a second a
 * position, i.e. roughly 500k nodes a second per worker once start-up and
 * the per-position reset are counted. Derived from the node budget, so the
 * copy follows `ANALYSIS_NODES` when it changes.
 */
export const NODES_PER_SECOND_PER_WORKER = 500_000;

export function estimateSeconds(positions: number, workers: number, nodes = ANALYSIS_NODES): number {
  return (Math.max(0, positions) * nodes) / (NODES_PER_SECOND_PER_WORKER * Math.max(1, workers));
}

/** Rounded hard, because a figure to the second would be a promise rather than an estimate. */
export function estimateLabel(positions: number, workers: number, nodes = ANALYSIS_NODES): string {
  const secs = estimateSeconds(positions, workers, nodes);
  if (secs < 10) return 'a few seconds';
  if (secs < 45) return `about ${Math.round(secs / 10) * 10} seconds`;
  if (secs < 90) return 'about a minute';
  return `about ${Math.round(secs / 60)} minutes`;
}
