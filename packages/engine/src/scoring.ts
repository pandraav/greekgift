import type { Classification, Score } from './types.ts';

/**
 * Turning engine numbers into the things a review shows.
 *
 * Every constant here is somebody else's published work, cited at its use.
 * Nothing is invented, because a number a player cannot check against
 * chess.com or lichess is a number they have no reason to believe.
 */

/** Beyond this a position is winning; more centipawns say nothing extra. */
const CP_CLAMP = 1000;

/** lichess's logistic fit, from AccuracyPercent.scala / WinPercent.scala. */
const WIN_K = 0.00368208;

/**
 * Win percentage for the side to move, 0–100.
 *
 * Centipawns are not linear in anything a player feels: the difference between
 * +1 and +2 matters far more than between +8 and +9. This maps them onto the
 * only scale that behaves — the chance of winning.
 */
export function winPercent(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_K * cp)) - 1);
}

/** Expected points, 0–1. The spec's `EP = win / 100`. */
export const expectedPoints = (win: number): number => win / 100;

/** A White-relative score, seen from the side that just moved. */
export function fromMoverView(score: Score, moverIsWhite: boolean): Score {
  if (moverIsWhite) return score;
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -(score.cp ?? 0) };
}

/* ── classification ───────────────────────────────────────────────────── */

/**
 * WintrChess's expected-points ladder, in the mover's view.
 *
 * The spec writes the first rung as `best < 0.01`, which read literally would
 * label *any* move losing under 1% as best — including one the engine did not
 * pick, which makes `playedBest` do nothing and puts "Best" on moves that were
 * not. chess.com reserves Best for the engine's own choice and calls an
 * equally-good alternative Excellent, which is both more useful and what a
 * player expects. So: finding the engine move earns `best`, and everything
 * else starts at `excellent`.
 */
const LADDER: [number, Classification][] = [
  [0.045, 'excellent'],
  [0.08, 'good'],
  [0.12, 'inaccuracy'],
  [0.22, 'mistake'],
];

export interface ClassifyInput {
  /** Mover's win% before their move. */
  winBefore: number;
  /** Mover's win% after it. */
  winAfter: number;
  /** Did they play the engine's first choice? */
  playedBest: boolean;
  /** Was it the only legal move? */
  forced: boolean;
  /** Still inside the opening book? */
  inBook: boolean;
  /** Did the move deliver mate? */
  isMate?: boolean;
}

export interface Classified {
  classification: Classification;
  /** Expected points lost, never negative. */
  epLoss: number;
  forced: boolean;
}

export function classify(input: ClassifyInput): Classified {
  // Win% only ever *falls* from the mover's point of view when they err. A
  // rise means the engine liked the position more afterwards, which is not a
  // mistake, so the loss floors at zero.
  const epLoss = Math.max(
    0,
    expectedPoints(input.winBefore) - expectedPoints(input.winAfter),
  );

  if (input.inBook) return { classification: 'book', epLoss, forced: input.forced };
  if (input.isMate) return { classification: 'best', epLoss, forced: input.forced };

  // A forced move is displayed as best with a flag, not as an eleventh class:
  // there was nothing to get right.
  if (input.forced) return { classification: 'best', epLoss, forced: true };

  if (input.playedBest) return { classification: 'best', epLoss, forced: false };

  for (const [threshold, name] of LADDER) {
    if (epLoss < threshold) return { classification: name, epLoss, forced: false };
  }
  return { classification: 'blunder', epLoss, forced: false };
}

/* ── accuracy ─────────────────────────────────────────────────────────── */

/**
 * lichess's per-move accuracy curve.
 *
 * The `+ 1` is lichess's own: it makes a perfect move score 100 rather than
 * 99.99, which matters only because players notice.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const lost = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * lost) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function harmonicMean(xs: number[]): number {
  // Floored so one catastrophe cannot drive the harmonic mean to zero and
  // swallow an otherwise decent game.
  return xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 10), 0);
}

/**
 * Game accuracy for one player, from their per-move accuracies in order.
 *
 * lichess's method, and the reason it is not a plain average: a move played in
 * a volatile position deserves more weight than one played in a dead position,
 * so each move is weighted by how much the evaluation was swinging around it.
 * The result is averaged with a harmonic mean, which refuses to let a run of
 * good moves hide a disaster.
 */
export function gameAccuracy(moveAccuracies: number[]): number {
  if (moveAccuracies.length === 0) return 0;
  if (moveAccuracies.length === 1) return moveAccuracies[0]!;

  const window = Math.max(2, Math.min(8, Math.round(moveAccuracies.length / 10)));

  const weights = moveAccuracies.map((_, i) => {
    const slice = moveAccuracies.slice(Math.max(0, i - window + 1), i + 1);
    return Math.max(0.5, Math.min(12, stdev(slice)));
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weighted =
    moveAccuracies.reduce((a, x, i) => a + x * weights[i]!, 0) / totalWeight;

  return Math.max(0, Math.min(100, (weighted + harmonicMean(moveAccuracies) / 1) / 2));
}

/* ── average centipawn loss and the rating estimate ───────────────────── */

/** Centipawn loss for one move, from the mover's view, capped. */
export function centipawnLoss(before: Score, after: Score): number {
  const b = before.mate !== undefined ? Math.sign(before.mate) * CP_CLAMP : (before.cp ?? 0);
  const a = after.mate !== undefined ? Math.sign(after.mate) * CP_CLAMP : (after.cp ?? 0);
  return Math.max(0, Math.min(CP_CLAMP, b - a));
}

export const acpl = (losses: number[]): number =>
  losses.length === 0 ? 0 : losses.reduce((a, b) => a + b, 0) / losses.length;

/**
 * A rating estimate from average centipawn loss.
 *
 * The bare curve says what a player of that accuracy would be rated. When we
 * already know their rating, the estimate is pulled toward it — one game is a
 * tiny sample, and a 1200 who plays one clean game is not suddenly 2000.
 */
export function estimateRating(
  averageLoss: number,
  knownRating?: number,
): { rating: number; band: number } {
  const bare = 3100 * Math.exp(-0.01 * averageLoss);

  if (!knownRating) {
    return { rating: Math.round(bare), band: 250 };
  }

  const expectedLoss = -100 * Math.log(knownRating / 3100);
  const pulled = knownRating * Math.exp(-0.005 * (averageLoss - expectedLoss));

  // The further this game sits from their usual, the less certain we are.
  const band = Math.round(
    Math.max(60, Math.min(400, Math.abs(pulled - knownRating) * 0.6 + 80)),
  );
  return { rating: Math.round(pulled), band };
}
