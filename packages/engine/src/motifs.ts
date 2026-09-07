import { Chess, type Color as ChessColor, type Square } from 'chess.js';

import type { Color, Motif, PieceRef } from './types.ts';

/**
 * What is actually true about a position, found by looking rather than asking.
 *
 * The coach may only mention what appears here. That is the whole point of the
 * layer: anything the coach says that is not in this list is caught by the
 * validator, and the deterministic coach cannot say anything else to begin
 * with. So the facts are computed from the board with chess.js.
 */

export const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const FILES = 'abcdefgh';
export const ALL_SQUARES: Square[] = [...'87654321'].flatMap((rank) =>
  [...FILES].map((file) => (file + rank) as Square),
);

const NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceName = (type: string): string => NAMES[type.toLowerCase()] ?? type;

/** Pawn value of a piece reference. */
export const pieceValue = (ref: PieceRef): number => VALUE[ref.piece.toLowerCase()] ?? 0;

/** The piece on `square`, as the coach refers to it, or null for an empty square. */
export function pieceRef(chess: Chess, square: Square): PieceRef | null {
  const piece = chess.get(square);
  if (!piece) return null;
  return {
    piece: piece.type.toUpperCase() as PieceRef['piece'],
    square,
    color: piece.color as Color,
  };
}

/** Material on the board in pawn units, from White's side. */
export function material(fen: string): number {
  const board = new Chess(fen).board();
  let total = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      total += (cell.color === 'w' ? 1 : -1) * (VALUE[cell.type] ?? 0);
    }
  }
  return total;
}

/**
 * Pieces of `side` that attack `square`, cheapest first.
 *
 * chess.js's `attackers` ignores whose turn it is, which is what we want: a
 * piece is defended by its own side regardless of who is to move.
 */
export function attackersOf(chess: Chess, square: Square, side: Color): PieceRef[] {
  return chess
    .attackers(square, side as ChessColor)
    .map((from) => pieceRef(chess, from as Square))
    .filter((ref): ref is PieceRef => ref !== null)
    .sort((a, b) => pieceValue(a) - pieceValue(b));
}

/**
 * Is the piece on `square` hanging?
 *
 * Deliberately naive: more attackers than defenders, or attacked by something
 * cheaper. It is a heuristic and it is named as one — the alternative is a
 * static exchange evaluator, and a coach that says "your knight is hanging"
 * when a full SEE says it is merely awkward is wrong in a way nobody minds.
 */
function hangingAt(chess: Chess, square: Square): Motif | null {
  const target = pieceRef(chess, square);
  if (!target || target.piece === 'K') return null;

  const enemy: Color = target.color === 'w' ? 'b' : 'w';
  const attackers = attackersOf(chess, square, enemy);
  if (attackers.length === 0) return null;

  const defenders = attackersOf(chess, square, target.color);
  const value = pieceValue(target);
  const cheapest = pieceValue(attackers[0]!);

  const undefended = defenders.length === 0;
  const outnumbered = attackers.length > defenders.length;
  const winsMaterial = cheapest < value;

  if (!undefended && !outnumbered && !winsMaterial) return null;

  return { type: 'hanging_piece', target, attackers, defenders };
}

/** Everything of `side`'s that is hanging, worst first. */
export function hangingPieces(fen: string, side: Color): Motif[] {
  const chess = new Chess(fen);
  const found: Motif[] = [];

  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (!piece || piece.color !== side) continue;
    const motif = hangingAt(chess, square);
    if (motif) found.push(motif);
  }

  const worth = (m: Motif) => (m.type === 'hanging_piece' ? pieceValue(m.target) : 0);
  return found.sort((a, b) => worth(b) - worth(a));
}

/**
 * A fork: one piece attacking two or more things worth taking.
 *
 * Only counts targets it is actually winning — a defended pawn attacked by a
 * queen is not a fork, and calling it one teaches the reader something false.
 * `byMover` records whether the forking piece belongs to the side that just
 * moved (a fork created) or to their opponent (a fork walked into).
 */
export function forkBy(fen: string, from: Square, byMover = false): Motif | null {
  const chess = new Chess(fen);
  const by = pieceRef(chess, from);
  if (!by) return null;

  const enemy: Color = by.color === 'w' ? 'b' : 'w';
  const value = pieceValue(by);
  const targets: PieceRef[] = [];

  for (const square of ALL_SQUARES) {
    if (square === from) continue;
    const target = pieceRef(chess, square);
    if (!target || target.color !== enemy) continue;
    if (!attackersOf(chess, square, by.color).some((a) => a.square === from)) continue;

    const defended = attackersOf(chess, square, enemy).length > 0;
    const worth = pieceValue(target);
    // The king always counts: a check inside a fork is what makes it work.
    if (target.piece === 'K' || !defended || worth > value) targets.push(target);
  }

  return targets.length >= 2 ? { type: 'fork', by, targets, byMover } : null;
}

/**
 * Pins against a piece behind. Absolute when the piece behind is the king.
 *
 * Found by removing the candidate and seeing whether the sliding piece now
 * reaches what stood behind it — cheaper and more reliable than ray-walking,
 * and chess.js already knows how every piece moves.
 */
export function pinsAgainst(fen: string, side: Color): Motif[] {
  const chess = new Chess(fen);
  const enemy: Color = side === 'w' ? 'b' : 'w';
  const found: Motif[] = [];

  for (const square of ALL_SQUARES) {
    const pinned = pieceRef(chess, square);
    if (!pinned || pinned.color !== side || pinned.piece === 'K') continue;

    const pinners = attackersOf(chess, square, enemy).filter(
      (a) => a.piece === 'B' || a.piece === 'R' || a.piece === 'Q',
    );
    if (pinners.length === 0) continue;

    const behind = new Chess(fen);
    behind.remove(square);

    for (const pinner of pinners) {
      for (const target of ALL_SQUARES) {
        if (target === square) continue;
        const victim = pieceRef(behind, target);
        if (!victim || victim.color !== side) continue;
        if (
          !behind
            .attackers(target, enemy as ChessColor)
            .includes(pinner.square as Square)
        )
          continue;
        // Only interesting if what is shielded is worth more than the shield.
        if (victim.piece !== 'K' && pieceValue(victim) <= pieceValue(pinned)) continue;

        found.push({
          type: 'pin',
          pinned,
          pinner,
          against: victim,
          absolute: victim.piece === 'K',
        });
        break;
      }
    }
  }

  return found;
}

/** Is `side`'s king short of luft with heavy pieces still on? */
export function backRankWeak(fen: string, side: Color): Motif | null {
  const chess = new Chess(fen);
  const homeRank = side === 'w' ? '1' : '8';

  const kingSquare = ALL_SQUARES.find((square) => {
    const piece = chess.get(square);
    return piece?.type === 'k' && piece.color === side;
  });
  if (!kingSquare || kingSquare[1] !== homeRank) return null;

  const enemy: Color = side === 'w' ? 'b' : 'w';
  const heavy = ALL_SQUARES.some((square) => {
    const piece = chess.get(square);
    return piece?.color === enemy && (piece.type === 'r' || piece.type === 'q');
  });
  if (!heavy) return null;

  // Escape squares are the three in front; blocked by our own pawns is the
  // classic shape, and the reason the motif is worth naming at all.
  const file = FILES.indexOf(kingSquare[0]!);
  const forward = side === 'w' ? '2' : '7';
  const escapes = [file - 1, file, file + 1]
    .filter((f) => f >= 0 && f < 8)
    .map((f) => (FILES[f]! + forward) as Square);

  const sealed = escapes.every((square) => {
    const piece = chess.get(square);
    return piece?.color === side;
  });

  return sealed ? { type: 'back_rank_weak', side } : null;
}

/** The captured piece's value, in pawn units, or 0 for a quiet move. */
export function captureValue(fenBefore: string, uci: string): number {
  const chess = new Chess(fenBefore);
  const to = uci.slice(2, 4) as Square;
  const target = chess.get(to);
  if (target) return VALUE[target.type] ?? 0;

  // En passant: a pawn changing file onto an empty square took something.
  const from = uci.slice(0, 2) as Square;
  const mover = chess.get(from);
  if (mover?.type === 'p' && from[0] !== to[0]) return 1;
  return 0;
}
