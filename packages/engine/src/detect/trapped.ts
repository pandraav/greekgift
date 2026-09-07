import { Chess, type Square } from 'chess.js';

import { ALL_SQUARES, attackersOf, pieceRef, pieceValue } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * A piece with nowhere to go.
 *
 * The shape a coach means by "trapped" is narrow: the piece is under attack,
 * nothing cheaper of ours is holding it, and every square it can reach is
 * worse than the one it stands on. So we ask exactly that, one legal move at
 * a time, and judge each landing square in the position that move produces —
 * a piece that steps away also stops defending what it defended, and the
 * count has to see that.
 */

const OTHER = (side: Color): Color => (side === 'w' ? 'b' : 'w');

/**
 * The same position with `side` to move.
 *
 * A trapped piece is trapped whether or not it is its owner's turn, and the
 * only way to ask chess.js for its moves is to hand it a board where that
 * side moves next. The en-passant square is dropped with the turn: it belongs
 * to the move that was just made, and keeping it would describe a capture
 * that is no longer on offer.
 */
function withTurn(fen: string, side: Color): Chess | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  if (parts[1] === side) {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }
  parts[1] = side;
  parts[3] = '-';
  try {
    return new Chess(parts.join(' '));
  } catch {
    return null;
  }
}

/** Would the piece be worse off on `to` than it is now? */
function landingIsPoisoned(after: Chess, to: Square, mover: PieceRef): boolean {
  const enemy = OTHER(mover.color);
  const attackers = attackersOf(after, to, enemy);
  if (attackers.length === 0) return false;

  const cheapest = pieceValue(attackers[0]!);
  if (cheapest < pieceValue(mover)) return true;

  const defenders = attackersOf(after, to, mover.color);
  return attackers.length > defenders.length;
}

/** Everything of `side`'s that has run out of squares, most valuable first. */
export function trappedPieces(fen: string, side: Color): Motif[] {
  const board = withTurn(fen, side);
  if (!board) return [];

  const enemy = OTHER(side);
  const found: Motif[] = [];

  for (const square of ALL_SQUARES) {
    const target = pieceRef(board, square);
    if (!target || target.color !== side) continue;
    if (target.piece === 'P' || target.piece === 'K') continue;

    const attackers = attackersOf(board, square, enemy);
    if (attackers.length === 0) continue;

    // Something cheaper standing behind it means the capture is a trade, not
    // a trap, and the reader would rightly object to being told otherwise.
    const value = pieceValue(target);
    const defenders = attackersOf(board, square, side);
    if (defenders.some((d) => pieceValue(d) < value)) continue;

    const moves = board.moves({ square, verbose: true });
    const escapes = moves.filter((move) => {
      const probe = withTurn(fen, side);
      if (!probe) return false;
      try {
        probe.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
      } catch {
        return false;
      }
      const landed = pieceRef(probe, move.to as Square);
      if (!landed) return false;
      return !landingIsPoisoned(probe, move.to as Square, landed);
    });
    if (escapes.length > 0) continue;

    found.push({ type: 'trapped_piece', target, attackers });
  }

  return found.sort((a, b) => {
    const worth = (m: Motif) => (m.type === 'trapped_piece' ? pieceValue(m.target) : 0);
    return worth(b) - worth(a);
  });
}
