import { Chess, type Square } from 'chess.js';

import { attackersOf, pieceRef, VALUE } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * Trading pieces while behind.
 *
 * The mistake is not the capture, it is the simplification: every even
 * exchange made a pawn down makes the deficit a larger share of what is left
 * on the board. So the test is deliberately narrow — a capture, a real
 * deficit, and an exchange that is even in both directions (equal values, and
 * a recapture waiting on the landing square). Winning material is not this
 * motif, and neither is a losing trade.
 */
export function tradedWhileBehind(
  fenBefore: string,
  uci: string,
  materialBefore: number,
): Motif | null {
  if (materialBefore > -2) return null;
  if (uci.length < 4) return null;

  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return null;
  }

  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const mover = pieceRef(chess, from);
  if (!mover) return null;

  const side = mover.color as Color;
  const enemy: Color = side === 'w' ? 'b' : 'w';

  // The captured piece, including the pawn that en passant leaves behind on
  // the mover's own rank rather than on the landing square.
  let captured: PieceRef | null = pieceRef(chess, to);
  if (captured && captured.color !== enemy) return null;
  if (!captured && mover.piece === 'P' && from[0] !== to[0]) {
    captured = pieceRef(chess, (to[0]! + from[1]!) as Square);
    if (captured && captured.color !== enemy) captured = null;
  }
  if (!captured) return null;

  const movingValue = VALUE[mover.piece.toLowerCase()] ?? 0;
  if ((VALUE[captured.piece.toLowerCase()] ?? 0) !== movingValue) return null;

  let after: Chess;
  try {
    after = new Chess(fenBefore);
    after.move({ from, to, promotion: uci.length > 4 ? uci[4] : undefined });
  } catch {
    return null;
  }

  // An exchange needs the other half: something of theirs must be able to
  // take back on the square we landed on.
  if (attackersOf(after, to, enemy).length === 0) return null;

  return { type: 'traded_while_behind', deficit: -materialBefore, captured };
}
