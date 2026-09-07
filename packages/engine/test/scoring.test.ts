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

  it("means White's chance unless told otherwise, so old callers are unchanged", () => {
    expect(winPercent({ cp: 200 })).toBe(winPercent({ cp: 200 }, 'w'));
  });

  it("gives Black the complement of White's", () => {
    expect(winPercent({ cp: 200 }, 'b')).toBeCloseTo(100 - winPercent({ cp: 200 }), 9);
    expect(winPercent({ cp: 0 }, 'b')).toBe(50);
    expect(winPercent({ mate: 1 }, 'b')).toBe(0);
    expect(winPercent({ mate: -1 }, 'b')).toBe(100);
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

  it('mate is best even when the book happens to contain it', () => {
    // Fool's mate is in the opening book. Checkmate is the end of the game,
    // not theory.
    expect(
      classify({ ...base, isMate: true, inBook: true, winBefore: 100, winAfter: 100 })
        .classification,
    ).toBe('best');
  });

  it('mate is best, not brilliant or great, whatever else was true of it', () => {
    const r = classify({
      ...base,
      isMate: true,
      playedBest: true,
      sacrificeSound: true,
      onlyMoveMargin: 0.9,
      winBefore: 100,
      winAfter: 100,
    });
    expect(r.classification).toBe('best');
    expect(r.epLoss).toBe(0);
  });

  describe('brilliant', () => {
    it('is a sound sacrifice that was also the engine move', () => {
      expect(
        classify({ ...base, playedBest: true, sacrificeSound: true, winBefore: 54, winAfter: 53 })
          .classification,
      ).toBe('brilliant');
    });

    it('or a sound sacrifice that was excellent', () => {
      expect(
        classify({ ...base, sacrificeSound: true, winBefore: 54, winAfter: 52 })
          .classification,
      ).toBe('brilliant');
    });

    it('but not a sacrifice that was merely good', () => {
      // 5 points is 0.05 EP: past the excellent rung. A sacrifice that gives
      // that much away is not brilliant, whatever the caller says about it.
      expect(
        classify({ ...base, sacrificeSound: true, winBefore: 55, winAfter: 50 })
          .classification,
      ).toBe('good');
    });

    it('never fires without a sacrifice', () => {
      expect(
        classify({ ...base, playedBest: true, winBefore: 54, winAfter: 54 }).classification,
      ).toBe('best');
    });

    it('outranks great', () => {
      expect(
        classify({
          ...base,
          playedBest: true,
          sacrificeSound: true,
          onlyMoveMargin: 0.5,
          winBefore: 54,
          winAfter: 54,
        }).classification,
      ).toBe('brilliant');
    });

    it('is not awarded to a forced move', () => {
      expect(
        classify({ ...base, forced: true, sacrificeSound: true, winBefore: 54, winAfter: 54 })
          .classification,
      ).toBe('best');
    });
  });

  describe('great', () => {
    it('is the engine move when the second line loses at least 0.15 expected points', () => {
      expect(
        classify({ ...base, playedBest: true, onlyMoveMargin: 0.15, winBefore: 60, winAfter: 60 })
          .classification,
      ).toBe('great');
    });

    it('is just best when the alternative was nearly as good', () => {
      expect(
        classify({ ...base, playedBest: true, onlyMoveMargin: 0.149, winBefore: 60, winAfter: 60 })
          .classification,
      ).toBe('best');
    });

    it('needs the engine move: a wide margin the player did not find is nothing', () => {
      expect(
        classify({ ...base, onlyMoveMargin: 0.5, winBefore: 60, winAfter: 59 }).classification,
      ).toBe('excellent');
    });

    it('is not awarded to a forced move', () => {
      expect(
        classify({ ...base, forced: true, onlyMoveMargin: 0.5, winBefore: 60, winAfter: 60 })
          .classification,
      ).toBe('best');
    });
  });

  describe('miss', () => {
    // 55 → 45 is 0.10 EP: an inaccuracy. 55 → 38 is 0.17: a mistake.
    it('is a mistake that left three pawns of material on the board', () => {
      expect(
        classify({ ...base, missedMaterial: 3, winBefore: 55, winAfter: 38 }).classification,
      ).toBe('miss');
    });

    it('is an inaccuracy that missed a mate', () => {
      expect(
        classify({ ...base, missedMate: true, winBefore: 55, winAfter: 45 }).classification,
      ).toBe('miss');
    });

    it('is not a mistake that missed only a pawn or two', () => {
      expect(
        classify({ ...base, missedMaterial: 2.9, winBefore: 55, winAfter: 38 }).classification,
      ).toBe('mistake');
    });

    it('does not rename a blunder', () => {
      expect(
        classify({ ...base, missedMate: true, missedMaterial: 9, winBefore: 55, winAfter: 20 })
          .classification,
      ).toBe('blunder');
    });

    it('does not touch a move that lost nothing, even if the engine saw a capture', () => {
      expect(
        classify({ ...base, missedMaterial: 5, winBefore: 55, winAfter: 54 }).classification,
      ).toBe('excellent');
    });
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
