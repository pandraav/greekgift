import { Chess } from 'chess.js';

import { findOpening } from './openings.ts';
import type { ParsedGame } from './pgn.ts';
import {
  acpl,
  centipawnLoss,
  classify,
  estimateRating,
  fromMoverView,
  gameAccuracy,
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

/** Win percentage for one player, from a White-relative score. */
const winFor = (scoreWhite: Score, moverIsWhite: boolean): number =>
  moverIsWhite ? winPercent(scoreWhite) : 100 - winPercent(scoreWhite);

/** The best line's score, or a dead-equal placeholder for a finished position. */
const topScore = (evaluation: PositionEval): Score =>
  evaluation.lines[0]?.score ?? { cp: 0 };

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
}

export function buildReview(input: BuildReviewInput): Review {
  const { game, evals } = input;

  if (evals.length !== game.fens.length) {
    throw new Error(
      `Need one evaluation per position: ${game.fens.length} positions, ${evals.length} evaluations`,
    );
  }

  const matched = findOpening(game.fens);
  const lastBookPly = matched?.lastBookPly ?? 0;
  const named = input.opening ?? (matched ? { eco: matched.eco, name: matched.name } : undefined);

  const moves: MoveAnalysis[] = game.moves.map((move, i) => {
    const before = evals[i]!;
    const after = evals[i + 1]!;
    const moverIsWhite = move.color === 'w';

    const winBefore = winFor(topScore(before), moverIsWhite);
    const winAfter = winFor(topScore(after), moverIsWhite);

    // Both sides write promotions the same way (`e7e8q`), so this compares.
    const bestMove = before.lines[0]?.pv[0] ?? '';
    const playedBest = bestMove !== '' && bestMove === move.uci;

    // Nothing to get right means nothing to get wrong.
    const forced = new Chess(move.fenBefore).moves().length === 1;
    const isMate = new Chess(move.fenAfter).isCheckmate();

    const { classification, epLoss } = classify({
      winBefore,
      winAfter,
      playedBest,
      forced,
      inBook: move.ply <= lastBookPly,
      isMate,
    });

    return {
      ply: move.ply,
      color: move.color,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      evalBefore: before,
      evalAfter: after,
      winBefore,
      winAfter,
      epLoss,
      moveAccuracy: moveAccuracy(winBefore, winAfter),
      classification,
      forced,
      bestMove,
      bestLine: before.lines[0]?.pv ?? [],
      ...(named ? { opening: named } : {}),
    };
  });

  const summaryFor = (color: Color): PlayerSummary => {
    const mine = moves.filter((m) => m.color === color);
    const counts = EMPTY_COUNTS();
    for (const m of mine) counts[m.classification]++;

    // Book moves are theory, not play. Scoring them would let a memorised
    // twelve-move line hand someone an accuracy they did not earn.
    const scored = mine.filter((m) => m.classification !== 'book');
    const isWhite = color === 'w';

    const averageLoss = acpl(
      scored.map((m) =>
        centipawnLoss(
          fromMoverView(topScore(m.evalBefore), isWhite),
          fromMoverView(topScore(m.evalAfter), isWhite),
        ),
      ),
    );

    const known = isWhite ? input.whiteRating : input.blackRating;
    const { rating, band } = estimateRating(averageLoss, known);

    return {
      username: isWhite ? input.whiteUsername : input.blackUsername,
      color,
      ...(known !== undefined ? { rating: known } : {}),
      accuracy: gameAccuracy(scored.map((m) => m.moveAccuracy)),
      acpl: averageLoss,
      estimatedRating: rating,
      estimatedRatingBand: band,
      counts,
    };
  };

  const keyMoments: KeyMoment[] = moves
    .filter((m) => NOTABLE.has(m.classification))
    .map((m) => ({
      ply: m.ply,
      kind: m.classification as KeyMoment['kind'],
      severity: severityOf(m.epLoss),
    }));

  // Leaving theory is never an error, but it is where the game became the
  // players' own — worth marking, and worth ranking below any real mistake.
  if (matched && lastBookPly > 0 && lastBookPly < moves.length) {
    keyMoments.push({ ply: lastBookPly + 1, kind: 'left_book', severity: 0.2 });
  }

  keyMoments.sort((a, b) => b.severity - a.severity || a.ply - b.ply);

  return {
    gameId: input.gameId,
    engineBuild: input.engineBuild,
    nodes: input.nodes,
    moves,
    keyMoments,
    white: summaryFor('w'),
    black: summaryFor('b'),
    ...(named ? { opening: { ...named, lastBookPly } } : {}),
  };
}
