import { Chess, type Color as ChessColor, type Square } from 'chess.js';

import { ALL_SQUARES, attackersOf, pieceRef, pieceValue } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * A skewer: the valuable piece is in front and has to move, and the thing
 * behind it falls.
 *
 * The same trick `pinsAgainst` uses, run the other way round — take the front
 * piece off the board and see what the attacker then reaches. If it reaches
 * something it could not reach before, that something was standing behind the
 * front piece on the same line, which is the whole geometry of the motif.
 */

const OTHER = (side: Color): Color => (side === 'w' ? 'b' : 'w');

const SLIDERS: ReadonlySet<PieceRef['piece']> = new Set(['B', 'R', 'Q']);

/**
 * What the front piece is worth for the comparison.
 *
 * A king cannot be captured, so its material value is zero everywhere else in
 * the engine — but a king in front is the strongest skewer there is, because
 * moving it is not optional. Ranking it above the queen is what makes the
 * classic shape fire.
 */
function frontValue(front: PieceRef): number {
  return front.piece === 'K' ? 10 : pieceValue(front);
}

/** Every piece of `side` skewered to something behind it, front piece first. */
export function skewers(fen: string, side: Color): Motif[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }

  const enemy = OTHER(side);
  const found: Motif[] = [];

  for (const square of ALL_SQUARES) {
    const front = pieceRef(chess, square);
    if (!front || front.color !== side) continue;

    const attackers = attackersOf(chess, square, enemy).filter((a) => SLIDERS.has(a.piece));
    if (attackers.length === 0) continue;

    const stripped = new Chess(fen);
    stripped.remove(square);

    for (const by of attackers) {
      for (const target of ALL_SQUARES) {
        if (target === square) continue;
        const behind = pieceRef(stripped, target);
        if (!behind || behind.color !== side) continue;
        // A king behind is a pin, not a skewer; `pinsAgainst` owns that shape.
        if (behind.piece === 'K') continue;
        if (frontValue(front) <= pieceValue(behind)) continue;

        // Newly reachable only once the front piece is gone: that is "behind".
        if (chess.attackers(target, enemy as ChessColor).includes(by.square as Square)) continue;
        if (!stripped.attackers(target, enemy as ChessColor).includes(by.square as Square)) {
          continue;
        }

        found.push({ type: 'skewer', front, behind, by });
        break;
      }
    }
  }

  return found.sort((a, b) => {
    const worth = (m: Motif) => (m.type === 'skewer' ? frontValue(m.front) : 0);
    return worth(b) - worth(a);
  });
}
