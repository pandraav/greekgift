import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { pawnMotifs } from '../src/detect/pawns.ts';

/** Every FEN in this file is a position chess.js will accept. */
const valid = (fen: string): string => {
  new Chess(fen);
  return fen;
};

const START = valid('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const AFTER_NF3 = valid('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1');

describe('pawnMotifs', () => {
  it('sees a passer created by taking the last pawn that held it back', () => {
    // bxa6: before the capture the a6 pawn stopped the b-pawn, after it
    // nothing on the a or b files can catch the new passer.
    const before = valid('4k3/8/p7/1P6/8/8/8/4K3 w - - 0 1');
    const after = valid('4k3/8/P7/8/8/8/8/4K3 b - - 0 1');

    expect(pawnMotifs(before, after, [])).toEqual([
      {
        type: 'passed_pawn',
        pawn: { piece: 'P', square: 'a6', color: 'w' },
        stepsToPromote: 2,
        created: true,
      },
    ]);
  });

  it('reports the two most advanced passers and the promotion in the best line', () => {
    // a4-a5 with three passers on the board: only c7 and b6 are said, most
    // advanced first, and none of them is new.
    const before = valid('4k3/2P5/1P6/8/P7/8/8/4K3 w - - 0 1');
    const after = valid('4k3/2P5/1P6/P7/8/8/8/4K3 b - - 0 1');

    expect(pawnMotifs(before, after, ['c7c8q', 'e8d7'])).toEqual([
      {
        type: 'passed_pawn',
        pawn: { piece: 'P', square: 'c7', color: 'w' },
        stepsToPromote: 1,
        created: false,
      },
      {
        type: 'passed_pawn',
        pawn: { piece: 'P', square: 'b6', color: 'w' },
        stepsToPromote: 2,
        created: false,
      },
      { type: 'promotion', square: 'c8', inBestLine: true },
    ]);

    // The same line written in SAN, which is how `bestLine` reaches the
    // detector from a review.
    expect(pawnMotifs(before, after, ['c8=Q+', 'Kd7'])).toContainEqual({
      type: 'promotion',
      square: 'c8',
      inBestLine: true,
    });
  });

  it('sees the promotion that was actually played', () => {
    const before = valid('8/1P6/8/7k/8/8/8/4K3 w - - 0 1');
    const after = valid('1Q6/8/8/7k/8/8/8/4K3 b - - 0 1');

    expect(pawnMotifs(before, after, ['h5g6'])).toEqual([
      { type: 'promotion', square: 'b8', inBestLine: false },
    ]);
  });

  it('says nothing about a pawn an enemy pawn still watches', () => {
    // b5-b6 looks like a runner, but the c7 pawn is on an adjacent file
    // ahead of it, so the pawn is not passed and there is nothing to say.
    const before = valid('4k3/2p5/8/1P6/8/8/8/4K3 w - - 0 1');
    const after = valid('4k3/2p5/1P6/8/8/8/8/4K3 b - - 0 1');

    expect(pawnMotifs(before, after, [])).toEqual([]);
  });

  it('says nothing about a quiet opening move', () => {
    expect(pawnMotifs(START, AFTER_NF3, ['e7e5', 'e2e4'])).toEqual([]);
  });
});
