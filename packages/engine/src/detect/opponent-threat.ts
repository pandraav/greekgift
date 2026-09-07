import { Chess, type Color as ChessColor, type Move, type Square } from 'chess.js';

import { ALL_SQUARES, attackersOf, forkBy, pieceRef, pieceValue } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * What the opponent gets to do next.
 *
 * The engine already told us its reply; this asks what that reply *is* in
 * words a reader recognises — it takes something, it forks, it checks, it
 * queens, it mates. The answer has to be the strongest true one, because
 * "and then they check you" is a silly thing to say about a move that mates.
 */

type ThreatKind = 'capture' | 'fork' | 'check' | 'mate' | 'promotion';

/** Highest kind wins, per design §5. */
const RANK: Record<ThreatKind, number> = {
  mate: 5,
  fork: 4,
  capture: 3,
  promotion: 2,
  check: 1,
};

const OTHER = (side: Color): Color => (side === 'w' ? 'b' : 'w');

function kingOf(chess: Chess, side: Color): PieceRef | null {
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (piece?.type === 'k' && piece.color === side) return pieceRef(chess, square);
  }
  return null;
}

/**
 * Does the line end in mate delivered by the side that replied?
 *
 * Played out rather than trusted: a `#` on the last SAN is a hint, and the
 * board is the proof. The parity matters — a line that ends with the *reader*
 * mating is not a threat against them.
 */
function lineEndsInMate(fenAfter: string, replyLine: string[], replier: Color): boolean {
  if (replyLine.length === 0) return false;

  const board = new Chess(fenAfter);
  for (const san of replyLine) {
    try {
      board.move(san);
    } catch {
      // An unplayable line still carries its own claim on its last move.
      const last = replyLine[replyLine.length - 1];
      return last?.endsWith('#') === true && replyLine.length % 2 === 1;
    }
  }
  return board.isCheckmate() && board.turn() !== (replier as ChessColor);
}

/** A pawn on the seventh with nothing standing in its way. */
function clearPathToPromote(chess: Chess, from: Square, side: Color): boolean {
  const promotionSquare = (from[0]! + (side === 'w' ? '8' : '1')) as Square;
  if (chess.get(promotionSquare)) return false;

  const guards = attackersOf(chess, promotionSquare, OTHER(side));
  if (guards.length === 0) return true;
  return attackersOf(chess, promotionSquare, side).length >= guards.length;
}

/** Can the side to move legally take the piece on `square`? */
function canBeTaken(chess: Chess, square: Square): boolean {
  return chess.moves({ verbose: true }).some((move) => move.to === square);
}

/**
 * The threat carried by the engine's reply to the move just played.
 *
 * `fenAfter` is the position the played move produced, `replyUci` the reply,
 * `replyLine` the SAN continuation it starts. Returns the single strongest
 * threat, or null when the reply merely improves the opponent's position.
 */
export function opponentThreat(
  fenAfter: string,
  replyUci: string,
  replyLine: string[],
): Motif | null {
  let before: Chess;
  try {
    before = new Chess(fenAfter);
  } catch {
    return null;
  }

  const from = replyUci.slice(0, 2) as Square;
  const to = replyUci.slice(2, 4) as Square;
  const promotion = replyUci.length > 4 ? replyUci.slice(4, 5) : undefined;

  const moved = pieceRef(before, from);
  if (!moved) return null;

  const after = new Chess(fenAfter);
  let played: Move;
  try {
    played = after.move({ from, to, promotion });
  } catch {
    return null;
  }

  const by = pieceRef(after, to);
  if (!by) return null;

  const replier: Color = by.color;
  const victimSide = OTHER(replier);
  const enemyKing = kingOf(after, victimSide);

  const candidates: { kind: ThreatKind; targets: PieceRef[] }[] = [];

  if (after.isCheckmate() || lineEndsInMate(fenAfter, replyLine, replier)) {
    candidates.push({ kind: 'mate', targets: enemyKing ? [enemyKing] : [] });
  }

  const fork = forkBy(after.fen(), to, true);
  if (fork && fork.type === 'fork') candidates.push({ kind: 'fork', targets: fork.targets });

  // The capture is judged on the board the reply was played from: what stood
  // there, who was holding it, and whether the piece taking it was cheaper.
  const enPassant = moved.piece === 'P' && from[0] !== to[0] && !before.get(to);
  const victimSquare = enPassant ? ((to[0]! + from[1]!) as Square) : to;
  const victim = pieceRef(before, victimSquare);
  if (victim && victim.color === victimSide) {
    const undefended = attackersOf(before, victimSquare, victimSide).length === 0;
    const winsByValue = pieceValue(moved) < pieceValue(victim);
    if (undefended || winsByValue) candidates.push({ kind: 'capture', targets: [victim] });
  }

  const promotes = played.promotion !== undefined;
  const seventh = replier === 'w' ? '7' : '2';
  const onSeventh = by.piece === 'P' && to[1] === seventh;
  if (promotes || (onSeventh && clearPathToPromote(after, to, replier))) {
    candidates.push({ kind: 'promotion', targets: [] });
  }

  if (after.isCheck() && enemyKing) {
    const checkers = attackersOf(after, enemyKing.square as Square, replier);
    if (checkers.length > 0 && !checkers.some((c) => canBeTaken(after, c.square as Square))) {
      candidates.push({ kind: 'check', targets: [enemyKing] });
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (RANK[b.kind] > RANK[a.kind] ? b : a));
  return {
    type: 'opponent_threat',
    kind: best.kind,
    by,
    targets: best.targets,
    line: replyLine,
  };
}
