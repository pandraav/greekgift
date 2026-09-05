import { ENGINE_BUILD } from './client';

/**
 * What a review is computed at.
 *
 * These two values, with the position, are the cache key for every stored
 * evaluation — change either and you get fresh rows rather than a silently
 * stale review, which is why they live in one place rather than being passed
 * around as literals.
 *
 * 300k nodes reached depth 15–17 in the bench and takes about a third of a
 * second a position; a 40-move game finishes in roughly half a minute across
 * four workers. A million nodes gains perhaps half a pawn of precision on
 * quiet positions and costs three times the wait, which is the wrong trade
 * for someone reviewing last night's blitz.
 */
export const ANALYSIS_NODES = 300_000;

/** Best line plus two alternatives: enough to say "you could have played…". */
export const ANALYSIS_MULTIPV = 3 as const;

export { ENGINE_BUILD };
