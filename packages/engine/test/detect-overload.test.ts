import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { overloadedDefenders } from '../src/detect/overload.ts';

/**
 * Every FEN here is run through `new Chess(fen)` first: a detector tested
 * against a position chess.js would reject is testing nothing.
 */
const position = (fen: string): string => {
  new Chess(fen);
  return fen;
};

// The knight on d7 is the only thing holding both the rook on f6 (attacked by
// Rf1) and the bishop on c5 (attacked by Rc1). Take either and the other goes.
const TWO_DUTIES = position('6k1/3n3p/5r2/2b5/8/4P3/8/2R2RK1 w - - 0 1');

// The same shape for White, with a pawn among the duties: Nc3 alone defends the
// bishop on d5 (Rd8) and the pawn on b5 (Rb8).
const PAWN_DUTY = position('1r1r2k1/p4ppp/8/1P1B4/8/2N5/5PPP/6K1 w - - 0 1');

// The b8 rook is gone, so only the bishop is attacked: one duty is not an
// overload.
const ONE_ATTACKED = position('3r2k1/p4ppp/8/1P1B4/8/2N5/5PPP/6K1 w - - 0 1');

// TWO_DUTIES with a pawn on b6 also guarding c5: the knight is no longer the
// sole defender there, so it is down to one duty.
const SHARED_DUTY = position('6k1/3n3p/1p3r2/2b5/8/4P3/8/2R2RK1 w - - 0 1');

const START = position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// Nothing on the board but the two kings.
const BARE = position('4k3/8/8/8/8/8/8/4K3 w - - 0 1');

describe('overloadedDefenders', () => {
  it('finds a defender doing two jobs, dearest duty first', () => {
    expect(overloadedDefenders(TWO_DUTIES, 'b')).toEqual([
      {
        type: 'overloaded_defender',
        defender: { piece: 'N', square: 'd7', color: 'b' },
        duties: [
          { piece: 'R', square: 'f6', color: 'b' },
          { piece: 'B', square: 'c5', color: 'b' },
        ],
      },
    ]);
  });

  it('counts an attacked pawn as a duty', () => {
    expect(overloadedDefenders(PAWN_DUTY, 'w')).toEqual([
      {
        type: 'overloaded_defender',
        defender: { piece: 'N', square: 'c3', color: 'w' },
        duties: [
          { piece: 'B', square: 'd5', color: 'w' },
          { piece: 'P', square: 'b5', color: 'w' },
        ],
      },
    ]);
  });

  it('says nothing when only one of the defended pieces is attacked', () => {
    expect(overloadedDefenders(ONE_ATTACKED, 'w')).toEqual([]);
  });

  it('says nothing when a second defender shares the work', () => {
    expect(overloadedDefenders(SHARED_DUTY, 'b')).toEqual([]);
  });

  it('says nothing about the starting position', () => {
    expect(overloadedDefenders(START, 'w')).toEqual([]);
    expect(overloadedDefenders(START, 'b')).toEqual([]);
  });

  it('says nothing about a board with nothing on it', () => {
    expect(overloadedDefenders(BARE, 'w')).toEqual([]);
    expect(overloadedDefenders(BARE, 'b')).toEqual([]);
  });
});
