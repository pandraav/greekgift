import type { KeyMoment, MoveAnalysis } from '@greekgift/engine';

/**
 * The slice of a review a list row needs.
 *
 * A stored `Review` carries an evaluation for every ply — hundreds of
 * kilobytes a game — and a page of two hundred rows wants five fields per
 * move. These types name that slice so the projection in `moments-store` and
 * the fold in `week.ts` agree on it, and so `week.ts` stays free of
 * `server-only`: this module imports nothing at runtime.
 *
 * `Review` structurally satisfies `SlimReview`, so anything written against
 * the slim shape still takes a whole review.
 */

export type SlimMove = Pick<
  MoveAnalysis,
  'ply' | 'color' | 'uci' | 'fenAfter' | 'classification'
>;

export interface SlimReview {
  keyMoments: KeyMoment[];
  moves: SlimMove[];
  white: { accuracy: number };
  black: { accuracy: number };
}

/**
 * The standard start position. Lives here — the one pure module all three
 * callers can reach — so `week.ts`, the player page and the chess.com
 * callback compare against the same string.
 */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
