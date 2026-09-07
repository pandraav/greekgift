import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { kingSafety } from '../src/detect/king-safety.ts';

/**
 * Every FEN here is run through `new Chess(fen)` first: a detector tested
 * against a position chess.js would reject is testing nothing.
 */
const position = (fen: string): string => {
  new Chess(fen);
  return fen;
};

// Black has been stripped bare on the kingside: no pawns left in front of the
// king, all three files open or half-open, a rook and a queen already looking
// at the zone.
const STRIPPED = position('5rk1/pp6/8/5R1Q/8/8/PP4PP/6K1 w - - 0 1');

// White has kept the h-pawn and lost the other two, the g-file is open, and a
// knight and a rook are in range. Two of three shields gone, two of three files.
const HALF_STRIPPED = position('6k1/pp6/8/5p2/4n2r/8/PP5P/R5K1 w - - 0 1');

// The shield pawns have run up the board (f5, h5), so they are missing from in
// front of the king, but they still hold the f- and h-files and nothing of
// Black's reaches the king zone: 0.35 + 0.117 + 0 = 0.467, just under the line.
const NEAR_MISS = position('3r2k1/pp4p1/8/5P1P/8/8/PP6/R5K1 w - - 0 1');

const START = position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// Nothing on the board but the two kings.
const BARE = position('4k3/8/8/8/8/8/8/4K3 w - - 0 1');

describe('kingSafety', () => {
  it('names the shield, the files and the attackers of a stripped king', () => {
    const motif = kingSafety(STRIPPED, 'b');

    expect(motif).toEqual({
      type: 'king_safety',
      side: 'b',
      score: expect.any(Number),
      openFiles: ['f', 'g', 'h'],
      shieldMissing: ['f7', 'g7', 'h7'],
      attackersInZone: [
        { piece: 'R', square: 'f5', color: 'w' },
        { piece: 'Q', square: 'h5', color: 'w' },
      ],
    });
    // 0.35 · 3/3 + 0.35 · 3/3 + 0.3 · 2/4
    expect(motif?.type === 'king_safety' ? motif.score : 0).toBeCloseTo(0.85, 2);
  });

  it('counts a piece once however many zone squares it attacks', () => {
    // The rook on f5 sees f6, f7 and f8; the queen on h5 sees g6, f7, h7 and h8.
    const motif = kingSafety(STRIPPED, 'b');
    expect(motif?.type === 'king_safety' ? motif.attackersInZone : []).toHaveLength(2);
  });

  it('scores a partly stripped king from all three terms', () => {
    const motif = kingSafety(HALF_STRIPPED, 'w');

    expect(motif).toEqual({
      type: 'king_safety',
      side: 'w',
      score: expect.any(Number),
      // The h-pawn is home, so the h-file is neither open nor half-open and h2
      // is not missing.
      openFiles: ['f', 'g'],
      shieldMissing: ['f2', 'g2'],
      attackersInZone: [
        { piece: 'N', square: 'e4', color: 'b' },
        { piece: 'R', square: 'h4', color: 'b' },
      ],
    });
    // 0.35 · 2/3 + 0.35 · 2/3 + 0.3 · 2/4
    expect(motif?.type === 'king_safety' ? motif.score : 0).toBeCloseTo(0.62, 2);
  });

  it('says nothing about a king that scores just under the threshold', () => {
    expect(kingSafety(NEAR_MISS, 'w')).toBeNull();
  });

  it('says nothing about either king in the starting position', () => {
    expect(kingSafety(START, 'w')).toBeNull();
    expect(kingSafety(START, 'b')).toBeNull();
  });

  it('calls a bare king exposed on shield and files alone', () => {
    const motif = kingSafety(BARE, 'w');

    expect(motif).toEqual({
      type: 'king_safety',
      side: 'w',
      score: expect.any(Number),
      openFiles: ['d', 'e', 'f'],
      shieldMissing: ['d2', 'e2', 'f2'],
      attackersInZone: [],
    });
    // 0.35 · 3/3 + 0.35 · 3/3 + 0.3 · 0/4
    expect(motif?.type === 'king_safety' ? motif.score : 0).toBeCloseTo(0.7, 2);
  });
});
