import { Chess, type Square } from 'chess.js';

import { ALL_SQUARES, pieceRef } from '../motifs.ts';
import type { Color, Motif, PieceRef } from '../types.ts';

/**
 * Passed pawns and promotions.
 *
 * A passed pawn is the one long-term fact a beginner can act on, so it is
 * worth saying — but only about the side that just moved, only about the two
 * most advanced ones, and only when it is true after the move. `created` is
 * the interesting half: a pawn that has been passed for ten moves is not
 * news, and a pawn that became passed on this move is.
 */

const FILES = 'abcdefgh';

const rankOf = (square: string): number => Number(square[1]);
const fileOf = (square: string): number => FILES.indexOf(square[0]!);

/** Ranks between the pawn and the square it promotes on. */
const stepsToPromote = (square: string, side: Color): number =>
  side === 'w' ? 8 - rankOf(square) : rankOf(square) - 1;

/** No enemy pawn ahead of it on its file or either neighbour. */
function isPassed(chess: Chess, square: string, side: Color): boolean {
  const enemy: Color = side === 'w' ? 'b' : 'w';
  const file = fileOf(square);
  const rank = rankOf(square);

  for (const candidate of ALL_SQUARES) {
    const piece = chess.get(candidate);
    if (!piece || piece.type !== 'p' || piece.color !== enemy) continue;
    if (Math.abs(fileOf(candidate) - file) > 1) continue;
    const ahead = side === 'w' ? rankOf(candidate) > rank : rankOf(candidate) < rank;
    if (ahead) return false;
  }
  return true;
}

/**
 * Where this pawn stood before the move.
 *
 * The detector is handed two positions and no move, so the origin is read off
 * the board: the pawn either did not move, or it came from one of the squares
 * a pawn can come from. That is enough to ask whether it was already passed.
 */
function originsOf(before: Chess, square: string, side: Color): string[] {
  const own = before.get(square as Square);
  if (own?.type === 'p' && own.color === side) return [square];

  const back = side === 'w' ? -1 : 1;
  const file = fileOf(square);
  const rank = rankOf(square);
  const candidates: string[] = [];

  for (const df of [-1, 0, 1]) {
    const f = file + df;
    if (f < 0 || f > 7) continue;
    candidates.push(FILES[f]! + String(rank + back));
  }
  // The double step, from the pawn's home rank.
  const doubled = rank + 2 * back;
  if ((side === 'w' && rank === 4) || (side === 'b' && rank === 5)) {
    candidates.push(FILES[file]! + String(doubled));
  }

  return candidates.filter((candidate) => {
    if (rankOf(candidate) < 1 || rankOf(candidate) > 8) return false;
    const piece = before.get(candidate as Square);
    return piece?.type === 'p' && piece.color === side;
  });
}

/** The square a promotion happened on, read from the two positions. */
function playedPromotion(before: Chess, after: Chess, side: Color): string | null {
  const pawns = (chess: Chess) =>
    ALL_SQUARES.filter((square) => {
      const piece = chess.get(square);
      return piece?.type === 'p' && piece.color === side;
    }).length;

  // A side's own pawns cannot be captured on that side's own move, so a pawn
  // fewer after the move means one of them turned into something else.
  if (pawns(after) >= pawns(before)) return null;

  const rank = side === 'w' ? '8' : '1';
  for (const file of FILES) {
    const square = (file + rank) as Square;
    const now = after.get(square);
    if (!now || now.color !== side) continue;
    if (now.type === 'p' || now.type === 'k') continue;
    const was = before.get(square);
    if (was && was.type === now.type && was.color === now.color) continue;
    return square;
  }
  return null;
}

/** The square a promotion in the engine's line happens on, UCI or SAN. */
function linePromotion(bestLine: string[]): string | null {
  for (const move of bestLine) {
    if (/^[a-h][1-8][a-h][1-8][qrbn]$/.test(move)) return move.slice(2, 4);
    const san = /([a-h][18])=[QRBN]/.exec(move);
    if (san) return san[1]!;
  }
  return null;
}

/** Passed pawns and promotions for the side that just moved. */
export function pawnMotifs(fenBefore: string, fenAfter: string, bestLine: string[]): Motif[] {
  let before: Chess;
  let after: Chess;
  try {
    before = new Chess(fenBefore);
    after = new Chess(fenAfter);
  } catch {
    return [];
  }

  const side = before.turn() as Color;
  const motifs: Motif[] = [];

  const passers: { pawn: PieceRef; stepsToPromote: number; created: boolean }[] = [];
  for (const square of ALL_SQUARES) {
    const piece = after.get(square);
    if (!piece || piece.type !== 'p' || piece.color !== side) continue;
    if (!isPassed(after, square, side)) continue;

    const origins = originsOf(before, square, side);
    const wasPassed = origins.some((origin) => isPassed(before, origin, side));
    const pawn = pieceRef(after, square);
    if (!pawn) continue;
    passers.push({ pawn, stepsToPromote: stepsToPromote(square, side), created: !wasPassed });
  }

  passers
    .sort((a, b) => a.stepsToPromote - b.stepsToPromote || fileOf(a.pawn.square) - fileOf(b.pawn.square))
    .slice(0, 2)
    .forEach((passer) => {
      motifs.push({
        type: 'passed_pawn',
        pawn: passer.pawn,
        stepsToPromote: passer.stepsToPromote,
        created: passer.created,
      });
    });

  const promoted = playedPromotion(before, after, side);
  if (promoted) {
    motifs.push({ type: 'promotion', square: promoted, inBestLine: false });
  } else {
    const line = linePromotion(bestLine);
    if (line) motifs.push({ type: 'promotion', square: line, inBestLine: true });
  }

  return motifs;
}
