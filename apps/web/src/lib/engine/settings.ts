import { reviewBuildKey } from '@greekgift/engine';

import { ENGINE_BUILD } from './client';

/**
 * What a review is computed at.
 *
 * These two values, with the position, are the cache key for every stored
 * evaluation — `position_evals (fen, nodes, engine_build)` and
 * `reviews (game_id, nodes, engine_build)` — so changing either gives fresh
 * rows rather than a silently stale review, which is why they live in one
 * place rather than being passed around as literals. Old rows are left alone
 * and simply never read again.
 *
 * 2M nodes reaches depth 18–22 in typical middlegames. One worker does about
 * 241k nodes/s, so that is about 8 s a position; four workers put an
 * 80-position game near 2 min 45 s. It was 300k (depth 15–17), which was too
 * shallow for the classes to be trusted next to chess.com's
 * (review-overhaul design §4.1).
 *
 * `ENGINE_BUILD` is deliberately unchanged: the worker URL is built from it.
 */
export const ANALYSIS_NODES = 2_000_000;

/** Best line plus two alternatives: enough to say "you could have played…". */
export const ANALYSIS_MULTIPV = 3 as const;

/**
 * The live engine on positions the reader explores (design §8): fewer nodes,
 * because someone is waiting on each step, and never cached as a review.
 */
export const LIVE_NODES = 1_000_000;

export { ENGINE_BUILD };

/**
 * The one place the `reviews` table key is built (review-overhaul §4.1).
 *
 * `position_evals` is keyed by the plain `ENGINE_BUILD`: an evaluation does
 * not change when our rules do. A review does, so its row is filed under
 * `${ENGINE_BUILD}+${SCORING_VERSION}` in the same `engine_build` column —
 * bump `SCORING_VERSION` in packages/engine/src/version.ts and every stored
 * review stops being read, then is rebuilt from its cached evals on the next
 * open (`getOrRebuildReview`). Pass the eval key; get the review key.
 */
export function reviewCacheKey(
  key: { nodes: number; engineBuild: string } = { nodes: ANALYSIS_NODES, engineBuild: ENGINE_BUILD },
): { nodes: number; engineBuild: string } {
  return { nodes: key.nodes, engineBuild: reviewBuildKey(key.engineBuild) };
}
