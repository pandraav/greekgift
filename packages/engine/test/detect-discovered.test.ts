import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { discoveredAttack } from '../src/detect/discovered.ts';

const legal = (fen: string): string => {
  new Chess(fen);
  return fen;
};

describe('discoveredAttack', () => {
  it('finds a discovered check when the knight steps off the file', () => {
    // Re1 is aimed at the king on e8 and blocked by its own knight on e4.
    const fen = legal('4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1');
    expect(discoveredAttack(fen, 'e4c5')).toEqual({
      type: 'discovered_attack',
      mover: { piece: 'N', square: 'c5', color: 'w' },
      attacker: { piece: 'R', square: 'e1', color: 'w' },
      target: { piece: 'K', square: 'e8', color: 'b' },
      check: true,
    });
  });

  it('finds a bishop uncovered onto the queen', () => {
    // Ba1 down the long diagonal, let out by the knight on d4.
    const fen = legal('4k2q/8/8/8/3N4/8/8/B5K1 w - - 0 1');
    expect(discoveredAttack(fen, 'd4b5')).toEqual({
      type: 'discovered_attack',
      mover: { piece: 'N', square: 'b5', color: 'w' },
      attacker: { piece: 'B', square: 'a1', color: 'w' },
      target: { piece: 'Q', square: 'h8', color: 'b' },
      check: false,
    });
  });

  it('will not call a rook eyeing a defended pawn a discovery worth naming', () => {
    // Same knight move, but the line opens onto a pawn worth less than the
    // rook and held by the pawn on d7.
    const fen = legal('4k3/3p4/4p3/8/4N3/8/8/4R1K1 w - - 0 1');
    expect(discoveredAttack(fen, 'e4c5')).toBeNull();
  });

  it('does not count the moving piece’s own new attack', () => {
    // The bishop itself arrives on the long diagonal: direct, not discovered.
    const fen = legal('4k2q/8/8/8/8/8/1B6/6K1 w - - 0 1');
    expect(discoveredAttack(fen, 'b2a1')).toBeNull();
  });

  it('says nothing about a quiet opening move', () => {
    const fen = legal('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(discoveredAttack(fen, 'e2e4')).toBeNull();
  });

  it('says nothing about a move that is not legal here', () => {
    const fen = legal('4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1');
    expect(discoveredAttack(fen, 'e4e6')).toBeNull();
  });
});
