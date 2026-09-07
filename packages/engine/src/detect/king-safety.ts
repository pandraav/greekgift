import { Chess, type Color as ChessColor, type Square } from 'chess.js';

import type { Color, Motif, PieceRef } from '../types.ts';
import { ALL_SQUARES, pieceRef, pieceValue } from '../motifs.ts';

/**
 * How exposed a king is, as one number between 0 and 1.
 *
 * Three things make a king unsafe and they are weighted the way a club player
 * would weight them: the pawns in front of it are gone (0.35), the files it
 * stands on are open (0.35), and enemy pieces are already looking at the
 * squares around it (0.30). None of them alone is an emergency; two of them
 * together is, and that is exactly what the 0.5 threshold picks out.
 */

const FILES = 'abcdefgh';

/** The number of shield pawns a king is nominally entitled to. */
const SHIELD = 3;

/** Attackers in the zone beyond which more attackers change nothing. */
const ATTACKER_CAP = 4;

const fileIndex = (square: string): number => FILES.indexOf(square[0]!);
const rankIndex = (square: string): number => Number(square[1]);

const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 1 && rank <= 8;

const at = (file: number, rank: number): Square => (FILES[file]! + String(rank)) as Square;

/** Where `side`'s king stands, or null on a board without one. */
function kingSquare(chess: Chess, side: Color): Square | null {
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (piece?.type === 'k' && piece.color === side) return square;
  }
  return null;
}

/**
 * The squares the coach means by "around the king": the 3×3 box, plus the two
 * squares two ranks in front of it — the king's file and its neighbour towards
 * the centre, which is where an attack is actually assembled.
 */
function kingZone(square: Square, side: Color): Square[] {
  const file = fileIndex(square);
  const rank = rankIndex(square);
  const forward = side === 'w' ? 1 : -1;
  const towardsCentre = file >= 4 ? -1 : 1;

  const squares: Square[] = [];
  for (let f = file - 1; f <= file + 1; f += 1) {
    for (let r = rank - 1; r <= rank + 1; r += 1) {
      if (onBoard(f, r)) squares.push(at(f, r));
    }
  }
  for (const f of [file, file + towardsCentre]) {
    const r = rank + 2 * forward;
    if (onBoard(f, r)) squares.push(at(f, r));
  }
  return [...new Set(squares)];
}

/**
 * King safety for `side`, or null when the king is safe enough to say nothing.
 *
 * A shield pawn is missing when no friendly pawn stands on its file within two
 * ranks in front of the king: a pawn that has taken one step forward is still
 * doing its job, a pawn that has left is not.
 */
export function kingSafety(fen: string, side: Color): Motif | null {
  const chess = new Chess(fen);
  const square = kingSquare(chess, side);
  if (!square) return null;

  const file = fileIndex(square);
  const rank = rankIndex(square);
  const forward = side === 'w' ? 1 : -1;
  const enemy: Color = side === 'w' ? 'b' : 'w';

  // Shield pawns: the three squares one rank in front, on the king's file and
  // its neighbours.
  const shieldMissing: string[] = [];
  for (let f = file - 1; f <= file + 1; f += 1) {
    const shieldRank = rank + forward;
    if (!onBoard(f, shieldRank)) continue;
    const covered = [shieldRank, shieldRank + forward].some((r) => {
      if (!onBoard(f, r)) return false;
      const piece = chess.get(at(f, r));
      return piece?.type === 'p' && piece.color === side;
    });
    if (!covered) shieldMissing.push(at(f, shieldRank));
  }

  // Files adjacent to and including the king's: open when nobody has a pawn
  // there, half-open when we do not.
  const openFiles: string[] = [];
  for (let f = file - 1; f <= file + 1; f += 1) {
    if (f < 0 || f > 7) continue;
    let ourPawns = 0;
    let anyPawns = 0;
    for (let r = 1; r <= 8; r += 1) {
      const piece = chess.get(at(f, r));
      if (piece?.type !== 'p') continue;
      anyPawns += 1;
      if (piece.color === side) ourPawns += 1;
    }
    if (anyPawns === 0 || ourPawns === 0) openFiles.push(FILES[f]!);
  }

  // Distinct enemy pieces looking at any square of the zone — a rook eyeing
  // three of them is still one rook.
  const zone = kingZone(square, side);
  const attackerSquares = new Set<string>();
  for (const zoneSquare of zone) {
    for (const from of chess.attackers(zoneSquare, enemy as ChessColor)) {
      attackerSquares.add(from);
    }
  }
  const attackersInZone: PieceRef[] = [...attackerSquares]
    .map((from) => pieceRef(chess, from as Square))
    .filter((ref): ref is PieceRef => ref !== null)
    .sort((a, b) => pieceValue(a) - pieceValue(b) || a.square.localeCompare(b.square));

  const score =
    0.35 * (shieldMissing.length / SHIELD) +
    0.35 * (Math.min(openFiles.length, 3) / 3) +
    0.3 * Math.min(1, attackersInZone.length / ATTACKER_CAP);

  if (score < 0.5) return null;

  return { type: 'king_safety', side, score, openFiles, shieldMissing, attackersInZone };
}
