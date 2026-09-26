import type { EngineLine, MoveAnalysis, PositionEval, Score } from '@greekgift/engine';
import { winPercent } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { fenAfterAttempt, judgeAttempt, needsEngine, RETRY_BEST_SLACK } from './retry';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_H4 = 'rnbqkbnr/pppppppp/8/8/7P/8/PPPPPPP1/RNBQKBNR b KQkq - 0 1';

const line = (multipv: 1 | 2 | 3, score: Score, pv: string[]): EngineLine => ({
  multipv,
  score,
  pv,
  depth: 20,
  nodes: 2_000_000,
});

const evalOf = (fen: string, lines: EngineLine[]): PositionEval => ({
  fen,
  nodes: 2_000_000,
  engineBuild: 'stockfish-18-lite-single',
  lines,
});

/**
 * White played a3 (a "blunder" for the test's sake: −2.00), when e4 (+0.40),
 * d4 (+0.39) and Nf3 (+0.25) were stored.
 */
const BEFORE = evalOf(START, [
  line(1, { cp: 40 }, ['e2e4', 'e7e5']),
  line(2, { cp: 39 }, ['d2d4', 'd7d5']),
  line(3, { cp: 25 }, ['g1f3', 'd7d5']),
]);
const PLAYED = { cp: -200 };

const move: Pick<
  MoveAnalysis,
  'color' | 'uci' | 'fenBefore' | 'fenAfter' | 'evalBefore' | 'evalAfter' | 'winBefore' | 'winAfter'
> = {
  color: 'w',
  uci: 'a2a3',
  fenBefore: START,
  fenAfter: AFTER_A3,
  evalBefore: BEFORE,
  evalAfter: evalOf(AFTER_A3, [line(1, PLAYED, ['e7e5'])]),
  winBefore: winPercent({ cp: 40 }, 'w'),
  winAfter: winPercent(PLAYED, 'w'),
};

const live = (score: Score): PositionEval => evalOf(AFTER_H4, [line(1, score, ['e7e5'])]);

describe('needsEngine', () => {
  it('is false for a stored line and for the played move', () => {
    expect(needsEngine(move, 'e2e4')).toBe(false);
    expect(needsEngine(move, 'g1f3')).toBe(false);
    expect(needsEngine(move, 'a2a3')).toBe(false);
  });

  it('is true for anything else', () => {
    expect(needsEngine(move, 'h2h4')).toBe(true);
  });
});

describe('judgeAttempt', () => {
  it('the first line is best, and better than the played move', () => {
    const v = judgeAttempt(move, 'e2e4', null);
    expect(v).toMatchObject({ isBest: true, versusPlayed: 'better', score: { cp: 40 }, classification: 'best' });
    expect(v.epLoss).toBe(0);
  });

  it('a stored second line within EQUAL_EP is best too', () => {
    const v = judgeAttempt(move, 'd2d4', null);
    expect(v.isBest).toBe(true);
    expect(v.classification).toBe('best');
    expect(v.score).toEqual({ cp: 39 });
  });

  it('a stored line further off is not best, and gets its ladder class', () => {
    const v = judgeAttempt(move, 'g1f3', null);
    expect(v.isBest).toBe(false);
    expect(v.versusPlayed).toBe('better');
    expect(v.classification).toBe('excellent'); // ~1.5 win% points
  });

  it('the played move is the same as the played move', () => {
    const v = judgeAttempt(move, 'a2a3', null);
    expect(v.versusPlayed).toBe('same');
    expect(v.score).toEqual(PLAYED);
    expect(v.isBest).toBe(false);
  });

  it('a move outside the lines uses the live score', () => {
    const better = judgeAttempt(move, 'h2h4', live({ cp: -50 }));
    expect(better).toMatchObject({ isBest: false, versusPlayed: 'better', score: { cp: -50 } });

    const worse = judgeAttempt(move, 'h2h4', live({ cp: -600 }));
    expect(worse.versusPlayed).toBe('worse');
    expect(worse.classification).toBe('blunder');

    const same = judgeAttempt(move, 'h2h4', live({ cp: -205 }));
    expect(same.versusPlayed).toBe('same');
  });

  it('a move outside the lines is best within the slack, and not beyond it', () => {
    expect(judgeAttempt(move, 'h2h4', live({ cp: 40 })).isBest).toBe(true);
    expect(judgeAttempt(move, 'h2h4', live({ cp: 45 })).isBest).toBe(true); // a gain is no loss
    const off = judgeAttempt(move, 'h2h4', live({ cp: 20 }));
    expect(off.epLoss).toBeGreaterThan(RETRY_BEST_SLACK);
    expect(off.isBest).toBe(false);
  });

  it('works from Black\'s side: scores stay White-view, the verdict is Black\'s', () => {
    const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const black = {
      color: 'b' as const,
      uci: 'f7f6',
      fenBefore: AFTER_E4,
      fenAfter: AFTER_E4,
      evalBefore: evalOf(AFTER_E4, [line(1, { cp: 30 }, ['e7e5']), line(2, { cp: 35 }, ['c7c5'])]),
      evalAfter: evalOf(AFTER_E4, []),
      winBefore: winPercent({ cp: 30 }, 'b'),
      winAfter: winPercent({ cp: 250 }, 'b'),
    };
    expect(judgeAttempt(black, 'e7e5', null).isBest).toBe(true);
    const worse = judgeAttempt(black, 'g7g5', evalOf(AFTER_E4, [line(1, { cp: 600 }, ['d2d4'])]));
    expect(worse.versusPlayed).toBe('worse');
    expect(worse.score).toEqual({ cp: 600 });
  });

  it('an attempt that mates, with no live lines, reads the board', () => {
    const FOOL = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    const black = {
      color: 'b' as const,
      uci: 'a7a6',
      fenBefore: FOOL,
      fenAfter: FOOL,
      evalBefore: evalOf(FOOL, [line(1, { mate: -1 }, ['d8h4'])]),
      evalAfter: evalOf(FOOL, []),
      winBefore: 100,
      winAfter: 50,
    };
    // Not stored (the stored line was dropped for the test), so the board answers.
    const alt = { ...black, evalBefore: evalOf(FOOL, [line(1, { mate: -1 }, ['b8c6'])]) };
    const v = judgeAttempt(alt, 'd8h4', evalOf(FOOL, []));
    expect(v.score).toEqual({ mate: -1 });
    expect(v.isBest).toBe(true);
    expect(v.versusPlayed).toBe('better');
  });
});

describe('fenAfterAttempt', () => {
  it('plays a legal move and refuses an illegal one', () => {
    expect(fenAfterAttempt(START, 'h2h4')).toBe(AFTER_H4);
    expect(fenAfterAttempt(START, 'e2e5')).toBeNull();
  });
});
