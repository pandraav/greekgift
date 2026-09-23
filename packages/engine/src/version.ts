/**
 * Which rules a stored review was built with.
 *
 * A review is a pure function of (game, position evals, these rules). The
 * evals are keyed by (fen, nodes, engineBuild) and stay valid across rule
 * changes; a review does not. So the `reviews` table is keyed by the engine
 * build *plus* this version (`reviewBuildKey`), while `position_evals` keeps
 * the plain engine build and its rows are reused.
 *
 * RULE: bump this whenever anything that changes a built Review changes —
 * classification (scoring.ts, review.ts, motifs.ts `sacrificeFor`), the
 * opening book or `findOpening`, accuracy, key moments, or report.ts. Old
 * review rows are then never read again, and the app rebuilds each review
 * from its cached evals on the next open (no engine run needed).
 *
 * History: (none) — before review-overhaul; 's2' — review-overhaul
 * (chess.com-style classes, lichess accuracy, gap-tolerant book); 's3' —
 * clocks, time control and ending (§14); 's4' — at most eight key
 * moments, in ply order (§9.1).
 */
export const SCORING_VERSION = 's4';

/**
 * The `reviews.engine_build` value for a review built by `engineBuild` under
 * the current rules, e.g. `stockfish-18-lite-single+s4`. Idempotent: a key
 * that already carries the current version is returned unchanged.
 */
export function reviewBuildKey(engineBuild: string): string {
  const suffix = `+${SCORING_VERSION}`;
  return engineBuild.endsWith(suffix) ? engineBuild : `${engineBuild}${suffix}`;
}
