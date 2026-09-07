import { Chess, type Color as ChessColor, type Square } from 'chess.js';

import { ALL_SQUARES, attackersOf, pieceRef, pieceValue } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * A discovered attack: the piece that moved is not the piece doing the damage.
 *
 * Found by comparing two boards rather than walking rays. A friendly bishop,
 * rook or queen that hits something after the move and did not hit it before,
 * without having moved itself, can only have been let out by the piece that
 * stepped aside — which is exactly the motif, and exactly what makes it hard
 * to see over the board.
 */

const OTHER = (side: Color): Color => (side === 'w' ? 'b' : 'w');

const SLIDERS: ReadonlySet<PieceRef['piece']> = new Set(['B', 'R', 'Q']);

/** Did this piece sit on this square, untouched, on both boards? */
function stoodStill(before: Chess, after: Chess, square: Square): boolean {
  const was = before.get(square);
  const is = after.get(square);
  return was !== undefined && is !== undefined && was.type === is.type && was.color === is.color;
}

/**
 * The discovery created by `uci`, or null.
 *
 * `mover` is the piece that moved, named where it landed — that is where the
 * reader will look for it. Only targets worth talking about count: the king
 * (a discovered check), a piece worth at least as much as the attacker, or
 * something nobody is defending.
 */
export function discoveredAttack(fenBefore: string, uci: string): Motif | null {
  let before: Chess;
  try {
    before = new Chess(fenBefore);
  } catch {
    return null;
  }

  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;

  const after = new Chess(fenBefore);
  try {
    after.move({ from, to, promotion });
  } catch {
    return null;
  }

  const mover = pieceRef(after, to);
  if (!mover) return null;

  const side: Color = mover.color;
  const enemy = OTHER(side);

  let best: Motif | null = null;
  let bestScore = -1;

  for (const square of ALL_SQUARES) {
    if (square === to) continue; // The mover's own new attacks are not discoveries.
    const attacker = pieceRef(after, square);
    if (!attacker || attacker.color !== side || !SLIDERS.has(attacker.piece)) continue;
    if (!stoodStill(before, after, square)) continue;

    for (const target of ALL_SQUARES) {
      const victim = pieceRef(after, target);
      if (!victim || victim.color !== enemy) continue;
      if (!after.attackers(target, side as ChessColor).includes(square)) continue;
      if (before.attackers(target, side as ChessColor).includes(square)) continue;

      const check = victim.piece === 'K';
      const undefended = attackersOf(after, target, enemy).length === 0;
      if (!check && pieceValue(victim) < pieceValue(attacker) && !undefended) continue;

      // A discovered check is the point of the motif; after that, the biggest
      // thing the uncovered piece is now hitting.
      const score = (check ? 100 : 0) + pieceValue(victim);
      if (score <= bestScore) continue;
      bestScore = score;
      best = { type: 'discovered_attack', mover, attacker, target: victim, check };
    }
  }

  return best;
}
