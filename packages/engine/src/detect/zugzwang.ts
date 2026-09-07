import { Chess } from 'chess.js';

import { captureValue } from '../motifs.ts';
import { expectedPoints, fromMoverView, winPercent } from '../scoring.ts';
import type { EngineLine, Motif, MoveAnalysis, Review } from '../types.ts';

/**
 * Zugzwang: the obligation to move is itself the damage.
 *
 * The engine cannot say "this side would rather pass", so the shape has to be
 * read off the review. The trap is to compare the mover's best line against
 * their own `winBefore` — those are the same number, so that test can never
 * fire. The baseline has to come from *before* the obligation existed: the
 * mover's own standing after their previous move (design §5).
 *
 * Five things have to hold at once:
 *
 *  1. an endgame — with a full board the side to move nearly always has a
 *     spare tempo somewhere, so zugzwang is a piece-count question first;
 *  2. the opponent's intervening move was not itself a mistake, so the drop
 *     is the mover's obligation and not a gift the opponent handed back;
 *  3. the mover's best line now sits well below that standing;
 *  4. no engine line escapes — one line holding means the mover had a move,
 *     and a position with a move is not zugzwang;
 *  5. the best move is quiet. A capture or a check is activity; zugzwang is
 *     what happens when there is nothing to do and something must be done.
 */

/** Design §5: "endgame" is a piece count, so it is one number, not a judgement. */
const ENDGAME_PIECES = 7;

/** How far the best line must sit below the mover's earlier standing. */
const BEST_LINE_DROP = 0.1;

/** How far every other line must sit below it too. */
const EVERY_LINE_DROP = 0.05;

/** The most the opponent's intervening move may have cost and still count as good. */
const OPPONENT_SLACK = 0.02;

/** Pieces of both colours on the board, kings included. */
function pieceCount(fen: string): number | null {
  let board: ReturnType<Chess['board']>;
  try {
    board = new Chess(fen).board();
  } catch {
    return null;
  }
  let total = 0;
  for (const row of board) {
    for (const cell of row) if (cell) total += 1;
  }
  return total;
}

/** A White-relative engine score as expected points for the side that moved. */
function moverExpectedPoints(line: EngineLine, moverIsWhite: boolean): number {
  return expectedPoints(winPercent(fromMoverView(line.score, moverIsWhite)));
}

/** The position after `uci`, or null when it does not play from `fen`. */
function afterMove(fen: string, uci: string): Chess | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  try {
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] } : {}),
    });
  } catch {
    return null;
  }
  return chess;
}

const atPly = (review: Review, ply: number): MoveAnalysis | undefined =>
  review.moves.find((m) => m.ply === ply);

export function zugzwang(review: Review, ply: number): Motif | null {
  const move = atPly(review, ply);
  if (!move) return null;

  const count = pieceCount(move.fenBefore);
  if (count === null || count > ENDGAME_PIECES) return null;

  // The mover's standing before the opponent's last move: what the position
  // was worth to them when they last had a say in it. Without it there is no
  // baseline, and with no baseline there is nothing to call zugzwang.
  const previous = atPly(review, ply - 2);
  if (!previous) return null;

  // The opponent's move in between. It has to exist — the two plies are what
  // make this the mover's *next* turn rather than a jump across the game.
  const intervening = atPly(review, ply - 1);
  if (!intervening) return null;

  // A move that cost the opponent real points explains the change on its own.
  if (intervening.epLoss > OPPONENT_SLACK) return null;

  const standing = expectedPoints(previous.winAfter);

  const lines = move.evalBefore.lines;
  if (lines.length === 0) return null;

  // The engine's own choice has to leave the mover materially worse off than
  // they were standing a move ago.
  if (expectedPoints(move.winBefore) > standing - BEST_LINE_DROP) return null;

  const moverIsWhite = move.color === 'w';
  const everyLineDrops = lines.every(
    (line) => moverExpectedPoints(line, moverIsWhite) <= standing - EVERY_LINE_DROP,
  );
  if (!everyLineDrops) return null;

  // A waiting position: the best the mover can do is neither take something
  // nor give check. Fall back to the engine's first line when `bestLine` is
  // empty, since that is where `bestLine` comes from.
  const best = move.bestLine[0] ?? lines[0]!.pv[0];
  if (!best) return null;
  if (captureValue(move.fenBefore, best) !== 0) return null;

  const played = afterMove(move.fenBefore, best);
  if (!played || played.inCheck()) return null;

  return { type: 'zugzwang', side: move.color };
}
