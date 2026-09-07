import { Chess, type Square } from 'chess.js';

import type { Color, Motif, PieceRef } from '../types.ts';
import { ALL_SQUARES, attackersOf, pieceRef, pieceValue } from '../motifs.ts';

/**
 * A defender with two jobs and one move.
 *
 * The tactic that follows is always the same shape: take one of the things it
 * guards, and whichever way it recaptures the other one falls. So the motif is
 * exactly that — the sole defender of two or more pieces that the enemy is
 * already attacking.
 */

/** At most this many overloaded defenders are worth naming in one note. */
const MAX = 2;

/**
 * Every overloaded defender of `side`, most burdened first.
 *
 * Kings are excluded as duties — nothing "defends" a king — but a king may
 * perfectly well be the overloaded defender itself, which is how half of all
 * endgame overloads happen.
 */
export function overloadedDefenders(fen: string, side: Color): Motif[] {
  const chess = new Chess(fen);
  const enemy: Color = side === 'w' ? 'b' : 'w';

  const byDefender = new Map<string, PieceRef[]>();

  for (const square of ALL_SQUARES) {
    const target = pieceRef(chess, square);
    if (!target || target.color !== side || target.piece === 'K') continue;

    if (attackersOf(chess, square, enemy).length === 0) continue;

    const defenders = attackersOf(chess, square, side);
    if (defenders.length !== 1) continue;

    const defender = defenders[0]!;
    const duties = byDefender.get(defender.square) ?? [];
    duties.push(target);
    byDefender.set(defender.square, duties);
  }

  const found: Motif[] = [];
  for (const [square, duties] of byDefender) {
    if (duties.length < 2) continue;
    const defender = pieceRef(chess, square as Square);
    if (!defender) continue;
    found.push({
      type: 'overloaded_defender',
      defender,
      duties: [...duties].sort(
        (a, b) => pieceValue(b) - pieceValue(a) || a.square.localeCompare(b.square),
      ),
    });
  }

  return found
    .sort((a, b) => {
      if (a.type !== 'overloaded_defender' || b.type !== 'overloaded_defender') return 0;
      return (
        b.duties.length - a.duties.length ||
        pieceValue(b.defender) - pieceValue(a.defender) ||
        a.defender.square.localeCompare(b.defender.square)
      );
    })
    .slice(0, MAX);
}
