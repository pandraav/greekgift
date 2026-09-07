import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { opponentThreat } from '../src/detect/opponent-threat.ts';

/** Every position here is a legal one; chess.js says so before the test runs. */
const legal = (fen: string): string => {
  new Chess(fen);
  return fen;
};

describe('opponentThreat', () => {
  it('names a reply that takes an undefended piece', () => {
    // White knight on e5 with nobody behind it; Black's bishop takes it free.
    const fen = legal('4k3/8/8/4N3/3b4/8/8/4K3 b - - 0 1');
    expect(opponentThreat(fen, 'd4e5', ['Bxe5'])).toEqual({
      type: 'opponent_threat',
      kind: 'capture',
      by: { piece: 'B', square: 'e5', color: 'b' },
      targets: [{ piece: 'N', square: 'e5', color: 'w' }],
      line: ['Bxe5'],
    });
  });

  it('prefers the fork when the reply lands on two things', () => {
    // Nc2+ hits the king on e1 and the loose rook on a1.
    const fen = legal('4k3/8/8/8/1n6/8/8/R3K3 b - - 0 1');
    const motif = opponentThreat(fen, 'b4c2', ['Nc2+']);
    expect(motif).toMatchObject({
      type: 'opponent_threat',
      kind: 'fork',
      by: { piece: 'N', square: 'c2', color: 'b' },
      line: ['Nc2+'],
    });
    expect(motif?.type === 'opponent_threat' ? motif.targets : []).toEqual(
      expect.arrayContaining([
        { piece: 'K', square: 'e1', color: 'w' },
        { piece: 'R', square: 'a1', color: 'w' },
      ]),
    );
  });

  it('calls a back-rank finish mate, not check', () => {
    const fen = legal('r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
    expect(opponentThreat(fen, 'a8a1', ['Ra1#'])).toEqual({
      type: 'opponent_threat',
      kind: 'mate',
      by: { piece: 'R', square: 'a1', color: 'b' },
      targets: [{ piece: 'K', square: 'g1', color: 'w' }],
      line: ['Ra1#'],
    });
  });

  it('reports a check whose checker cannot be taken', () => {
    // Rd1+ on an empty back rank; White's only legal answer is Kh2.
    const fen = legal('3rk3/8/8/8/8/7P/5PP1/6K1 b - - 0 1');
    expect(opponentThreat(fen, 'd8d1', ['Rd1+'])).toEqual({
      type: 'opponent_threat',
      kind: 'check',
      by: { piece: 'R', square: 'd1', color: 'b' },
      targets: [{ piece: 'K', square: 'g1', color: 'w' }],
      line: ['Rd1+'],
    });
  });

  it('reports a pawn reaching the seventh with a clear path', () => {
    const fen = legal('4k3/8/8/8/8/1p6/8/6K1 b - - 0 1');
    expect(opponentThreat(fen, 'b3b2', ['b2'])).toEqual({
      type: 'opponent_threat',
      kind: 'promotion',
      by: { piece: 'P', square: 'b2', color: 'b' },
      targets: [],
      line: ['b2'],
    });
  });

  it('says nothing about an even trade', () => {
    // Same capture as the first case, but the knight is held by the f4 pawn
    // and the bishop taking it is worth exactly as much.
    const fen = legal('4k3/8/8/4N3/3b1P2/8/8/4K3 b - - 0 1');
    expect(opponentThreat(fen, 'd4e5', ['Bxe5'])).toBeNull();
  });

  it('says nothing about a quiet reply', () => {
    const fen = legal('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(opponentThreat(fen, 'e7e5', ['e5'])).toBeNull();
  });

  it('says nothing about a reply that is not legal here', () => {
    const fen = legal('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(opponentThreat(fen, 'e7e4', [])).toBeNull();
    expect(opponentThreat(fen, 'a1a8', [])).toBeNull();
    expect(opponentThreat(fen, 'e4e5', [])).toBeNull();
  });
});
