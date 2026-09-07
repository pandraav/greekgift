import { describe, expect, it } from 'vitest';

import {
  backRankWeak,
  captureValue,
  forkBy,
  hangingPieces,
  material,
  pinsAgainst,
} from '../src/motifs.ts';
import { audienceFor, phaseOf, toSan } from '../src/facts.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('material', () => {
  it('is level at the start', () => {
    expect(material(START)).toBe(0);
  });

  it('counts from White’s side', () => {
    // White a lone king, Black a king and a rook.
    expect(material('r3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(-5);
  });
});

describe('hangingPieces', () => {
  it('finds an undefended piece under attack', () => {
    const found = hangingPieces('4k3/8/8/4n3/8/4R3/8/4K3 w - - 0 1', 'b');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      type: 'hanging_piece',
      target: { piece: 'N', square: 'e5', color: 'b' },
      attackers: [{ piece: 'R', square: 'e3', color: 'w' }],
      defenders: [],
    });
  });

  it('says nothing about a piece nobody is attacking', () => {
    expect(hangingPieces('4k3/8/8/4n3/8/8/8/4K3 w - - 0 1', 'b')).toEqual([]);
  });

  it('leaves a defended piece alone when the attacker is worth more', () => {
    // Black knight on e5, defended by the pawn on d6, attacked by a rook.
    expect(hangingPieces('4k3/8/3p4/4n3/8/4R3/8/4K3 w - - 0 1', 'b')).toEqual([]);
  });

  it('names the attackers cheapest first', () => {
    // Black knight on e5 attacked by the rook on e3 and the pawn on d4.
    const found = hangingPieces('4k3/8/8/4n3/3P4/4R3/8/4K3 b - - 0 1', 'b');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      type: 'hanging_piece',
      attackers: [
        { piece: 'P', square: 'd4', color: 'w' },
        { piece: 'R', square: 'e3', color: 'w' },
      ],
    });
  });
});

describe('forkBy', () => {
  it('finds a knight hitting the king and a rook', () => {
    const fork = forkBy('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', 'c7');
    expect(fork).toMatchObject({ type: 'fork', by: { piece: 'N', square: 'c7' }, byMover: false });
    expect(fork && fork.type === 'fork' ? fork.targets.map((t) => t.square).sort() : []).toEqual([
      'a8',
      'e8',
    ]);
  });

  it('records whose fork it is', () => {
    const fork = forkBy('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', 'c7', true);
    expect(fork).toMatchObject({ type: 'fork', byMover: true });
  });

  it('will not call one target a fork', () => {
    expect(forkBy('4k3/2N5/8/8/8/8/8/4K3 b - - 0 1', 'c7')).toBeNull();
  });
});

describe('pinsAgainst', () => {
  it('finds a knight pinned to its king', () => {
    const pins = pinsAgainst('4k3/8/8/4n3/8/8/8/4RK2 w - - 0 1', 'b');
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      type: 'pin',
      pinned: { piece: 'N', square: 'e5' },
      pinner: { piece: 'R', square: 'e1' },
      against: { piece: 'K', square: 'e8' },
      absolute: true,
    });
  });
});

describe('backRankWeak', () => {
  it('spots a king sealed in by its own pawns', () => {
    expect(backRankWeak('6k1/5ppp/8/8/8/8/8/4R1K1 b - - 0 1', 'b')).toEqual({
      type: 'back_rank_weak',
      side: 'b',
    });
  });

  it('says nothing once there is luft', () => {
    expect(backRankWeak('6k1/5pp1/7p/8/8/8/8/4R1K1 b - - 0 1', 'b')).toBeNull();
  });

  it('says nothing with no heavy pieces left to use it', () => {
    expect(backRankWeak('6k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', 'b')).toBeNull();
  });
});

describe('captureValue', () => {
  it('values what was taken', () => {
    expect(captureValue('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5')).toBe(1);
  });

  it('is zero for a quiet move', () => {
    expect(captureValue(START, 'e2e4')).toBe(0);
  });
});

describe('toSan', () => {
  it('reads a UCI line back as notation', () => {
    expect(toSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('stops at the first move it cannot play, keeping what is true', () => {
    expect(toSan(START, ['e2e4', 'e2e4'])).toEqual(['e4']);
  });
});

describe('phaseOf', () => {
  it('calls a full board on move 3 the opening', () => {
    expect(phaseOf(START, 5)).toBe('opening');
  });

  it('calls a stripped board an endgame whatever the move number', () => {
    expect(phaseOf('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 12)).toBe('endgame');
  });
});

describe('audienceFor', () => {
  it('follows the rating, and assumes the middle when there is none', () => {
    expect(audienceFor(900)).toBe('beginner');
    expect(audienceFor(1500)).toBe('intermediate');
    expect(audienceFor(2100)).toBe('advanced');
    expect(audienceFor(undefined)).toBe('intermediate');
  });
});
