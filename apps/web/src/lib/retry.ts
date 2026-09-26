import { Chess } from 'chess.js';
import {
  classifyLoss,
  EQUAL_EP,
  terminalScore,
  winPercent,
  type Classification,
  type MoveAnalysis,
  type PositionEval,
  type Score,
} from '@greekgift/engine';

import { playedScore } from './lines';

/**
 * Judging a retry at a key moment (design §9.2).
 *
 * The reader is shown the position before one of their errors and tries a
 * move. The verdict answers two questions a player actually asks: was it the
 * engine's move, and was it better than what I played? Stored lines answer
 * both without an engine; anything else needs the live engine's score of the
 * position the attempt leads to.
 */

export type Versus = 'better' | 'same' | 'worse';

export interface RetryVerdict {
  isBest: boolean;
  versusPlayed: Versus;
  /** The attempt's score, White's view. */
  score: Score;
  /** Expected points lost against `evalBefore.lines[0]`, mover's view. */
  epLoss: number;
  classification: Classification;
}

/** Within this many expected points of the played move, an attempt is "about the same". */
export const RETRY_SAME_BAND = 0.02;
/**
 * Expected points of slack for a move outside the stored lines to still count
 * as best: a 1M search from one root and a 2M search from another never agree
 * to the centipawn.
 */
export const RETRY_BEST_SLACK = 0.01;

type Judged = Pick<
  MoveAnalysis,
  'color' | 'uci' | 'fenBefore' | 'fenAfter' | 'evalBefore' | 'evalAfter' | 'winBefore' | 'winAfter'
>;

const storedIndex = (move: Judged, uci: string): number =>
  move.evalBefore.lines.findIndex((line) => line.pv[0] === uci);

/**
 * Does judging this attempt need the live engine? Not for a stored line, and
 * not for the move that was actually played: both already have a score from
 * the review's own search.
 */
export function needsEngine(move: Judged, attemptUci: string): boolean {
  return attemptUci !== move.uci && storedIndex(move, attemptUci) < 0;
}

/** The position after `uci` from `fen`, or null when it does not play. */
export function fenAfterAttempt(fen: string, uci: string): string | null {
  try {
    const board = new Chess(fen);
    board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] } : {}),
    });
    return board.fen();
  } catch {
    return null;
  }
}

export function judgeAttempt(
  move: Judged,
  attemptUci: string,
  attemptEval: PositionEval | null,
): RetryVerdict {
  const k = storedIndex(move, attemptUci);
  const isPlayed = attemptUci === move.uci;

  let score: Score;
  if (k >= 0) score = move.evalBefore.lines[k]!.score;
  else if (isPlayed) score = playedScore(move);
  else {
    score =
      attemptEval?.lines[0]?.score ??
      terminalScore(fenAfterAttempt(move.fenBefore, attemptUci) ?? move.fenBefore);
  }

  const attemptWin = winPercent(score, move.color);
  const epLoss = Math.max(0, move.winBefore / 100 - attemptWin / 100);

  const isBest = k >= 0 ? k === 0 || epLoss <= EQUAL_EP : epLoss <= RETRY_BEST_SLACK;

  let versusPlayed: Versus = 'same';
  if (!isPlayed) {
    const d = attemptWin / 100 - move.winAfter / 100;
    versusPlayed = d > RETRY_SAME_BAND ? 'better' : d < -RETRY_SAME_BAND ? 'worse' : 'same';
  }

  return {
    isBest,
    versusPlayed,
    score,
    epLoss,
    classification: isBest ? 'best' : classifyLoss(epLoss),
  };
}
