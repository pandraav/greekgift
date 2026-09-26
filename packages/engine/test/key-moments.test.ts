import { describe, expect, it } from 'vitest';

import { KEY_MOMENTS_MAX, selectKeyMoments } from '../src/review.ts';
import type { Classification, MoveAnalysis } from '../src/types.ts';
import { REFERENCE } from './games.ts';

/** §9.1: at most eight, the book exit kept, the biggest swings, in ply order. */

const move = (ply: number, classification: Classification, epLoss: number): MoveAnalysis =>
  ({ ply, color: ply % 2 === 1 ? 'w' : 'b', classification, epLoss }) as MoveAnalysis;

describe('selectKeyMoments', () => {
  const moves = [
    move(10, 'mistake', 0.12),
    move(11, 'blunder', 0.45),
    move(12, 'great', 0),
    move(13, 'mistake', 0.19),
    move(14, 'blunder', 0.25),
    move(15, 'miss', 0.25),
    move(16, 'mistake', 0.25),
    move(17, 'inaccuracy', 0.09),
    move(18, 'brilliant', 0),
    move(19, 'blunder', 0.6),
    move(20, 'mistake', 0.11),
    move(21, 'mistake', 0.1),
    move(22, 'best', 0),
  ];

  it('keeps at most KEY_MOMENTS_MAX, the book exit among them', () => {
    const km = selectKeyMoments(moves, 7);
    expect(KEY_MOMENTS_MAX).toBe(8);
    expect(km).toHaveLength(8);
    expect(km[0]).toEqual({ ply: 7, kind: 'left_book', severity: 0.2 });
  });

  it('chooses the largest swings, blunders and misses before mistakes at equal swing, then earlier', () => {
    const plies = selectKeyMoments(moves, 7).map((k) => k.ply);
    // Seven places after the book exit: 19 (0.6), 11 (0.45), 18 (brilliant,
    // 0.3), 14 and 15 (0.25, blunder/miss) before 16 (0.25, mistake), then 13
    // (0.19). The great move (0.18) and 10 (0.12) miss the cut.
    expect(plies).toEqual([7, 11, 13, 14, 15, 16, 18, 19]);
    expect(plies).not.toContain(10);
    expect(plies).not.toContain(17); // an inaccuracy is never a key moment
  });

  it('breaks an equal swing and class by ply', () => {
    const tied = [move(30, 'mistake', 0.15), move(20, 'mistake', 0.15), move(40, 'mistake', 0.15)];
    const one = selectKeyMoments([...tied, ...Array.from({ length: 7 }, (_, i) => move(50 + i, 'blunder', 0.5))], null);
    expect(one.map((k) => k.ply)).toContain(20);
    expect(one.map((k) => k.ply)).not.toContain(30);
  });

  it('returns them in ply order', () => {
    const plies = selectKeyMoments(moves, 7).map((k) => k.ply);
    expect([...plies].sort((a, b) => a - b)).toEqual(plies);
  });

  it('is deterministic: input order does not matter', () => {
    expect(selectKeyMoments([...moves].reverse(), 7)).toEqual(selectKeyMoments(moves, 7));
  });

  it('without a book exit, all eight places go to moves', () => {
    const km = selectKeyMoments(moves, null);
    expect(km).toHaveLength(8);
    expect(km.some((k) => k.kind === 'left_book')).toBe(false);
  });

  it('keeps every notable move when there are few', () => {
    expect(selectKeyMoments(moves.slice(0, 3), 7).map((k) => k.ply)).toEqual([7, 10, 11, 12]);
  });
});

describe('the reference game (184269442794)', () => {
  it('has at most eight key moments, in ply order, with the book exit', () => {
    const km = REFERENCE.keyMoments;
    expect(km.length).toBeLessThanOrEqual(8);
    expect(km.map((k) => k.ply)).toEqual([...km.map((k) => k.ply)].sort((a, b) => a - b));
    expect(km.some((k) => k.kind === 'left_book' && k.ply === 6)).toBe(true);
  });
});
