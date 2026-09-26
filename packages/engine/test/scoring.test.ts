import { describe, expect, it } from 'vitest';

import {
  acpl,
  centipawnLoss,
  classify,
  classifyLoss,
  type ClassifyInput,
  EQUAL_EP,
  estimateRating,
  expectedPoints,
  forceCp,
  fromMoverView,
  gameAccuracy,
  LADDER,
  lichessWinPercent,
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

describe('classifyLoss: the ladder (rule 7a)', () => {
  it.each([
    [0, 'excellent'],
    [0.0199, 'excellent'],
    [0.02, 'good'],
    [0.0499, 'good'],
    [0.05, 'inaccuracy'],
    [0.0999, 'inaccuracy'],
    [0.1, 'mistake'],
    [0.1999, 'mistake'],
    [0.2, 'blunder'],
    [0.9, 'blunder'],
  ] as const)('epLoss %s → %s', (loss, expected) => {
    expect(classifyLoss(loss)).toBe(expected);
  });

  it('publishes the rungs as 0.02 / 0.05 / 0.10 / 0.20', () => {
    expect(LADDER.map(([t]) => t)).toEqual([0.02, 0.05, 0.1, 0.2]);
    expect(EQUAL_EP).toBe(0.002);
  });
});

describe('classify', () => {
  const base: ClassifyInput = {
    winBefore: 50,
    winPlayed: 50,
    playedIndex: null,
    forced: false,
    inBook: false,
    notAlreadyWinning: true,
    missedMaterial: 0,
    missedMate: false,
    allowsMate: false,
    opponentGaveChance: false,
  };
  const cls = (over: Partial<ClassifyInput>) => classify({ ...base, ...over }).classification;

  it('calls the engine move best', () => {
    expect(cls({ playedIndex: 0 })).toBe('best');
  });

  it('calls another stored line best at an equal score (rule 7b)', () => {
    expect(cls({ playedIndex: 1, winBefore: 60, winPlayed: 59.9 })).toBe('best');
    expect(cls({ playedIndex: 1, winBefore: 60, winPlayed: 59 })).toBe('excellent');
  });

  it('never calls a move outside the stored lines best', () => {
    expect(cls({ playedIndex: null, winBefore: 60, winPlayed: 60 })).toBe('excellent');
  });

  it('walks the ladder as more is thrown away', () => {
    const at = (winPlayed: number) => cls({ winBefore: 55, winPlayed });
    expect(at(54)).toBe('excellent');
    expect(at(52)).toBe('good');
    expect(at(48)).toBe('inaccuracy');
    expect(at(40)).toBe('mistake');
    expect(at(30)).toBe('blunder');
  });

  it('never reports a negative loss when the position improves', () => {
    const r = classify({ ...base, winBefore: 40, winPlayed: 60 });
    expect(r.epLoss).toBe(0);
    expect(r.classification).toBe('excellent');
  });

  it('book moves are book, however they score', () => {
    expect(cls({ inBook: true, winBefore: 55, winPlayed: 20 })).toBe('book');
  });

  it('a forced move is best with a flag, not a mistake', () => {
    const r = classify({ ...base, forced: true, winBefore: 60, winPlayed: 10 });
    expect(r.classification).toBe('best');
    expect(r.forced).toBe(true);
  });

  it('mate is always best, even inside the book', () => {
    expect(cls({ isMate: true, winBefore: 90, winPlayed: 100 })).toBe('best');
    expect(cls({ isMate: true, inBook: true, winBefore: 100, winPlayed: 100 })).toBe('best');
  });

  it('mate is best, not brilliant or great, whatever else was true of it', () => {
    const r = classify({
      ...base,
      isMate: true,
      playedIndex: 0,
      sacrifice: { value: 9, netMaterial: -9 },
      onlyMoveMargin: 0.9,
      winBefore: 100,
      winPlayed: 100,
    });
    expect(r.classification).toBe('best');
    expect(r.epLoss).toBe(0);
  });

  describe('brilliant (rule 7f)', () => {
    const sac = { value: 3, netMaterial: -2 };

    it('is a minor piece or more given up, as the engine move', () => {
      expect(cls({ playedIndex: 0, sacrifice: sac, winBefore: 54, winPlayed: 54 })).toBe(
        'brilliant',
      );
    });

    it('or as an excellent move', () => {
      expect(cls({ sacrifice: sac, winBefore: 54, winPlayed: 53 })).toBe('brilliant');
    });

    it('not a pawn sacrifice', () => {
      expect(
        cls({ playedIndex: 0, sacrifice: { value: 1, netMaterial: -1 }, winBefore: 54, winPlayed: 54 }),
      ).toBe('best');
    });

    it('not when the material comes straight back', () => {
      expect(
        cls({ playedIndex: 0, sacrifice: { value: 3, netMaterial: -1 }, winBefore: 54, winPlayed: 54 }),
      ).toBe('best');
    });

    it('not when everything else was already winning', () => {
      expect(
        cls({ playedIndex: 0, sacrifice: sac, notAlreadyWinning: false, winBefore: 95, winPlayed: 95 }),
      ).toBe('best');
    });

    it('not an unsound one', () => {
      expect(cls({ sacrifice: sac, winBefore: 55, winPlayed: 52 })).toBe('good');
    });

    it('outranks great, and is never given to a forced move', () => {
      expect(cls({ playedIndex: 0, sacrifice: sac, onlyMoveMargin: 0.5 })).toBe('brilliant');
      expect(cls({ forced: true, sacrifice: sac })).toBe('best');
    });
  });

  describe('great', () => {
    it('is the engine move when every other line loses at least 0.15 expected points', () => {
      expect(cls({ playedIndex: 0, onlyMoveMargin: 0.15, winBefore: 60, winPlayed: 60 })).toBe(
        'great',
      );
      expect(cls({ playedIndex: 0, onlyMoveMargin: 0.149, winBefore: 60, winPlayed: 60 })).toBe(
        'best',
      );
    });

    it('needs the move to be best', () => {
      expect(cls({ onlyMoveMargin: 0.5, winBefore: 60, winPlayed: 59 })).toBe('excellent');
    });

    it('is not awarded to a forced move', () => {
      expect(cls({ forced: true, onlyMoveMargin: 0.5 })).toBe('best');
    });
  });

  describe('miss (rule 7d)', () => {
    it('is an inaccuracy or mistake that left three pawns of material', () => {
      expect(cls({ missedMaterial: 3, winBefore: 55, winPlayed: 48 })).toBe('miss');
      expect(cls({ missedMaterial: 3, winBefore: 55, winPlayed: 40 })).toBe('miss');
    });

    it('is not a mistake that missed only a pawn or two', () => {
      expect(cls({ missedMaterial: 2.9, winBefore: 55, winPlayed: 40 })).toBe('mistake');
    });

    it('does not touch a move that lost almost nothing', () => {
      expect(cls({ missedMaterial: 5, winBefore: 55, winPlayed: 54 })).toBe('excellent');
    });

    it('is a blunder-sized loss only when it gave back the opponent’s gift', () => {
      expect(cls({ missedMaterial: 5, winBefore: 90, winPlayed: 50 })).toBe('blunder');
      expect(
        cls({ missedMaterial: 5, winBefore: 90, winPlayed: 50, opponentGaveChance: true }),
      ).toBe('miss');
    });
  });

  describe('missed mate (rule 7e)', () => {
    it('is a miss at any size', () => {
      expect(cls({ missedMate: true, winBefore: 100, winPlayed: 97 })).toBe('miss');
      expect(cls({ missedMate: true, winBefore: 100, winPlayed: 20 })).toBe('miss');
    });

    it('but a move that walks into mate stays a blunder', () => {
      expect(cls({ missedMate: true, allowsMate: true, winBefore: 100, winPlayed: 0 })).toBe(
        'blunder',
      );
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

describe('gameAccuracy: lichess AccuracyPercentTest (criterion 8)', () => {
  // Ported case for case from lila modules/analyse/src/test/AccuracyPercentTest.scala.
  const close = (value: number | null, target: number, delta: number) => {
    expect(value).not.toBeNull();
    expect(Math.abs(value! - target)).toBeLessThanOrEqual(delta);
  };
  const compute = (cps: number[]) => gameAccuracy(cps, 'w');
  const computeBlack = (cps: number[]) => gameAccuracy(cps, 'b');
  const fill = (n: number, xs: number[]) => Array.from({ length: n }, () => xs).flat();

  it('empty game', () => {
    expect(compute([])).toEqual({ w: null, b: null });
  });
  it('single move', () => {
    expect(compute([15])).toEqual({ w: null, b: null });
  });
  it('two good moves', () => {
    const a = compute([15, 15]);
    close(a.w, 100, 1);
    close(a.b, 100, 1);
  });
  it('white blunders on first move', () => {
    const a = compute([-900, -900]);
    close(a.w, 10, 5);
    close(a.b, 100, 1);
  });
  it('black blunders on first move', () => {
    const a = compute([15, 900]);
    close(a.w, 100, 1);
    close(a.b, 10, 5);
  });
  it('both blunder on first move', () => {
    const a = compute([-900, 0]);
    close(a.w, 10, 5);
    close(a.b, 10, 5);
  });
  it('20 perfect moves', () => {
    const a = compute(fill(20, [15]));
    close(a.w, 100, 1);
    close(a.b, 100, 1);
  });
  it('20 perfect moves and a white blunder', () => {
    const a = compute([...fill(20, [15]), -900]);
    close(a.w, 50, 5);
    close(a.b, 100, 1);
  });
  it('21 perfect moves and a black blunder', () => {
    const a = compute([...fill(21, [15]), 900]);
    close(a.w, 100, 1);
    close(a.b, 50, 5);
  });
  it('5 average moves (65 cpl) on each side', () => {
    const a = compute(fill(5, [-50, 15]));
    close(a.w, 76, 8);
    close(a.b, 76, 8);
  });
  it('50 average moves (65 cpl) on each side', () => {
    const a = compute(fill(50, [-50, 15]));
    close(a.w, 76, 8);
    close(a.b, 76, 8);
  });
  it('50 mediocre moves (150 cpl) on each side', () => {
    const a = compute(fill(50, [-135, 15]));
    close(a.w, 54, 8);
    close(a.b, 54, 8);
  });
  it('50 terrible moves (500 cpl) on each side', () => {
    const a = compute(fill(50, [-435, 15]));
    close(a.w, 20, 8);
    close(a.b, 20, 8);
  });

  it('black moves first, empty game', () => {
    expect(computeBlack([])).toEqual({ w: null, b: null });
  });
  it('black moves first, single move', () => {
    expect(computeBlack([15])).toEqual({ w: null, b: null });
  });
  it('black moves first, two good moves', () => {
    const a = computeBlack([15, 15]);
    close(a.b, 100, 1);
    close(a.w, 100, 1);
  });
  it('black moves first, black blunders on first move', () => {
    const a = computeBlack([900, 900]);
    close(a.b, 10, 5);
    close(a.w, 100, 1);
  });
  it('black moves first, white blunders on first move', () => {
    const a = computeBlack([15, -900]);
    close(a.b, 100, 1);
    close(a.w, 10, 5);
  });
  it('black moves first, both blunder on first move', () => {
    const a = computeBlack([900, 0]);
    close(a.b, 10, 5);
    close(a.w, 10, 5);
  });

  it('matches the prototype port on its sample game (58.3 / 54.4)', () => {
    // docs/design/app.html `R.cp`: the start position, then one cp per ply.
    const cp = [
      13, 11, 7, 10, 13, 11, 5, 19, 17, 19, 10, 1, 4, 4, 5, 3, 14, 0, 13, -8, 296, 33, 57, -223,
      -207, -291, -258, -255, -279, -268, -271, -281, -268, -271, -22, -28, -20, -530, -17, -241,
      432, 199, 650, 145, 204, 74, 203, 115, 207,
    ];
    const a = gameAccuracy(cp.slice(1), 'w', cp[0]);
    expect(a.w!.toFixed(1)).toBe('58.3');
    expect(a.b!.toFixed(1)).toBe('54.4');
  });

  it('skips a pair with an unknown eval', () => {
    const a = gameAccuracy([15, null, 15, 15], 'w');
    expect(a.w).not.toBeNull();
    expect(a.b).not.toBeNull();
  });
});

describe('forceCp and lichessWinPercent', () => {
  it('forces mate to ±1000 and clamps cp', () => {
    expect(forceCp({ mate: 3 })).toBe(1000);
    expect(forceCp({ mate: -1 })).toBe(-1000);
    expect(forceCp({ cp: 2500 })).toBe(1000);
    expect(forceCp({ cp: -40 })).toBe(-40);
  });

  it('puts 1000 cp near 97.5% and 0 at 50', () => {
    expect(lichessWinPercent(0)).toBe(50);
    expect(lichessWinPercent(1000)).toBeCloseTo(97.5, 1);
    expect(lichessWinPercent(5000)).toBe(lichessWinPercent(1000));
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
