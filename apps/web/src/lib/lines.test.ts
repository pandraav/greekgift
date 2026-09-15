import type { EngineLine, MoveAnalysis, PositionEval } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { arrowsFor, formatScore, linesAt, numberedLine, pvToSan } from './lines';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E6 = 'rnbqkbnr/pppp1ppp/4p3/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2';

const line = (multipv: 1 | 2 | 3, cp: number, pv: string[]): EngineLine => ({
  multipv,
  score: { cp },
  pv,
  depth: 14,
  nodes: 300_000,
});

const evalOf = (fen: string, lines: EngineLine[]): PositionEval => ({
  fen,
  nodes: 300_000,
  engineBuild: 'stockfish-18-lite-single',
  lines,
});

const move = (over: Partial<MoveAnalysis>): MoveAnalysis => ({
  ply: 1,
  color: 'w',
  san: 'd4',
  uci: 'd2d4',
  fenBefore: START,
  fenAfter: AFTER_D4,
  evalBefore: evalOf(START, [line(1, 29, ['e2e4', 'e7e6']), line(2, 20, ['d2d4']), line(3, 10, ['g1f3'])]),
  evalAfter: evalOf(AFTER_D4, [line(1, 37, ['d7d5', 'c2c4']), line(2, 30, ['g8f6']), line(3, 25, ['e7e6'])]),
  winBefore: 53,
  winAfter: 52,
  epLoss: 0.01,
  moveAccuracy: 98,
  classification: 'book',
  forced: false,
  bestMove: 'e2e4',
  bestLine: ['e2e4', 'e7e6'],
  ...over,
});

const MOVES: MoveAnalysis[] = [
  move({}),
  move({
    ply: 2,
    color: 'b',
    san: 'e6',
    uci: 'e7e6',
    fenBefore: AFTER_D4,
    fenAfter: AFTER_E6,
    evalBefore: evalOf(AFTER_D4, [line(1, 37, ['d7d5', 'c2c4']), line(2, 30, ['g8f6']), line(3, 25, ['e7e6'])]),
    evalAfter: evalOf(AFTER_E6, [line(1, 26, ['e2e4', 'd7d5']), line(2, 20, ['c2c4']), line(3, 18, ['g1f3'])]),
    bestMove: 'd7d5',
    bestLine: ['d7d5', 'c2c4'],
  }),
];

describe('linesAt', () => {
  it('returns the starting position at ply 0', () => {
    const at = linesAt(MOVES, 0);
    expect(at?.fen).toBe(START);
    expect(at?.lines[0]?.pv[0]).toBe('e2e4');
    expect(at?.depth).toBe(14);
    expect(at?.nodes).toBe(300_000);
  });

  it('returns the position after the move for a mid-game ply', () => {
    expect(linesAt(MOVES, 1)?.fen).toBe(AFTER_D4);
  });

  it('returns the final position at the last ply', () => {
    expect(linesAt(MOVES, 2)?.fen).toBe(AFTER_E6);
  });

  it('clamps out-of-range plies', () => {
    expect(linesAt(MOVES, -3)?.fen).toBe(START);
    expect(linesAt(MOVES, 99)?.fen).toBe(AFTER_E6);
  });

  it('is null for an empty game', () => {
    expect(linesAt([], 0)).toBeNull();
  });
});

describe('formatScore', () => {
  it('formats centipawns from White\'s view', () => {
    expect(formatScore({ cp: 6 })).toBe('+0.06');
    expect(formatScore({ cp: -120 })).toBe('−1.20');
    expect(formatScore({ cp: 0 })).toBe('0.00');
  });

  it('formats mates', () => {
    expect(formatScore({ mate: 3 })).toBe('M3');
    expect(formatScore({ mate: -2 })).toBe('−M2');
  });
});

describe('pvToSan', () => {
  it('replays a line from White to move', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('replays a line from Black to move', () => {
    expect(pvToSan(AFTER_D4, ['d7d5', 'c2c4'])).toEqual(['d5', 'c4']);
  });

  it('stops at the first move that does not apply', () => {
    expect(pvToSan(START, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
  });

  it('respects the limit', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3'], 2)).toEqual(['e4', 'e5']);
  });

  it('handles promotions', () => {
    const fen = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    expect(pvToSan(fen, ['a7a8q'])).toEqual(['a8=Q+']);
  });
});

describe('numberedLine', () => {
  it('numbers from White to move', () => {
    expect(numberedLine(START, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
  });

  it('numbers from Black to move', () => {
    expect(numberedLine(AFTER_D4, ['d5', 'c4', 'e6'])).toBe('1... d5 2. c4 e6');
  });

  it('is empty for no moves', () => {
    expect(numberedLine(START, [])).toBe('');
  });
});

describe('arrowsFor', () => {
  it('draws nothing without a played move', () => {
    expect(arrowsFor(null, true)).toEqual([]);
  });

  it('draws nothing when the toggle is off', () => {
    expect(arrowsFor(MOVES[0]!, false)).toEqual([]);
  });

  it('draws nothing when the played move was the best', () => {
    expect(arrowsFor(move({ uci: 'e2e4', bestMove: 'e2e4' }), true)).toEqual([]);
  });

  it('draws nothing without a best move', () => {
    expect(arrowsFor(move({ bestMove: '' }), true)).toEqual([]);
  });

  it('draws the engine move then the played move', () => {
    expect(arrowsFor(MOVES[0]!, true)).toEqual([
      { from: 'e2', to: 'e4', color: 'var(--felt)' },
      { from: 'd2', to: 'd4', color: 'var(--lacquer)' },
    ]);
  });
});
