import { forceCp, gameAccuracy } from './scoring.ts';
import { terminalScore } from './review.ts';
import type {
  Classification,
  Color,
  GameEnding,
  KeyMoment,
  MoveAnalysis,
  PlayerSummary,
  PositionEval,
  Review,
  Score,
  TimeControl,
  Verdict,
} from './types.ts';

/**
 * The game report: the summary a reader sees before the moves (design §10).
 *
 * Pure, from a `Review` alone. The phase split is lichess's, so the phase
 * accuracies are the numbers lichess would show for the same evals.
 */

export type Phase = 'opening' | 'middlegame' | 'endgame';

/**
 * scalachess `Division`: board indices (0 = the start position) where the
 * middlegame and endgame start, and how many boards there were.
 */
export interface Division {
  middle: number | null;
  end: number | null;
  plies: number;
}

/* ── scalachess core/src/main/scala/Divider.scala, ported ──────────────── */

/** Occupancy of one FEN: `grid[rank][file]`, rank 0 = rank 1, 'w' | 'b' | null. */
interface Placement {
  grid: ('w' | 'b' | null)[][];
  /** Queens, rooks, bishops and knights of both sides together. */
  majorsAndMinors: number;
}

function placementOf(fen: string): Placement {
  const grid: ('w' | 'b' | null)[][] = Array.from({ length: 8 }, () => Array<'w' | 'b' | null>(8).fill(null));
  let majorsAndMinors = 0;
  const rows = (fen.split(' ')[0] ?? '').split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      if (rank >= 0 && file < 8) {
        grid[rank]![file] = ch === ch.toUpperCase() ? 'w' : 'b';
        if (!/[kKpP]/.test(ch)) majorsAndMinors += 1;
      }
      file += 1;
    }
  });
  return { grid, majorsAndMinors };
}

/** Sparse back rank: pieces have been developed. */
function backrankSparse({ grid }: Placement): boolean {
  const white = grid[0]!.filter((c) => c === 'w').length;
  const black = grid[7]!.filter((c) => c === 'b').length;
  return white < 4 || black < 4;
}

/** Divider.score, verbatim. `y` is the region's rank, 1-based. */
function score(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      switch (black) {
        case 1: return 1 + y;
        case 2: return y < 6 ? 2 + (6 - y) : 0;
        case 3: return y < 7 ? 3 + (7 - y) : 0;
        case 4: return y < 7 ? 3 + (7 - y) : 0;
        default: return 0;
      }
    case 1:
      switch (black) {
        case 0: return 1 + (8 - y);
        case 1: return 5 + Math.abs(4 - y);
        case 2: return 4 + (7 - y);
        case 3: return 5 + (7 - y);
        default: return 0;
      }
    case 2:
      switch (black) {
        case 0: return y > 2 ? 2 + (y - 2) : 0;
        case 1: return 4 + (y - 1);
        case 2: return 7;
        default: return 0;
      }
    case 3:
      switch (black) {
        case 0: return y > 1 ? 3 + (y - 1) : 0;
        case 1: return 5 + (y - 1);
        default: return 0;
      }
    case 4:
      // A group of four on the home row scores 0.
      return black === 0 && y > 1 ? 3 + (y - 1) : 0;
    default:
      return 0;
  }
}

/** Divider.mixedness: every 2×2 region of the board, 7 × 7 of them. */
function mixedness({ grid }: Placement): number {
  let acc = 0;
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      let white = 0;
      let black = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const c = grid[y + dy]![x + dx];
        if (c === 'w') white += 1;
        else if (c === 'b') black += 1;
      }
      acc += score(y + 1, white, black);
    }
  }
  return acc;
}

/** scalachess Divider: where the middlegame and the endgame start. `fens[0]` is the start position. */
export function divide(fens: string[]): Division {
  const boards = fens.map(placementOf);
  const middle = boards.findIndex(
    (b) => b.majorsAndMinors <= 10 || backrankSparse(b) || mixedness(b) > 150,
  );
  const end = middle >= 0 ? boards.findIndex((b) => b.majorsAndMinors <= 6) : -1;
  return {
    middle: middle >= 0 && (end < 0 || middle < end) ? middle : null,
    end: end >= 0 ? end : null,
    plies: fens.length,
  };
}

/** The phase of move ply `ply` (1-based; it produced board `ply`). */
export function phaseOfPly(ply: number, d: Division): Phase {
  if (d.middle === null || ply < d.middle) return 'opening';
  if (d.end !== null && ply >= d.end) return 'endgame';
  return 'middlegame';
}

/* ── phase accuracy: lichess AccuracyPercent.phaseAccuracies ───────────── */

export interface PhaseAccuracy {
  phase: Phase;
  /** Inclusive, move plies. */
  firstPly: number;
  lastPly: number;
  white: number | null;
  black: number | null;
}

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

const cpOf = (evaluation: PositionEval): number =>
  forceCp(evaluation.lines[0]?.score ?? terminalScore(evaluation.fen));

/** The boards a review covers: the start, then the position after every move. */
export const boardsOf = (moves: MoveAnalysis[]): string[] =>
  moves.length === 0 ? [] : [moves[0]!.fenBefore, ...moves.map((m) => m.fenAfter)];

/**
 * Accuracy per phase, per colour. Each phase is lichess's `gameAccuracy` on
 * that phase's plies, starting from the eval of the position before the
 * phase. Phases with no plies are left out; with no middlegame the whole game
 * is one opening row (lichess shows nothing there).
 */
export function phaseAccuraciesFor(moves: MoveAnalysis[], division: Division): PhaseAccuracy[] {
  const out: PhaseAccuracy[] = [];
  for (const phase of PHASES) {
    const slice = moves.filter((m) => phaseOfPly(m.ply, division) === phase);
    if (slice.length === 0) continue;
    const first = slice[0]!;
    const accuracy = gameAccuracy(
      slice.map((m) => cpOf(m.evalAfter)),
      first.color,
      cpOf(first.evalBefore),
    );
    out.push({
      phase,
      firstPly: first.ply,
      lastPly: slice[slice.length - 1]!.ply,
      white: accuracy.w,
      black: accuracy.b,
    });
  }
  return out;
}

export function phaseAccuracies(review: Review): PhaseAccuracy[] {
  return phaseAccuraciesFor(review.moves, divide(boardsOf(review.moves)));
}

/* ── time (review-overhaul design §14.4) ─────────────────────────────── */

/** Time trouble: under min(TROUBLE_MAX_MS, TROUBLE_FRACTION of base) on the clock before the move. */
export const TROUBLE_MAX_MS = 30_000;
export const TROUBLE_FRACTION = 0.1;
/** Fast: under FAST_FRACTION of the player's median think and under FAST_MAX_MS. */
export const FAST_FRACTION = 0.25;
export const FAST_MAX_MS = 5_000;
/** Long think: over LONG_FACTOR x the player's median and at least LONG_MIN_MS. */
export const LONG_FACTOR = 3;
export const LONG_MIN_MS = 30_000;
/** Longest thinks listed per side. */
export const LONGEST_THINKS = 3;
/** The classes a time finding counts as errors. */
export const ERROR_CLASSES: Classification[] = ['mistake', 'blunder', 'miss'];

/** The time-trouble line for a control; null for daily games. */
export function troubleThreshold(tc: TimeControl): number | null {
  if (tc.daily) return null;
  return Math.min(TROUBLE_MAX_MS, TROUBLE_FRACTION * tc.base);
}

export interface Think {
  ply: number;
  /** "21.Rf4" / "11…f6". */
  label: string;
  spent: number;
  left: number;
  classification: Classification;
}

export type TimeFinding =
  | { kind: 'trouble_errors'; side: Color; plies: number[]; errors: number; threshold: number }
  | { kind: 'fast_errors'; side: Color; plies: number[]; errors: number }
  | { kind: 'long_think_errors'; side: Color; plies: number[]; errors: number }
  | { kind: 'flagged'; side: Color; atMove: number; finalThink: number; verdict: Verdict; evalAtEnd: Score };

export interface TimeReport {
  control: TimeControl;
  threshold: number | null;
  /** Clock after each of the side's moves, with { ply: 0, left: base } first. */
  series: Record<Color, { ply: number; left: number }[]>;
  /** Over the side's non-book moves. */
  median: Record<Color, number>;
  phases: { phase: Phase; spent: Record<Color, number>; moves: Record<Color, number> }[];
  /** Top LONGEST_THINKS by spent, ties by ply. */
  longest: Record<Color, Think[]>;
  /** Plies moved in time trouble. */
  trouble: Record<Color, number[]>;
  /** trouble, fast, long-think errors, then a flag — per side, the member's side first. */
  findings: TimeFinding[];
}

/** Per-move time flags, shared by the report and the coach's clock facts. */
export interface MoveTime {
  ply: number;
  spent: number;
  left: number;
  /** The mover's clock before the move: their previous `left`, or the base. */
  leftBefore: number;
  inTrouble: boolean;
  fast: boolean;
  longThink: boolean;
}

const COLORS: Color[] = ['w', 'b'];

/** The think label the coach and report use: "24.Qc4", "24…Kh8". */
export const thinkLabel = (m: Pick<MoveAnalysis, 'ply' | 'color' | 'san'>): string =>
  `${Math.floor((m.ply - 1) / 2) + 1}${m.color === 'w' ? '.' : '…'}${m.san}`;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Each side's median think over its non-book moves, ms. */
export function medianThinks(review: Review): Record<Color, number> {
  const of = (c: Color) =>
    median(
      review.moves
        .filter((m) => m.color === c && m.clock && m.classification !== 'book')
        .map((m) => m.clock!.spent),
    );
  return { w: of('w'), b: of('b') };
}

/**
 * Time flags for every move, by ply; null for a review without clocks or a
 * daily game (where "fast" and "time trouble" mean nothing).
 */
export function moveTimes(review: Review): Map<number, MoveTime> | null {
  const tc = review.timeControl;
  if (!tc || tc.daily) return null;
  if (review.moves.length === 0 || !review.moves.every((m) => m.clock)) return null;

  const threshold = troubleThreshold(tc);
  const medians = medianThinks(review);
  const prev: Record<Color, number> = { w: tc.base, b: tc.base };
  const out = new Map<number, MoveTime>();
  for (const m of review.moves) {
    const { spent, left } = m.clock!;
    const leftBefore = prev[m.color];
    prev[m.color] = left;
    const med = medians[m.color];
    out.set(m.ply, {
      ply: m.ply,
      spent,
      left,
      leftBefore,
      inTrouble: threshold !== null && leftBefore < threshold,
      fast: spent < FAST_FRACTION * med && spent < FAST_MAX_MS,
      longThink: spent > LONG_FACTOR * med && spent >= LONG_MIN_MS,
    });
  }
  return out;
}

/**
 * Time management for both sides, from clocks and classifications alone.
 * Null without clocks, and for daily games.
 */
export function timeReport(review: Review, userSide?: Color | null): TimeReport | null {
  const times = moveTimes(review);
  const tc = review.timeControl;
  if (!times || !tc) return null;

  const threshold = troubleThreshold(tc);
  const division = divide(boardsOf(review.moves));
  const isError = (m: MoveAnalysis) => ERROR_CLASSES.includes(m.classification);

  const series = {} as TimeReport['series'];
  const longest = {} as TimeReport['longest'];
  const trouble = {} as TimeReport['trouble'];
  for (const c of COLORS) {
    const mine = review.moves.filter((m) => m.color === c);
    series[c] = [{ ply: 0, left: tc.base }, ...mine.map((m) => ({ ply: m.ply, left: m.clock!.left }))];
    longest[c] = [...mine]
      .sort((a, b) => b.clock!.spent - a.clock!.spent || a.ply - b.ply)
      .slice(0, LONGEST_THINKS)
      .map((m) => ({
        ply: m.ply,
        label: thinkLabel(m),
        spent: m.clock!.spent,
        left: m.clock!.left,
        classification: m.classification,
      }));
    trouble[c] = mine.filter((m) => times.get(m.ply)!.inTrouble).map((m) => m.ply);
  }

  const phases: TimeReport['phases'] = [];
  for (const phase of PHASES) {
    const slice = review.moves.filter((m) => phaseOfPly(m.ply, division) === phase);
    if (slice.length === 0) continue;
    const sum = (c: Color) =>
      slice.filter((m) => m.color === c).reduce((a, m) => a + m.clock!.spent, 0);
    const count = (c: Color) => slice.filter((m) => m.color === c).length;
    phases.push({ phase, spent: { w: sum('w'), b: sum('b') }, moves: { w: count('w'), b: count('b') } });
  }

  const ending = review.ending;
  const flaggedSide: Color | null =
    ending && (ending.kind === 'timeout' || ending.kind === 'timeout_vs_insufficient') && ending.finalThink !== undefined
      ? ending.winner
        ? ending.winner === 'w' ? 'b' : 'w'
        : (review.moves.at(-1)?.color === 'w' ? 'b' : 'w')
      : null;

  const order: Color[] = userSide === 'b' ? ['b', 'w'] : ['w', 'b'];
  const findings: TimeFinding[] = [];
  for (const side of order) {
    const errorsOf = review.moves.filter((m) => m.color === side && isError(m));
    const errors = errorsOf.length;
    const where = (flag: 'inTrouble' | 'fast' | 'longThink') =>
      errorsOf.filter((m) => times.get(m.ply)![flag]).map((m) => m.ply);

    const inTrouble = where('inTrouble');
    if (inTrouble.length > 0 && threshold !== null) {
      findings.push({ kind: 'trouble_errors', side, plies: inTrouble, errors, threshold });
    }
    const fast = where('fast');
    if (fast.length > 0) findings.push({ kind: 'fast_errors', side, plies: fast, errors });
    const long = where('longThink');
    if (long.length > 0) findings.push({ kind: 'long_think_errors', side, plies: long, errors });

    if (flaggedSide === side && ending) {
      // The move the flagged side was on: the ply after the last one of theirs.
      const lastOwn = [...review.moves].reverse().find((m) => m.color === side);
      const nextPly = lastOwn ? lastOwn.ply + 2 : 1;
      findings.push({
        kind: 'flagged',
        side,
        atMove: Math.floor((nextPly - 1) / 2) + 1,
        finalThink: ending.finalThink!,
        verdict: ending.verdictAtEnd[side],
        evalAtEnd: ending.evalAtEnd,
      });
    }
  }

  return {
    control: tc,
    threshold,
    series,
    median: medianThinks(review),
    phases,
    longest,
    trouble,
    findings,
  };
}

/* ── the report ───────────────────────────────────────────────────────── */

export interface GameReport {
  white: PlayerSummary;
  black: PlayerSummary;
  phases: PhaseAccuracy[];
  /** By ply, `left_book` included. */
  moments: KeyMoment[];
  /** `lastBookMove` reads "6… c5"; null when book ended before the first move. */
  opening: { eco: string; name: string; lastBookPly: number; lastBookMove: string | null } | null;
  /** Clock analysis; null without clocks and for daily games (§14.4). */
  time: TimeReport | null;
  ending: GameEnding;
}

const labelOf = (m: MoveAnalysis): string =>
  `${Math.floor((m.ply - 1) / 2) + 1}${m.color === 'w' ? '.' : '…'} ${m.san}`;

export function gameReport(review: Review, userSide?: Color | null): GameReport {
  const opening = review.opening
    ? {
        eco: review.opening.eco,
        name: review.opening.name,
        lastBookPly: review.opening.lastBookPly,
        lastBookMove:
          review.opening.lastBookPly > 0 && review.moves[review.opening.lastBookPly - 1]
            ? labelOf(review.moves[review.opening.lastBookPly - 1]!)
            : null,
      }
    : null;

  return {
    white: review.white,
    black: review.black,
    phases: phaseAccuracies(review),
    moments: [...review.keyMoments].sort((a, b) => a.ply - b.ply),
    opening,
    time: timeReport(review, userSide),
    ending: review.ending,
  };
}
