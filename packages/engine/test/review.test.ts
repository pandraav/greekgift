import { describe, expect, it } from 'vitest';

import { findOpening, openingCount, toEpd } from '../src/openings.ts';
import { parsePgn } from '../src/pgn.ts';
import { buildReview, toWhiteView } from '../src/review.ts';
import type { PositionEval, Score } from '../src/types.ts';

const PGN = `[White "alice"]
[Black "bob"]
[Result "0-1"]
[WhiteElo "1200"]
[BlackElo "1250"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. Nh4 Nxe4 0-1`;

/** One eval per position, White-relative, with a chosen best move. */
function evalsFor(fens: string[], cps: number[], bests: string[]): PositionEval[] {
  return fens.map((fen, i) => ({
    fen,
    nodes: 300_000,
    engineBuild: 'test',
    lines: [
      {
        multipv: 1 as const,
        score: { cp: cps[i] ?? 0 } as Score,
        pv: [bests[i] ?? 'a2a3'],
        depth: 15,
        nodes: 300_000,
      },
    ],
  }));
}

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
