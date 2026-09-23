import { Chess } from 'chess.js';

import { clocksFor } from './clock.ts';
import { endingFor, type ResultCodes } from './ending.ts';
import { material, sacrificeFor } from './motifs.ts';
import { findOpening } from './openings.ts';
import type { ParsedGame } from './pgn.ts';
import {
  acpl,
  ALREADY_WINNING_CP,
  centipawnLoss,
  classify,
  estimateRating,
  expectedPoints,
  forceCp,
  fromMoverView,
  gameAccuracy,
  GIFT_SLACK,
  LINE_PLIES,
  moveAccuracy,
  winPercent,
} from './scoring.ts';
import type {
  Classification,
  Color,
  KeyMoment,
  MoveAnalysis,
  PlayerSummary,
  PositionEval,
  Review,
  Score,
} from './types.ts';

/**
 * Turns a parsed game plus one evaluation per position into a Review.
 *
 * Pure: the same inputs always give the same output, which is what lets a
 * review be computed once in one player's browser and then served to everyone.
 */

/**
 * Normalises a raw UCI score to White's view, for storage.
 *
 * The engine reports from the side to move; the frozen contract stores from
 * White's. Get this wrong and every number downstream is wrong with it, in a
 * way that looks plausible — the loser simply appears to be winning.
 *
 * The arithmetic is the same negation as `fromMoverView`, in the other
 * direction; it has its own name because the direction is the whole point.
 */
export const toWhiteView = (score: Score, sideToMoveIsWhite: boolean): Score =>
  fromMoverView(score, sideToMoveIsWhite);

/**
 * The score of a position the engine had nothing to say about.
 *
 * The client resolves a finished position as `lines: []` — there is no move
 * to search. The board still knows the result: checkmate is a decided game
 * for the side that delivered it, stalemate is a draw. The design writes
 * checkmate as `{ mate: 0 }` for the loser; a bare zero has no sign, and the
 * sign is the whole fact, so it is stored as `mate: 1` when Black is mated and
 * `mate: -1` when White is — the same values `winPercent` already reads as
 * 100 and 0. Anything else without lines is treated as level, which is the
 * placeholder it always was.
 */
export function terminalScore(fen: string): Score {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { cp: 0 };
  }
  if (chess.isCheckmate()) return { mate: chess.turn() === 'w' ? -1 : 1 };
  return { cp: 0 };
}

/**
 * The score to show for a position, White-relative: the best line's, or —
 * when the engine had no line because the game is over — what the board says
 * (`terminalScore`: a mate is ±1, stalemate level). The graph, the eval bar
 * and the lines card use this so a checkmate reads 100/0, not 50 (§4.10).
 */
export const positionScore = (evaluation: PositionEval): Score =>
  evaluation.lines[0]?.score ?? terminalScore(evaluation.fen);

const scoreOf = positionScore;

/** Where the played move sits among the stored lines of fenBefore, 0-based, or null. */
export function playedLineIndex(move: Pick<MoveAnalysis, 'uci' | 'evalBefore'>): number | null {
  const k = move.evalBefore.lines.findIndex((line) => line.pv[0] === move.uci);
  return k === -1 ? null : k;
}

/**
 * White-view score of the move actually played (§4.3).
 *
 * When the move is one of the stored lines of `fenBefore`, that line's score:
 * the same search, root and depth as the best line, so the two compare
 * cleanly. Otherwise the best line of the position it reached.
 */
export function playedMoveScore(
  move: Pick<MoveAnalysis, 'uci' | 'evalBefore' | 'evalAfter' | 'fenAfter'>,
): Score {
  const k = playedLineIndex(move);
  if (k !== null) return move.evalBefore.lines[k]!.score;
  return move.evalAfter.lines[0]?.score ?? terminalScore(move.fenAfter);
}

/** Material at the end of two lines from the same root, parity-matched (§4.6). */
export interface LineMaterial {
  /** Mover's view, fenBefore. */
  before: number;
  /** After `plies` plies of the best line from fenBefore. */
  best: number;
  /** After `plies` plies of the played line from fenBefore. */
  played: number;
  /** Even, 0 when no comparison was possible. */
  plies: number;
}

/** The positions a UCI line reaches from `fen`, stopping at the first move that does not play. */
function walk(fen: string, uciLine: string[], limit: number): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciLine.slice(0, limit)) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
    } catch {
      break;
    }
    out.push(chess.fen());
  }
  return out;
}

/**
 * Material after the best line and after the played line, both counted from
 * `fenBefore` over the same even number of plies, so neither ends on a
 * capture that has not been answered. Shared by `buildReview` (the Miss and
 * the sacrifice) and facts.ts (`materialAfterBestLine` / `materialAfterPlayedLine`).
 */
export function lineMaterial(
  move: Pick<MoveAnalysis, 'color' | 'uci' | 'fenBefore' | 'evalBefore' | 'evalAfter'>,
): LineMaterial {
  const mover = (whiteView: number) => (move.color === 'w' ? whiteView : -whiteView);
  const before = mover(material(move.fenBefore));

  const k = playedLineIndex(move);
  const bestLine = move.evalBefore.lines[0]?.pv ?? [];
  const playedLine =
    k !== null
      ? move.evalBefore.lines[k]!.pv
      : [move.uci, ...(move.evalAfter.lines[0]?.pv ?? [])];

  const bestFens = walk(move.fenBefore, bestLine, LINE_PLIES);
  const playedFens = walk(move.fenBefore, playedLine, LINE_PLIES);
  const shortest = Math.min(LINE_PLIES, bestFens.length, playedFens.length);
  const plies = shortest - (shortest % 2);

  if (plies < 2) return { before, best: before, played: before, plies: 0 };
  return {
    before,
    best: mover(material(bestFens[plies - 1]!)),
    played: mover(material(playedFens[plies - 1]!)),
    plies,
  };
}

/** A White-view score from `color`'s side: a forced mate for them? */
const isMateFor = (score: Score, color: Color): boolean =>
  score.mate !== undefined && (color === 'w' ? score.mate > 0 : score.mate < 0);

/**
 * The best stored line other than the played move is not already winning
 * for the mover: not a mate for them and under 700cp (§4.7, WintrChess).
 * With no alternative line it is false.
 */
function notAlreadyWinning(move: Pick<MoveAnalysis, 'color' | 'evalBefore'>, playedIndex: number | null): boolean {
  const lines = move.evalBefore.lines;
  const alternative = playedIndex === 0 ? lines[1] : lines[0];
  if (!alternative) return false;
  if (isMateFor(alternative.score, move.color)) return false;
  if (alternative.score.mate !== undefined) return true;
  const cp = fromMoverView(alternative.score, move.color === 'w').cp ?? 0;
  return cp < ALREADY_WINNING_CP;
}

const EMPTY_COUNTS = (): Record<Classification, number> => ({
  brilliant: 0,
  great: 0,
  best: 0,
  excellent: 0,
  good: 0,
  book: 0,
  inaccuracy: 0,
  mistake: 0,
  miss: 0,
  blunder: 0,
});

const NOTABLE = new Set<Classification>([
  'blunder',
  'mistake',
  'miss',
  'brilliant',
  'great',
]);

/**
 * How much a moment matters, 0–1.
 *
 * 0.4 expected points — the swing from winning to losing — is as important as
 * a moment gets, so everything at or past it sits at the top together.
 */
const severityOf = (epLoss: number) => Math.min(1, epLoss / 0.4);

/**
 * A move worth praising lost nothing, so its loss says nothing about how much
 * it matters. A brilliancy is the moment of the game short of a decisive
 * blunder; a great move sits with a solid mistake.
 */
const PRAISE_SEVERITY: Partial<Record<Classification, number>> = {
  brilliant: 0.75,
  great: 0.45,
};

/** At most this many key moments per game, the book exit included (§9.1). */
export const KEY_MOMENTS_MAX = 8;

/** At an equal swing, blunders and misses outrank mistakes, which outrank praise. */
const KIND_RANK: Record<string, number> = { blunder: 0, miss: 0, mistake: 1, brilliant: 2, great: 3 };

/**
 * How much a notable move swung the game, in expected points: the loss for
 * an error; for praise, the loss its fixed severity stands for (a brilliancy
 * ranks with a 0.3 swing, a great move with 0.18).
 */
const swingOf = (m: MoveAnalysis): number =>
  PRAISE_SEVERITY[m.classification] !== undefined
    ? PRAISE_SEVERITY[m.classification]! * 0.4
    : m.epLoss;

/**
 * The key moments (review-overhaul §9.1): the book exit, always, plus the
 * largest swings among brilliant / great / miss / mistake / blunder, up to
 * KEY_MOMENTS_MAX in all — ranked by swing, then blunders and misses before
 * mistakes before praise, then earlier first. Returned in ply order.
 */
export function selectKeyMoments(moves: MoveAnalysis[], leftBookPly: number | null): KeyMoment[] {
  const ranked = moves
    .filter((m) => NOTABLE.has(m.classification))
    .sort(
      (a, b) =>
        swingOf(b) - swingOf(a) ||
        KIND_RANK[a.classification]! - KIND_RANK[b.classification]! ||
        a.ply - b.ply,
    );

  const room = KEY_MOMENTS_MAX - (leftBookPly !== null ? 1 : 0);
  const chosen: KeyMoment[] = ranked.slice(0, room).map((m) => ({
    ply: m.ply,
    kind: m.classification as KeyMoment['kind'],
    severity: PRAISE_SEVERITY[m.classification] ?? severityOf(m.epLoss),
  }));

  // Leaving theory is never an error, but it is where the game became the
  // players' own.
  if (leftBookPly !== null) chosen.push({ ply: leftBookPly, kind: 'left_book', severity: 0.2 });

  return chosen.sort((a, b) => a.ply - b.ply || (a.kind === 'left_book' ? -1 : 1));
}

export interface BuildReviewInput {
  gameId: string;
  game: ParsedGame;
  /** One per position — `game.fens.length` of them — already White-relative. */
  evals: PositionEval[];
  whiteUsername: string;
  blackUsername: string;
  whiteRating?: number;
  blackRating?: number;
  nodes: number;
  engineBuild: string;
  /**
   * The opening name from the game's own headers, when there is one.
   *
   * chess.com classifies against a far larger book than the 3,810 positions we
   * ship, so where it has an answer it is the better one. Our book is still
   * what decides `lastBookPly` — the name and the depth are separate questions.
   */
  opening?: { eco: string; name: string };
  /**
   * chess.com's per-side result codes (the `games` columns), which decide
   * the termination kind before the Termination header does (§14.3).
   */
  results?: ResultCodes;
}

export function buildReview(input: BuildReviewInput): Review {
  const { game, evals } = input;

  if (evals.length !== game.fens.length) {
    throw new Error(
      `Need one evaluation per position: ${game.fens.length} positions, ${evals.length} evaluations`,
    );
  }

  // All or nothing: a game without a clock on every move has none (§14.2).
  const clocks = clocksFor(game.moves, game.timeControl);

  const matched = findOpening(game.fens);
  const lastBookPly = matched?.lastBookPly ?? 0;
  // A book run with no named position has no name to offer (§4.9); the PGN
  // header's name, when there is one, is preferred anyway.
  const named =
    input.opening ?? (matched?.name ? { eco: matched.eco, name: matched.name } : undefined);

  const moves: MoveAnalysis[] = [];
  for (const [i, move] of game.moves.entries()) {
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const color = move.color;
    const opponent: Color = color === 'w' ? 'b' : 'w';
    const subject = {
      color,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBefore: before,
      evalAfter: after,
    };

    const winBefore = winPercent(scoreOf(before), color);
    const playedIndex = playedLineIndex(subject);
    const played = playedMoveScore(subject);
    const winPlayed = winPercent(played, color);

    // Both sides write promotions the same way (`e7e8q`), so this compares.
    const bestMove = before.lines[0]?.pv[0] ?? '';

    // Nothing to get right means nothing to get wrong.
    const forced = new Chess(move.fenBefore).moves().length === 1;
    const isMate = new Chess(move.fenAfter).isCheckmate();

    const lm = lineMaterial(subject);
    const sacrifice = sacrificeFor(subject, lm);

    // Every other stored line, against the played move, mover's view.
    const others = before.lines.filter((_, k) => k !== playedIndex);
    const onlyMoveMargin =
      others.length > 0
        ? Math.max(
            0,
            expectedPoints(winPlayed) -
              Math.max(...others.map((l) => expectedPoints(winPercent(l.score, color)))),
          )
        : undefined;

    const best = before.lines[0];
    const missedMate = best !== undefined && isMateFor(best.score, color) && !isMateFor(played, color);
    const allowsMate = isMateFor(played, opponent);

    // The opponent erred on the ply before, and this move gave back no more
    // than their error handed over.
    const prev = moves[i - 1];
    const opponentGaveChance =
      prev !== undefined &&
      prev.color === opponent &&
      (prev.classification === 'inaccuracy' ||
        prev.classification === 'mistake' ||
        prev.classification === 'miss' ||
        prev.classification === 'blunder') &&
      winPlayed >= 100 - prev.winBefore - GIFT_SLACK;

    const { classification, epLoss } = classify({
      winBefore,
      winPlayed,
      playedIndex,
      forced,
      inBook: move.ply <= lastBookPly,
      isMate,
      sacrifice,
      notAlreadyWinning: notAlreadyWinning(subject, playedIndex),
      ...(onlyMoveMargin !== undefined ? { onlyMoveMargin } : {}),
      missedMaterial: Math.max(0, lm.best - lm.played),
      missedMate,
      allowsMate,
      opponentGaveChance,
    });

    moves.push({
      ply: move.ply,
      color,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBefore: before,
      evalAfter: after,
      winBefore,
      // The played move's own score (§4.3), which can differ from evalAfter's.
      winAfter: winPlayed,
      epLoss,
      moveAccuracy: moveAccuracy(winBefore, winPlayed),
      classification,
      forced,
      bestMove,
      bestLine: before.lines[0]?.pv ?? [],
      ...(named ? { opening: named } : {}),
      ...(clocks ? { clock: clocks[i]! } : {}),
    });
  }

  // lichess AccuracyPercent.gameAccuracy over every ply, book included, on
  // position evals (design §5). We analysed the start position, so its score
  // replaces lichess's constant 15cp.
  const accuracy =
    moves.length > 0
      ? gameAccuracy(
          moves.map((m) => forceCp(scoreOf(m.evalAfter))),
          moves[0]!.color,
          forceCp(scoreOf(moves[0]!.evalBefore)),
        )
      : { w: null, b: null };

  const summaryFor = (color: Color): PlayerSummary => {
    const mine = moves.filter((m) => m.color === color);
    const counts = EMPTY_COUNTS();
    for (const m of mine) counts[m.classification]++;

    // Book moves are theory, not play: ACPL leaves them out.
    const scored = mine.filter((m) => m.classification !== 'book');
    const isWhite = color === 'w';

    const averageLoss = acpl(
      scored.map((m) =>
        centipawnLoss(
          fromMoverView(scoreOf(m.evalBefore), isWhite),
          fromMoverView(scoreOf(m.evalAfter), isWhite),
        ),
      ),
    );

    const known = isWhite ? input.whiteRating : input.blackRating;
    const { rating, band } = estimateRating(averageLoss, known);

    return {
      username: isWhite ? input.whiteUsername : input.blackUsername,
      color,
      ...(known !== undefined ? { rating: known } : {}),
      // Null (lichess's None) only in a game where one side never moved.
      accuracy: accuracy[color] ?? 0,
      acpl: averageLoss,
      estimatedRating: rating,
      estimatedRatingBand: band,
      counts,
    };
  };

  const keyMoments = selectKeyMoments(
    moves,
    matched && lastBookPly > 0 && lastBookPly < moves.length ? lastBookPly + 1 : null,
  );

  const built: Omit<Review, 'ending'> = {
    gameId: input.gameId,
    engineBuild: input.engineBuild,
    nodes: input.nodes,
    moves,
    keyMoments,
    white: summaryFor('w'),
    black: summaryFor('b'),
    ...(named ? { opening: { ...named, lastBookPly } } : {}),
    ...(game.timeControl ? { timeControl: game.timeControl } : {}),
  };

  return { ...built, ending: endingFor(built, game, input.results) };
}
