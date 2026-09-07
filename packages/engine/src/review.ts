import { Chess, type Square } from 'chess.js';

import { captureValue, hangingPieces, material } from './motifs.ts';
import { findOpening } from './openings.ts';
import type { ParsedGame } from './pgn.ts';
import {
  acpl,
  centipawnLoss,
  classify,
  estimateRating,
  expectedPoints,
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

/** The best line's score, White-relative, or what the board says when there is no line. */
const scoreOf = (evaluation: PositionEval): Score =>
  evaluation.lines[0]?.score ?? terminalScore(evaluation.fen);

/** How far each engine line is followed when weighing one against another. */
const MAX_LINE = 5;

/** The position at the end of a line, stopping at the first move that does not play. */
function fenAfterLine(fen: string, uciLine: string[]): string {
  const chess = new Chess(fen);
  for (const uci of uciLine.slice(0, MAX_LINE)) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
    } catch {
      break;
    }
  }
  return chess.fen();
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

    const winBefore = winPercent(scoreOf(before), move.color);
    const winAfter = winPercent(scoreOf(after), move.color);

    // Both sides write promotions the same way (`e7e8q`), so this compares.
    const bestMove = before.lines[0]?.pv[0] ?? '';
    const playedBest = bestMove !== '' && bestMove === move.uci;

    // Nothing to get right means nothing to get wrong.
    const forced = new Chess(move.fenBefore).moves().length === 1;
    const isMate = new Chess(move.fenAfter).isCheckmate();

    // Material at the end of each line, mover's view, the way facts.ts reads
    // it, so a "miss" here and a `materialGain` there agree on the number.
    const moverView = (whiteView: number) => (moverIsWhite ? whiteView : -whiteView);
    const bestLine = before.lines[0]?.pv ?? [];
    const playedLine = after.lines[0]?.pv ?? [];
    const materialBefore = moverView(material(move.fenBefore));
    const materialAfterBestLine = moverView(material(fenAfterLine(move.fenBefore, bestLine)));
    const materialAfterPlayedLine = moverView(material(fenAfterLine(move.fenAfter, playedLine)));

    // A sacrifice: a quiet move that leaves the moved piece to be taken, the
    // engine's reply line confirming the material really goes. Sound when the
    // win% held within two points (design §2) — the same reading as facts.ts,
    // so `brilliant` and the `sacrifice` motif never disagree.
    const landedOn = move.uci.slice(2, 4) as Square;
    const quiet = captureValue(move.fenBefore, move.uci) === 0;
    const enPrise =
      quiet &&
      hangingPieces(move.fenAfter, move.color).some(
        (m) => m.type === 'hanging_piece' && m.target.square === landedOn,
      );
    const sacrificeSound =
      enPrise && materialAfterPlayedLine - materialBefore <= -1 && winAfter >= winBefore - 2;

    // How much better the engine's own move was than its runner-up, in
    // expected points from the mover's side. Only meaningful when they played it.
    const second = before.lines[1];
    const onlyMoveMargin =
      playedBest && second
        ? Math.max(
            0,
            expectedPoints(winPercent(before.lines[0]!.score, move.color)) -
              expectedPoints(winPercent(second.score, move.color)),
          )
        : undefined;

    // What the best move would have taken, or what its line ends up ahead by.
    const mateBefore = before.lines[0]?.score.mate;
    const missedMate = !playedBest && mateBefore !== undefined && moverView(mateBefore) > 0;
    const missedMaterial = playedBest
      ? 0
      : Math.max(
          bestMove === '' ? 0 : captureValue(move.fenBefore, bestMove),
          materialAfterBestLine - materialAfterPlayedLine,
        );

    const { classification, epLoss } = classify({
      winBefore,
      winAfter,
      playedBest,
      forced,
      inBook: move.ply <= lastBookPly,
      isMate,
      sacrificeSound,
      ...(onlyMoveMargin !== undefined ? { onlyMoveMargin } : {}),
      missedMaterial,
      missedMate,
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
      severity: PRAISE_SEVERITY[m.classification] ?? severityOf(m.epLoss),
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
