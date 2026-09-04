import { describe, expect, it } from 'vitest';

import {
  acpl,
  centipawnLoss,
  classify,
  estimateRating,
  expectedPoints,
  fromMoverView,
  gameAccuracy,
  moveAccuracy,
  winPercent,
} from '../src/scoring.ts';

describe('winPercent', () => {
  it('is 50 at a dead level position', () => {
    expect(winPercent({ cp: 0 })).toBe(50);
  });

  it('is symmetric about zero', () => {
    expect(winPercent({ cp: 300 }) + winPercent({ cp: -300 })).toBeCloseTo(100, 6);
  });

  it('rises with the evaluation but never reaches 100', () => {
    expect(winPercent({ cp: 100 })).toBeGreaterThan(winPercent({ cp: 50 }));
    expect(winPercent({ cp: 5000 })).toBeLessThan(100);
  });

  it('saturates: past the clamp more centipawns say nothing', () => {
    expect(winPercent({ cp: 1000 })).toBe(winPercent({ cp: 99999 }));
  });

  it('treats mate as decided', () => {
    expect(winPercent({ mate: 3 })).toBe(100);
    expect(winPercent({ mate: -1 })).toBe(0);
  });

  it('matches the published curve at a known point', () => {
    // +200cp is a clear but not winning edge: about 68%.
    expect(winPercent({ cp: 200 })).toBeCloseTo(67.6, 1);
  });
});

describe('fromMoverView', () => {
  it('leaves White alone and flips Black', () => {
    expect(fromMoverView({ cp: 150 }, true)).toEqual({ cp: 150 });
    expect(fromMoverView({ cp: 150 }, false)).toEqual({ cp: -150 });
    expect(fromMoverView({ mate: 2 }, false)).toEqual({ mate: -2 });
  });
});

describe('classify', () => {
  const base = { playedBest: false, forced: false, inBook: false };

  it('calls the engine move best', () => {
    expect(
      classify({ ...base, playedBest: true, winBefore: 50, winAfter: 50 })
        .classification,
    ).toBe('best');
  });

  it('walks the ladder as more is thrown away', () => {
    const at = (winAfter: number) =>
      classify({ ...base, winBefore: 55, winAfter }).classification;
    expect(at(53)).toBe('excellent'); // 2 points ≈ 0.02 EP
    expect(at(48)).toBe('good');
    expect(at(45)).toBe('inaccuracy');
    expect(at(38)).toBe('mistake');
    expect(at(20)).toBe('blunder');
  });

  it('never reports a negative loss when the position improves', () => {
    const r = classify({ ...base, winBefore: 40, winAfter: 60 });
    expect(r.epLoss).toBe(0);
    expect(r.classification).toBe('excellent');
  });

  it('book moves are book, however they score', () => {
    expect(
      classify({ ...base, inBook: true, winBefore: 55, winAfter: 20 })
        .classification,
    ).toBe('book');
  });

  it('a forced move is best with a flag, not a mistake', () => {
    const r = classify({ ...base, forced: true, winBefore: 60, winAfter: 10 });
    expect(r.classification).toBe('best');
    expect(r.forced).toBe(true);
  });

  it('mate is always best', () => {
    expect(
      classify({ ...base, isMate: true, winBefore: 90, winAfter: 100 })
        .classification,
    ).toBe('best');
  });
});

describe('moveAccuracy', () => {
  it('is 100 for a move that loses nothing', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
  });

  it('falls as more win percentage is thrown away', () => {
    expect(moveAccuracy(50, 45)).toBeGreaterThan(moveAccuracy(50, 30));
  });

  it('bottoms out rather than going negative', () => {
    expect(moveAccuracy(100, 0)).toBeGreaterThanOrEqual(0);
  });

  it('does not reward a move for improving the position beyond 100', () => {
    expect(moveAccuracy(30, 80)).toBe(100);
  });
});

describe('gameAccuracy', () => {
  it('is 100 when every move is perfect', () => {
    expect(gameAccuracy(Array(40).fill(100))).toBeCloseTo(100, 5);
  });

  it('sits between the worst and best move', () => {
    const a = gameAccuracy([100, 100, 100, 20, 100, 100]);
    expect(a).toBeGreaterThan(20);
    expect(a).toBeLessThan(100);
  });

  it('punishes one disaster more than a plain average would', () => {
    const moves = [...Array(39).fill(100), 0];
    const plain = moves.reduce((a, b) => a + b, 0) / moves.length; // 97.5
    expect(gameAccuracy(moves)).toBeLessThan(plain);
  });

  it('copes with one move and with none', () => {
    expect(gameAccuracy([84])).toBe(84);
    expect(gameAccuracy([])).toBe(0);
  });
});

describe('centipawnLoss and acpl', () => {
  it('measures what the mover gave away', () => {
    expect(centipawnLoss({ cp: 50 }, { cp: -120 })).toBe(170);
  });

  it('is never negative', () => {
    expect(centipawnLoss({ cp: -50 }, { cp: 200 })).toBe(0);
  });

  it('caps a mate swing rather than letting it dominate', () => {
    expect(centipawnLoss({ cp: 0 }, { mate: -1 })).toBe(1000);
  });

  it('averages', () => {
    expect(acpl([10, 20, 30])).toBe(20);
    expect(acpl([])).toBe(0);
  });
});

describe('estimateRating', () => {
  it('reads a clean game as a strong player', () => {
    expect(estimateRating(10).rating).toBeGreaterThan(2500);
  });

  it('reads a loose game as a weaker one', () => {
    expect(estimateRating(150).rating).toBeLessThan(1000);
  });

  it('is monotonic: more loss, lower rating', () => {
    expect(estimateRating(20).rating).toBeGreaterThan(estimateRating(80).rating);
  });

  it('pulls toward a rating we already know', () => {
    // One tidy game does not make a 1200 into a grandmaster.
    const blind = estimateRating(20).rating;
    const pulled = estimateRating(20, 1200).rating;
    expect(blind).toBeGreaterThan(2400);
    expect(pulled).toBeLessThan(1800);
    expect(pulled).toBeGreaterThan(1200);
  });

  it('widens the band the further the game is from their usual', () => {
    const typical = estimateRating(99, 1200);
    const wild = estimateRating(10, 1200);
    expect(wild.band).toBeGreaterThan(typical.band);
  });
});

describe('expectedPoints', () => {
  it('is win percentage as a probability', () => {
    expect(expectedPoints(50)).toBe(0.5);
    expect(expectedPoints(100)).toBe(1);
  });
});
