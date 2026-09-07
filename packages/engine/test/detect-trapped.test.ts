import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { trappedPieces } from '../src/detect/trapped.ts';

/** Every FEN in this file is a position chess.js will accept. */
const valid = (fen: string): string => {
  new Chess(fen);
  return fen;
};

const START = valid('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

describe('trappedPieces', () => {
  it('finds a knight in the corner with both squares covered by pawns', () => {
    // White knight a1, hit by the rook down the file. Nb3 runs into the c4
    // pawn, Nc2 into the d3 pawn, and nothing white defends a1.
    const fen = valid('r3k3/8/8/8/2p5/3p4/8/N6K w - - 0 1');
    const found = trappedPieces(fen, 'w');

    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      type: 'trapped_piece',
      target: { piece: 'N', square: 'a1', color: 'w' },
      attackers: [{ piece: 'R', square: 'a8', color: 'b' }],
    });
  });

  it('finds a bishop on h2 when it is not its side to move', () => {
    // The bishop that took on h2 and cannot come back: Bg1 walks into the
    // king and the rook, Bxg3 into the f2 pawn. White is to move, so the
    // detector has to flip the side to move to see Black's options at all.
    const fen = valid('4k3/8/8/8/8/6P1/5P1b/5K1R w - - 0 1');
    const found = trappedPieces(fen, 'b');

    expect(found).toEqual([
      {
        type: 'trapped_piece',
        target: { piece: 'B', square: 'h2', color: 'b' },
        attackers: [{ piece: 'R', square: 'h1', color: 'w' }],
      },
    ]);
  });

  it('says nothing when one square is still safe', () => {
    // The same corner knight with the d3 pawn removed: Nc2 is a free square,
    // so the piece is awkward rather than trapped.
    const fen = valid('r3k3/8/8/8/2p5/8/8/N6K w - - 0 1');
    expect(trappedPieces(fen, 'w')).toEqual([]);
  });

  it('says nothing when a cheaper piece is holding the attacked piece', () => {
    // The h2 bishop again, one pawn different: g3 is Black's now, so it both
    // blocks the diagonal and guards the bishop. Rxh2 is a trade the reader
    // can count, not a trap.
    const fen = valid('4k3/8/8/8/8/6p1/5P1b/5K1R w - - 0 1');
    expect(trappedPieces(fen, 'b')).toEqual([]);
  });

  it('says nothing about a quiet opening position', () => {
    expect(trappedPieces(START, 'w')).toEqual([]);
    expect(trappedPieces(START, 'b')).toEqual([]);
  });
});
