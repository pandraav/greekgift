import type { Classification, Color, Score } from './types.ts';

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
 * Win percentage, 0–100, from a White-relative score.
 *
 * Centipawns are not linear in anything a player feels: the difference between
 * +1 and +2 matters far more than between +8 and +9. This maps them onto the
 * only scale that behaves — the chance of winning.
 *
 * `forColor` says whose chance: White's by default, so every existing caller
 * keeps meaning what it always meant; Black's is the complement. A mate score
 * is decided, so it lands on exactly 100 or 0 — `mate: 0` counts as a mate
 * *against* White, which is why terminal positions are stored as ±1 (see
 * `terminalScore` in review.ts).
 */
export function winPercent(score: Score, forColor: Color = 'w'): number {
  const white = whiteWinPercent(score);
  return forColor === 'w' ? white : 100 - white;
}

function whiteWinPercent(score: Score): number {
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
 * The expected-points ladder, in the mover's view (review-overhaul design §4.2).
 *
 * chess.com does not publish its thresholds. These are the win%-drop rungs
 * two open-source reviews converged on as their reading of chess.com's
 * labels — Chesskit (https://github.com/GuillaumeSD/Chesskit, classification
 * by win% difference 2/5/10/20) and WintrChess
 * (https://github.com/wintrcat/wintrchess). They are those projects' reading,
 * not chess.com's own numbers.
 *
 * A move below the first rung is `excellent`, never `best`: Best is decided
 * by the stored engine lines (see `classify`), because equality can only be
 * proved inside one search.
 */
export const LADDER: readonly [number, Classification][] = [
  [0.02, 'excellent'],
  [0.05, 'good'],
  [0.1, 'inaccuracy'],
  [0.2, 'mistake'],
]; // epLoss >= 0.20 → 'blunder'

/** "Equal eval": a stored line this close to the top one is also Best (§4.3). */
export const EQUAL_EP = 0.002;
/** A "great" move: every other stored line loses at least this many expected points. */
export const GREAT_MARGIN = 0.15;
/** A "miss": the best line ends at least this much material ahead, in pawn units. */
export const MISS_MATERIAL = 3;
/** A brilliant move gives up at least a minor piece. */
export const BRILLIANT_MIN_VALUE = 3;
/** The alternative is "already winning" from this many centipawns (§4.7). */
export const ALREADY_WINNING_CP = 700;
/** Win% points of slack when a blunder only returns the opponent's gift (§4.6). */
export const GIFT_SLACK = 5;
/** How far both lines are followed when weighing material, in plies (§4.6). */
export const LINE_PLIES = 6;

/** The ladder alone: the class a loss of `epLoss` expected points earns. */
export function classifyLoss(epLoss: number): Classification {
  for (const [threshold, name] of LADDER) {
    if (epLoss < threshold) return name;
  }
  return 'blunder';
}

export interface ClassifyInput {
  /** Mover's win%, from `evalBefore.lines[0]`. */
  winBefore: number;
  /** Mover's win% of the move actually played (review.ts `playedMoveScore`). */
  winPlayed: number;
  /** Where the played move sits among the stored lines, 0-based, or null. */
  playedIndex: number | null;
  /** Was it the only legal move? */
  forced: boolean;
  /** Still inside the opening book? */
  inBook: boolean;
  /** Did the move deliver mate? */
  isMate?: boolean;
  /** The piece given up, from motifs.ts `sacrificeFor`; null when nothing was. */
  sacrifice?: { value: number; netMaterial: number } | null;
  /** The best alternative line was neither a mate for the mover nor ≥ 700cp. */
  notAlreadyWinning: boolean;
  /**
   * Expected points between the played move and the best other stored line,
   * mover's view, floored at 0. Undefined when there was no other line.
   */
  onlyMoveMargin?: number;
  /** Pawn units the best line ends ahead of the played one, parity-matched. */
  missedMaterial: number;
  /** The mover had a forced mate and the played move no longer does. */
  missedMate: boolean;
  /** The played move's score is a forced mate for the opponent. */
  allowsMate: boolean;
  /** The opponent's previous move erred and this one only gave the gift back. */
  opponentGaveChance: boolean;
}

export interface Classified {
  classification: Classification;
  /** Expected points lost, never negative. */
  epLoss: number;
  forced: boolean;
}

/** Design §4.4: first match wins. */
export function classify(input: ClassifyInput): Classified {
  // Win% only ever *falls* from the mover's point of view when they err. A
  // rise means the engine liked the position more afterwards, which is not a
  // mistake, so the loss floors at zero.
  const epLoss = Math.max(
    0,
    expectedPoints(input.winBefore) - expectedPoints(input.winPlayed),
  );
  const forced = input.forced;

  // Checkmate ends the game; it is not theory, not a sacrifice, and not one
  // of several good moves.
  if (input.isMate) return { classification: 'best', epLoss, forced };

  if (input.inBook) return { classification: 'book', epLoss, forced };

  // A forced move is displayed as best with a flag: there was nothing to get
  // right — and so nothing to be great about either.
  if (forced) return { classification: 'best', epLoss, forced: true };

  // Best: the engine's own first line, or another stored line of the same
  // search at an equal score. A move outside the lines is never Best.
  const k = input.playedIndex;
  const isBest = k === 0 || (k !== null && k >= 1 && epLoss <= EQUAL_EP);
  const base: Classification = isBest ? 'best' : classifyLoss(epLoss);

  return { classification: refine(base, input), epLoss, forced: false };
}

function refine(base: Classification, input: ClassifyInput): Classification {
  // Brilliant: at least a minor piece really given up, the move still best
  // or excellent, and not a sacrifice made when everything else won anyway.
  const sac = input.sacrifice;
  if (
    sac &&
    sac.value >= BRILLIANT_MIN_VALUE &&
    sac.netMaterial <= -2 &&
    (base === 'best' || base === 'excellent') &&
    input.notAlreadyWinning
  ) {
    return 'brilliant';
  }

  // Great: the engine's move, and every alternative was materially worse. The
  // margin is expected points so that "0.15" means the same thing at +0.5 as
  // it does at +5.
  if (base === 'best' && (input.onlyMoveMargin ?? 0) >= GREAT_MARGIN) return 'great';

  // Missed mate: a forced mate was on the board and the move let it go. A
  // move that walks into mate itself is a blunder, not a miss.
  if (input.missedMate && !input.allowsMate) return 'miss';

  // Miss: three pawns of material the best line kept and the played line did
  // not. At blunder size only when the opponent had just erred and this move
  // merely gave the gift back; throwing away one's own position stays a
  // blunder.
  if (input.missedMaterial >= MISS_MATERIAL) {
    if (base === 'inaccuracy' || base === 'mistake') return 'miss';
    if (base === 'blunder' && input.opponentGaveChance) return 'miss';
  }

  return base;
}

/* ── accuracy: lichess, exactly ───────────────────────────────────────── */

/**
 * Ported line by line from lichess (review-overhaul design §5):
 * lila `modules/analyse/src/main/AccuracyPercent.scala`, scalalib
 * `lila/src/main/scala/Maths.scala`, scalachess `core/src/main/scala/eval.scala`.
 * The oracle is lila's `AccuracyPercentTest.scala`, ported in scoring.test.ts.
 */

/** scalachess `Cp.CEILING`. */
const LICHESS_CP_CEILING = 1000;
/** scalachess `Cp.initial`. */
export const LICHESS_INITIAL_CP = 15;

/** lichess `forceAsCp`: a mate becomes ±1000, cp is clamped to ±1000. White's view. */
export function forceCp(score: Score): number {
  if (score.mate !== undefined) {
    // Eval.Mate.signum: mate 0 has no sign; treat it as against White, as
    // winPercent does (terminal positions are stored as ±1 anyway).
    return score.mate > 0 ? LICHESS_CP_CEILING : -LICHESS_CP_CEILING;
  }
  const cp = score.cp ?? 0;
  return Math.max(-LICHESS_CP_CEILING, Math.min(LICHESS_CP_CEILING, cp));
}

/** lichess `WinPercent.fromCentiPawns`: no mate case; 1000 cp ≈ 97.5%. */
export function lichessWinPercent(cp: number): number {
  const ceiled = Math.max(-LICHESS_CP_CEILING, Math.min(LICHESS_CP_CEILING, cp));
  const chances = 2 / (1 + Math.exp(-WIN_K * ceiled)) - 1;
  return 50 + 50 * Math.max(-1, Math.min(1, chances));
}

/** lichess `AccuracyPercent.fromWinPercents`, on the mover's win% before and after. */
export function accuracyFromWinPercents(before: number, after: number): number {
  if (after >= before) return 100;
  const winDiff = before - after;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) + -3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/**
 * lichess's per-move accuracy curve on the mover's win% (display only).
 *
 * The `+ 1` is lichess's own "uncertainty bonus". Game accuracy is not an
 * average of these: it is lichess's own function of the position evals
 * (`gameAccuracy`), so the two are not expected to average into each other.
 */
export const moveAccuracy = (winBefore: number, winAfter: number): number =>
  accuracyFromWinPercents(winBefore, winAfter);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** scalalib `Maths.standardDeviation`: population variance. */
function standardDeviation(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

/** scalalib `Maths.harmonicMean`. */
function harmonicMean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.length / xs.reduce((a, v) => a + 1 / Math.max(1, v), 0);
}

/** scalalib `Maths.weightedMean`. */
function weightedMean(pairs: [value: number, weight: number][]): number | null {
  if (pairs.length === 0) return null;
  let v = 0;
  let w = 0;
  for (const [value, weight] of pairs) {
    v += value * weight;
    w += weight;
  }
  return w !== 0 ? v / w : null;
}

/**
 * lichess `AccuracyPercent.gameAccuracy`: a mean of the volatility-weighted
 * mean and the harmonic mean of per-move accuracies.
 *
 * `cps`: White-view cp after each ply, in order (null = unknown). When either
 * colour has no scored move, both are null — lichess returns None for the
 * whole game (its "single move" test).
 */
export function gameAccuracy(
  cps: (number | null)[],
  startColor: Color,
  initialCp: number | null = LICHESS_INITIAL_CP,
): { w: number | null; b: number | null } {
  const all = [initialCp, ...cps].map((cp) => (cp === null ? null : lichessWinPercent(cp)));
  const windowSize = Math.max(2, Math.min(8, Math.floor(cps.length / 10)));

  // Scala's `sliding(n)` yields the whole list once when it is shorter than n.
  const sliding = <T>(xs: T[], n: number): T[][] => {
    if (xs.length <= n) return [xs];
    const out: T[][] = [];
    for (let i = 0; i + n <= xs.length; i++) out.push(xs.slice(i, i + n));
    return out;
  };

  const lead = Math.min(windowSize, all.length) - 2;
  const windows: (number | null)[][] = [
    ...Array.from({ length: Math.max(0, lead) }, () => all.slice(0, windowSize)),
    ...sliding(all, windowSize),
  ];
  const weights = windows.map((win) =>
    win.some((x) => x === null)
      ? null
      : Math.max(0.5, Math.min(12, standardDeviation(win as number[]))),
  );

  const pairs = sliding(all, 2);
  const weighted: { acc: number; weight: number; color: Color }[] = [];
  const n = Math.min(pairs.length, weights.length);
  for (let i = 0; i < n; i++) {
    const pair = pairs[i]!;
    if (pair.length !== 2) continue;
    const [p, next] = pair;
    const weight = weights[i];
    const color: Color = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    if (p == null || next == null || weight == null) continue;
    const acc =
      color === 'w' ? accuracyFromWinPercents(p, next) : accuracyFromWinPercents(next, p);
    weighted.push({ acc, weight, color });
  }

  const colorAccuracy = (color: Color): number | null => {
    const mine = weighted.filter((x) => x.color === color);
    const wm = weightedMean(mine.map((x) => [x.acc, x.weight]));
    const hm = harmonicMean(mine.map((x) => x.acc));
    return wm === null || hm === null ? null : (wm + hm) / 2;
  };

  const w = colorAccuracy('w');
  const b = colorAccuracy('b');
  if (w === null || b === null) return { w: null, b: null };
  return { w, b };
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
