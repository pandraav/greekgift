import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { tradedWhileBehind } from '../src/detect/trade.ts';

/** Every FEN in this file is a position chess.js will accept. */
const valid = (fen: string): string => {
  new Chess(fen);
  return fen;
};

// Black is a rook down and offers a straight swap of knights: Nxf4, gxf4.
const KNIGHT_SWAP = valid('4k3/8/7r/3n4/5N2/6P1/8/R3K2R b - - 0 1');
// White is a bishop down and trades the last rooks off the board.
const ROOK_SWAP = valid('b3r3/3k4/8/8/8/8/8/4R1K1 w - - 0 1');

describe('tradedWhileBehind', () => {
  it('names an even knight swap made a rook down', () => {
    expect(tradedWhileBehind(KNIGHT_SWAP, 'd5f4', -5)).toEqual({
      type: 'traded_while_behind',
      deficit: 5,
      captured: { piece: 'N', square: 'f4', color: 'w' },
    });
  });

  it('names an even rook swap made a piece down', () => {
    expect(tradedWhileBehind(ROOK_SWAP, 'e1e8', -3)).toEqual({
      type: 'traded_while_behind',
      deficit: 3,
      captured: { piece: 'R', square: 'e8', color: 'b' },
    });
  });

  it('says nothing when the capture cannot be answered', () => {
    // The same knight capture with the g3 pawn gone: that is winning a piece,
    // not trading one, and calling it a trade would be a lie.
    const fen = valid('4k3/8/7r/3n4/5N2/8/8/R3K2R b - - 0 1');
    expect(tradedWhileBehind(fen, 'd5f4', -5)).toBeNull();
  });

  it('says nothing when the values do not match', () => {
    // Pawn takes knight is an exchange, but not an even one.
    const fen = valid('4k3/8/7r/8/3n4/4P3/8/R3K2R w - - 0 1');
    expect(tradedWhileBehind(fen, 'e3d4', -5)).toBeNull();
  });

  it('says nothing when the deficit is only a pawn', () => {
    expect(tradedWhileBehind(KNIGHT_SWAP, 'd5f4', -1)).toBeNull();
  });

  it('says nothing about a quiet move', () => {
    expect(tradedWhileBehind(KNIGHT_SWAP, 'd5c3', -5)).toBeNull();
  });
});
