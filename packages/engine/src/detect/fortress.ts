import { material } from '../motifs.ts';
import type { Color, Motif, MoveAnalysis, Review } from '../types.ts';

/**
 * Fortress: a side is down material and the evaluation refuses to move.
 *
 * Material says one player is winning; the engine says nobody is. That
 * disagreement, held for long enough, is what a fortress looks like from the
 * outside — the extra rook cannot be converted because there is no way in.
 *
 * Two conditions, both from design §5: a deficit of at least three pawn units,
 * and White's win% pinned inside 40–60 for the last eight plies ending at this
 * one. Eight is what makes it a fortress rather than a momentary balance: a
 * position can sit at 50 for a ply or two on the way to anywhere.
 */

/** Below this the deficit is an imbalance, not a fortress. */
const MIN_DEFICIT = 3;

/** The band inside which the evaluation counts as refusing to move. */
const STABLE_LOW = 40;
const STABLE_HIGH = 60;

/** How many consecutive stable plies make it a fortress rather than a pause. */
const MIN_STABLE_PLIES = 8;

/**
 * White's win% after a move.
 *
 * `winAfter` is stored in the mover's view, so Black's moves need flipping
 * before the two colours can be compared on one scale.
 */
function whiteWinAfter(move: MoveAnalysis): number {
  return move.color === 'w' ? move.winAfter : 100 - move.winAfter;
}

const isStable = (move: MoveAnalysis): boolean => {
  const win = whiteWinAfter(move);
  return win >= STABLE_LOW && win <= STABLE_HIGH;
};

export function fortress(review: Review, ply: number): Motif | null {
  const index = review.moves.findIndex((m) => m.ply === ply);
  if (index === -1) return null;

  const move = review.moves[index]!;

  // Material is White-relative, so its sign names the side that is behind.
  const balance = material(move.fenAfter);
  const deficit = Math.abs(balance);
  if (deficit < MIN_DEFICIT) return null;
  const side: Color = balance > 0 ? 'b' : 'w';

  // Count backwards from this ply for as long as the evaluation holds. The run
  // has to include this move itself — a fortress that has just broken is not
  // one we should be naming here.
  let stablePlies = 0;
  for (let i = index; i >= 0 && isStable(review.moves[i]!); i -= 1) stablePlies += 1;

  if (stablePlies < MIN_STABLE_PLIES) return null;

  return { type: 'fortress', side, deficit, stablePlies };
}
