import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { findOpening, openingCount, toEpd } from '../src/openings.ts';
import { parsePgn } from '../src/pgn.ts';
import { buildReview, terminalScore, toWhiteView } from '../src/review.ts';
import type { PositionEval, Score } from '../src/types.ts';

const PGN = `[White "alice"]
[Black "bob"]
[Result "0-1"]
[WhiteElo "1200"]
[BlackElo "1250"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. Nh4 Nxe4 0-1`;

interface LineSpec {
  score: Score;
  pv: string[];
}

/**
 * One eval per position, White-relative. `null` is a finished position: the
 * engine had no line to give, which is how the client resolves mate and
 * stalemate.
 */
function evalsFrom(fens: string[], specs: (LineSpec[] | null)[]): PositionEval[] {
  return fens.map((fen, i) => ({
    fen,
    nodes: 300_000,
    engineBuild: 'test',
    lines: (specs[i] ?? []).map((line, j) => ({
      multipv: (j + 1) as 1 | 2 | 3,
      score: line.score,
      pv: line.pv,
      depth: 15,
      nodes: 300_000,
    })),
  }));
}

/** One eval per position, White-relative, with a chosen best move. */
function evalsFor(fens: string[], cps: number[], bests: string[]): PositionEval[] {
  return evalsFrom(
    fens,
    fens.map((_, i) => [{ score: { cp: cps[i] ?? 0 }, pv: [bests[i] ?? 'a2a3'] }]),
  );
}

const plain = (gameId: string, game: ReturnType<typeof parsePgn>, evals: PositionEval[]) =>
  buildReview({
    gameId,
    game,
    evals,
    whiteUsername: 'a',
    blackUsername: 'b',
    nodes: 300_000,
    engineBuild: 'test',
  });

describe('toWhiteView', () => {
  it('leaves a White-to-move score alone', () => {
    expect(toWhiteView({ cp: 120 }, true)).toEqual({ cp: 120 });
  });
  it('flips a Black-to-move score, which is the bug that poisons everything', () => {
    expect(toWhiteView({ cp: 120 }, false)).toEqual({ cp: -120 });
    expect(toWhiteView({ mate: 2 }, false)).toEqual({ mate: -2 });
  });
});

describe('openings', () => {
  it('ships a real book', () => {
    expect(openingCount).toBeGreaterThan(3000);
  });

  it('drops the move counters, so transpositions match', () => {
    expect(toEpd('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });

  it('names the Ruy Lopez and says where theory ran out', () => {
    const game = parsePgn(PGN);
    const found = findOpening(game.fens);
    expect(found?.eco).toMatch(/^C7/); // Ruy Lopez, Morphy Defence
    expect(found?.name).toMatch(/Ruy Lopez|Spanish/i);
    // 5. Nh4 is not theory; the book must stop before it.
    expect(found?.lastBookPly).toBeLessThan(9);
    expect(found?.lastBookPly).toBeGreaterThanOrEqual(6);
  });

  it('returns nothing for a position off the map', () => {
    expect(findOpening(['8/8/8/4k3/8/4K3/8/8 w - - 0 1'])).toBeUndefined();
  });
});

describe('buildReview', () => {
  const game = parsePgn(PGN);
  // White is level until 5. Nh4??, which drops a pawn and the position with it.
  const cps = [20, 15, 18, 12, 20, 10, 15, 8, 12, -880, -900];
  // Every move is the engine's own choice except the blunder, where the engine
  // wanted something else — otherwise `playedBest` would excuse it.
  const bests = game.moves.map((m, i) => (i === 8 ? 'e1g1' : m.uci)).concat('a2a3');
  const review = buildReview({
    gameId: 'test-1',
    game,
    evals: evalsFor(game.fens, cps, bests),
    whiteUsername: 'alice',
    blackUsername: 'bob',
    whiteRating: 1200,
    blackRating: 1250,
    nodes: 300_000,
    engineBuild: 'test',
  });

  it('produces one analysis per move', () => {
    expect(review.moves).toHaveLength(game.moves.length);
    expect(review.moves[0]!.ply).toBe(1);
  });

  it('names the opening and records where the book ended', () => {
    expect(review.opening?.eco).toMatch(/^C7/);
    expect(review.opening!.lastBookPly).toBeGreaterThan(0);
  });

  it('marks the moves inside the book as book', () => {
    const book = review.moves.filter((m) => m.classification === 'book');
    expect(book.length).toBe(review.opening!.lastBookPly);
  });

  it('catches the blunder', () => {
    const nh4 = review.moves.find((m) => m.san === 'Nh4')!;
    expect(nh4.classification).toBe('blunder');
    expect(nh4.epLoss).toBeGreaterThan(0.22);
    expect(nh4.moveAccuracy).toBeLessThan(30);
  });

  it('blames White for it, not Black', () => {
    expect(review.white.accuracy).toBeLessThan(review.black.accuracy);
    expect(review.white.counts.blunder).toBe(1);
    expect(review.black.counts.blunder).toBe(0);
  });

  it('keeps book moves out of accuracy, so theory is not credit', () => {
    // Every scored move for Black here is fine, so Black should be high.
    expect(review.black.accuracy).toBeGreaterThan(80);
  });

  it('orders key moments by how much was thrown away', () => {
    expect(review.keyMoments.length).toBeGreaterThan(0);
    const severities = review.keyMoments.map((k) => k.severity);
    expect([...severities].sort((a, b) => b - a)).toEqual(severities);
    expect(review.keyMoments[0]!.kind).toBe('blunder');
  });

  it('marks a game down against the rating we already knew', () => {
    // Two moves out of book and one of them threw the game away, so the
    // estimate should sit well under the 1200 we started from — and the band
    // should be wide, because one game is a terrible sample.
    expect(review.white.estimatedRating).toBeLessThan(1200);
    expect(review.white.estimatedRatingBand).toBeGreaterThan(200);
    expect(review.black.estimatedRating).toBeGreaterThan(review.white.estimatedRating);
  });

  it('refuses a mismatched number of evaluations', () => {
    expect(() =>
      buildReview({
        gameId: 'x',
        game,
        evals: [],
        whiteUsername: 'a',
        blackUsername: 'b',
        nodes: 1,
        engineBuild: 't',
      }),
    ).toThrow(/one evaluation per position/);
  });
});

describe('buildReview with the game’s own opening headers', () => {
  const game = parsePgn(PGN);
  const evals = evalsFor(
    game.fens,
    [20, 15, 18, 12, 20, 10, 15, 8, 12, -880, -900],
    game.moves.map((m, i) => (i === 8 ? 'e1g1' : m.uci)).concat('a2a3'),
  );

  it('prefers the imported name over our smaller book', () => {
    const review = buildReview({
      gameId: 'x',
      game,
      evals,
      whiteUsername: 'a',
      blackUsername: 'b',
      nodes: 1,
      engineBuild: 't',
      opening: { eco: 'C77', name: 'Ruy Lopez: Morphy Defense, Anderssen Variation' },
    });
    expect(review.opening?.eco).toBe('C77');
    expect(review.opening?.name).toContain('Anderssen');
    // …but the depth still comes from our own book, not from the header.
    expect(review.opening!.lastBookPly).toBeGreaterThan(0);
    expect(review.moves.filter((m) => m.classification === 'book')).toHaveLength(
      review.opening!.lastBookPly,
    );
  });

  it('falls back to the book when the import had no name', () => {
    const review = buildReview({
      gameId: 'x',
      game,
      evals,
      whiteUsername: 'a',
      blackUsername: 'b',
      nodes: 1,
      engineBuild: 't',
    });
    expect(review.opening?.eco).toMatch(/^C7/);
  });
});

/* ── terminal positions ───────────────────────────────────────────────── */

const SCHOLARS = `[White "a"]
[Black "b"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

const FOOLS = `[White "a"]
[Black "b"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

/** Sam Loyd's ten-move stalemate. */
const LOYD = `[White "a"]
[Black "b"]
[Result "1/2-1/2"]

1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. h4 Rah6 5. Qxc7 f6 6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6 10. Qe6 1/2-1/2`;

describe('terminalScore', () => {
  it('scores a checkmated Black as a win for White', () => {
    const fen = parsePgn(SCHOLARS).fens.at(-1)!;
    expect(new Chess(fen).isCheckmate()).toBe(true);
    expect(terminalScore(fen)).toEqual({ mate: 1 });
  });

  it('scores a checkmated White as a win for Black', () => {
    const fen = parsePgn(FOOLS).fens.at(-1)!;
    expect(new Chess(fen).isCheckmate()).toBe(true);
    expect(terminalScore(fen)).toEqual({ mate: -1 });
  });

  it('scores stalemate as level', () => {
    const fen = parsePgn(LOYD).fens.at(-1)!;
    expect(new Chess(fen).isStalemate()).toBe(true);
    expect(terminalScore(fen)).toEqual({ cp: 0 });
  });

  it('falls back to level for anything else without a line', () => {
    expect(terminalScore('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({
      cp: 0,
    });
    expect(terminalScore('not a fen')).toEqual({ cp: 0 });
  });
});

describe('a move that delivers mate', () => {
  const game = parsePgn(SCHOLARS);
  const bests = game.moves.map((m) => m.uci);

  /**
   * Every position is a quiet +30 until the engine sees the mate; the last has
   * no line. Before 3...Nf6?? the engine wanted g6, which parries the threat.
   */
  const specsWith = (beforeMate: LineSpec[]) =>
    game.fens.map((_, i) => {
      if (i === game.fens.length - 1) return null;
      if (i === game.fens.length - 2) return beforeMate;
      if (i === game.fens.length - 3) return [{ score: { cp: 30 }, pv: ['g7g6'] }];
      return [{ score: { cp: 30 }, pv: [bests[i]!] }];
    });

  const review = plain('mate', game, evalsFrom(game.fens, specsWith([{ score: { mate: 1 }, pv: ['h5f7'] }])));
  const mate = review.moves.at(-1)!;

  it('costs nothing', () => {
    expect(mate.san).toBe('Qxf7#');
    expect(mate.winBefore).toBe(100);
    expect(mate.winAfter).toBe(100);
    expect(mate.epLoss).toBe(0);
    expect(mate.moveAccuracy).toBe(100);
  });

  it('is best', () => {
    expect(mate.classification).toBe('best');
    expect(review.keyMoments.some((k) => k.ply === mate.ply)).toBe(false);
  });

  it('leaves the accuracy and ACPL of the player who gave it untouched', () => {
    expect(review.white.acpl).toBe(0);
    expect(review.white.accuracy).toBeCloseTo(100, 5);
  });

  it('is still best, and still free, when the engine had not seen it coming', () => {
    // A shallow search that liked another move at +500: the mate on the board
    // outranks the engine's opinion, and the terminal score means no loss.
    const blind = plain(
      'blind',
      game,
      evalsFrom(game.fens, specsWith([{ score: { cp: 500 }, pv: ['c4f7'] }])),
    );
    const last = blind.moves.at(-1)!;
    expect(last.classification).toBe('best');
    expect(last.epLoss).toBe(0);
    expect(last.moveAccuracy).toBe(100);
    expect(last.winAfter).toBe(100);
    expect(blind.white.acpl).toBe(0);
  });

  it('is the blunder of the player who allowed it, not the one who found it', () => {
    const allowed = review.moves.at(-2)!;
    expect(allowed.san).toBe('Nf6');
    expect(allowed.winAfter).toBe(0);
    expect(allowed.classification).toBe('blunder');
    expect(review.black.counts.blunder).toBe(1);
  });
});

describe('a move that delivers mate as Black', () => {
  const game = parsePgn(FOOLS);
  const specs = game.fens.map((_, i): LineSpec[] | null => {
    if (i === game.fens.length - 1) return null;
    if (i === game.fens.length - 2) return [{ score: { mate: -1 }, pv: ['d8h4'] }];
    return [{ score: { cp: 0 }, pv: [game.moves[i]!.uci] }];
  });
  const review = plain('fools', game, evalsFrom(game.fens, specs));
  const mate = review.moves.at(-1)!;

  it("reads the terminal score from Black's side", () => {
    expect(mate.san).toBe('Qh4#');
    expect(mate.color).toBe('b');
    expect(mate.winBefore).toBe(100);
    expect(mate.winAfter).toBe(100);
    expect(mate.epLoss).toBe(0);
    expect(mate.moveAccuracy).toBe(100);
  });

  it('is best even though the book happens to reach this far', () => {
    expect(findOpening(game.fens)?.lastBookPly).toBe(4);
    expect(mate.classification).toBe('best');
    expect(review.black.acpl).toBe(0);
    expect(review.black.accuracy).toBeCloseTo(100, 5);
  });
});

describe('a move that delivers stalemate', () => {
  const game = parsePgn(LOYD);
  const specs = game.fens.map((_, i): LineSpec[] | null =>
    i === game.fens.length - 1 ? null : [{ score: { cp: 0 }, pv: [game.moves[i]!.uci] }],
  );
  const review = plain('loyd', game, evalsFrom(game.fens, specs));
  const last = review.moves.at(-1)!;

  it('scores the finished position as level', () => {
    expect(last.san).toBe('Qe6');
    expect(last.winAfter).toBe(50);
    expect(last.epLoss).toBe(0);
    expect(last.classification).toBe('best');
  });
});

/* ── brilliant, great, miss ───────────────────────────────────────────── */

/** 6. Nf5 leaves the knight to g6xf5, with e4xf5 the only recapture: a piece for a pawn. */
const KNIGHT_SAC = `[White "a"]
[Black "b"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 g6 5. Nc3 Bg7 6. Nf5 *`;

describe('brilliant', () => {
  const game = parsePgn(KNIGHT_SAC);
  const nf5 = game.moves.length - 1;

  /** Level game; after Nf5 the engine says gxf5 exf5 and the eval barely moves. */
  const specs = (cpAfter: number) =>
    game.fens.map((_, i): LineSpec[] =>
      i === game.fens.length - 1
        ? [{ score: { cp: cpAfter }, pv: ['g6f5', 'e4f5'] }]
        : [{ score: { cp: 40 }, pv: [game.moves[i]!.uci] }],
    );

  it('is a quiet move that gives up a piece and keeps the evaluation', () => {
    const review = plain('sac', game, evalsFrom(game.fens, specs(30)));
    const move = review.moves[nf5]!;
    expect(move.san).toBe('Nf5');
    expect(move.classification).toBe('brilliant');
    expect(move.epLoss).toBeLessThan(0.01);
    expect(review.white.counts.brilliant).toBe(1);
  });

  it('is a key moment, ranked as one', () => {
    const review = plain('sac', game, evalsFrom(game.fens, specs(30)));
    const moment = review.keyMoments.find((k) => k.kind === 'brilliant');
    expect(moment?.ply).toBe(review.moves[nf5]!.ply);
    expect(moment!.severity).toBeGreaterThan(0.2);
  });

  it('is not brilliant when the sacrifice costs more than two points', () => {
    // +40 → 0 is nearly four points of win chance: the engine move, but a
    // sacrifice that did not hold up.
    const review = plain('unsound', game, evalsFrom(game.fens, specs(0)));
    expect(review.moves[nf5]!.classification).toBe('best');
  });

  it('is not brilliant when the piece is not really given up', () => {
    // The engine's line has Black declining the knight: nothing was sacrificed.
    const declined = specs(30).map((lines, i) =>
      i === game.fens.length - 1 ? [{ score: { cp: 30 }, pv: ['d7d6'] }] : lines,
    );
    const review = plain('declined', game, evalsFrom(game.fens, declined));
    expect(review.moves[nf5]!.classification).toBe('best');
  });
});

describe('great', () => {
  const game = parsePgn(PGN);
  const NH4 = 8;

  /** 5. Nh4 is the engine's move; the second line is whatever we say it is. */
  const specs = (second: Score) =>
    game.fens.map((_, i): LineSpec[] => {
      if (i === NH4) {
        return [
          { score: { cp: 20 }, pv: ['f3h4'] },
          { score: second, pv: ['e1g1'] },
        ];
      }
      return [{ score: { cp: 20 }, pv: [game.moves[i]?.uci ?? 'a2a3'] }];
    });

  it('is the engine move when the alternative was losing', () => {
    const review = plain('great', game, evalsFrom(game.fens, specs({ mate: -4 })));
    const move = review.moves[NH4]!;
    expect(move.san).toBe('Nh4');
    expect(move.classification).toBe('great');
    expect(review.white.counts.great).toBe(1);
    expect(review.keyMoments.find((k) => k.kind === 'great')?.ply).toBe(move.ply);
  });

  it('is only best when the alternative was nearly as good', () => {
    const review = plain('best', game, evalsFrom(game.fens, specs({ cp: 10 })));
    expect(review.moves[NH4]!.classification).toBe('best');
  });
});

describe('miss', () => {
  const game = parsePgn(PGN);
  const NH4 = 8;

  /**
   * At move 5 White was well on top (+600) and Bxc6 won a knight; Nh4 keeps
   * an edge (+300) but not that one. +600 → +300 is 0.15 expected points: a
   * mistake, with a piece left behind.
   */
  const specs = (best: string, reply: string[]) =>
    game.fens.map((_, i): LineSpec[] => {
      if (i === NH4) return [{ score: { cp: 600 }, pv: [best] }];
      if (i === NH4 + 1) return [{ score: { cp: 300 }, pv: reply }];
      return [{ score: { cp: 20 }, pv: [game.moves[i]?.uci ?? 'a2a3'] }];
    });

  it('is a mistake that left a piece on the board', () => {
    const review = plain('miss', game, evalsFrom(game.fens, specs('a4c6', ['f6e4'])));
    const move = review.moves[NH4]!;
    expect(move.san).toBe('Nh4');
    expect(move.epLoss).toBeGreaterThanOrEqual(0.12);
    expect(move.epLoss).toBeLessThan(0.22);
    expect(move.classification).toBe('miss');
    expect(review.white.counts.miss).toBe(1);
    expect(review.white.counts.mistake).toBe(0);
  });

  it('is a key moment, weighed by what it cost', () => {
    const review = plain('miss', game, evalsFrom(game.fens, specs('a4c6', ['f6e4'])));
    const moment = review.keyMoments.find((k) => k.kind === 'miss')!;
    expect(moment.ply).toBe(review.moves[NH4]!.ply);
    expect(moment.severity).toBeCloseTo(review.moves[NH4]!.epLoss / 0.4, 6);
  });

  it('stays a mistake when nothing concrete was missed', () => {
    // Same loss, but the engine wanted to castle: no capture, and the line
    // only drops a pawn.
    const review = plain('mistake', game, evalsFrom(game.fens, specs('e1g1', ['f6e4'])));
    expect(review.moves[NH4]!.classification).toBe('mistake');
  });
});
