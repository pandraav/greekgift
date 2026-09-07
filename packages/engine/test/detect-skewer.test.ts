import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { skewers } from '../src/detect/skewer.ts';

const legal = (fen: string): string => {
  new Chess(fen);
  return fen;
};

describe('skewers', () => {
  it('finds the king skewered to the queen behind it', () => {
    // Re1 checks the king on e5; when it moves, the queen on e8 falls.
    const fen = legal('4q3/8/8/4k3/8/8/8/4RK2 b - - 0 1');
    expect(skewers(fen, 'b')).toEqual([
      {
        type: 'skewer',
        front: { piece: 'K', square: 'e5', color: 'b' },
        behind: { piece: 'Q', square: 'e8', color: 'b' },
        by: { piece: 'R', square: 'e1', color: 'w' },
      },
    ]);
  });

  it('finds a bishop skewering the queen to a rook', () => {
    const fen = legal('7k/3r4/2q5/1B6/8/8/8/6K1 w - - 0 1');
    expect(skewers(fen, 'b')).toEqual([
      {
        type: 'skewer',
        front: { piece: 'Q', square: 'c6', color: 'b' },
        behind: { piece: 'R', square: 'd7', color: 'b' },
        by: { piece: 'B', square: 'b5', color: 'w' },
      },
    ]);
  });

  it('will not call a pin a skewer: the cheap piece is in front', () => {
    // Rook in front, queen behind — that is a pin, and `pinsAgainst` owns it.
    const fen = legal('4q2k/8/8/4r3/8/8/8/4R1K1 w - - 0 1');
    expect(skewers(fen, 'b')).toEqual([]);
  });

  it('will not call a queen pinned to its king a skewer', () => {
    const fen = legal('4k3/8/8/4q3/8/8/8/4R1K1 b - - 0 1');
    expect(skewers(fen, 'b')).toEqual([]);
  });

  it('says nothing about the starting position', () => {
    const fen = legal('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(skewers(fen, 'w')).toEqual([]);
    expect(skewers(fen, 'b')).toEqual([]);
  });

  it('says nothing about a bare board', () => {
    const fen = legal('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(skewers(fen, 'w')).toEqual([]);
    expect(skewers(fen, 'b')).toEqual([]);
  });
});
