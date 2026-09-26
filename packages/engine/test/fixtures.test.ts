import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { positionScore } from '../src/review.ts';
import { forceCp, gameAccuracy, winPercent } from '../src/scoring.ts';
import type { Classification, Review } from '../src/types.ts';

/**
 * Consistency checks on the committed review fixtures in `fixtures/reviews/`
 * — no engine, no network, just what `build-fixtures.mjs` already wrote.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reviewsDir = path.join(__dirname, 'fixtures/reviews');

const EXPECTED_FIXTURES = [
  'review-json-game',
  'opera-game',
  'evergreen-game',
  'capablanca-tartakower',
];

function loadFixture(name: string): Review {
  const raw = readFileSync(path.join(reviewsDir, `${name}.json`), 'utf-8');
  return JSON.parse(raw) as Review;
}

describe('fixture files', () => {
  it('has all four expected games', () => {
    const files = readdirSync(reviewsDir).filter((f) => f.endsWith('.json'));
    for (const name of EXPECTED_FIXTURES) {
      expect(files).toContain(`${name}.json`);
    }
    expect(files.length).toBe(EXPECTED_FIXTURES.length);
  });
});

describe.each(EXPECTED_FIXTURES)('%s', (name) => {
  const review = loadFixture(name);

  it('is a full Review for a fixed 20,000-node build', () => {
    expect(review.engineBuild).toBe('stockfish-18-lite-single');
    expect(review.nodes).toBe(20_000);
    expect(review.gameId).toBe(name);
  });

  it('has one fewer move than position (fens.length === moves.length + 1, via before/after chaining)', () => {
    expect(review.moves.length).toBeGreaterThan(0);
    // Each move's fenAfter must be the next move's fenBefore — the same
    // invariant `game.fens` encodes (one more position than move).
    for (let i = 0; i < review.moves.length - 1; i++) {
      expect(review.moves[i]!.fenAfter).toBe(review.moves[i + 1]!.fenBefore);
    }
  });

  it('every move carries fenBefore/fenAfter, evalBefore/evalAfter and a classification', () => {
    for (const move of review.moves) {
      expect(move.fenBefore).toEqual(expect.any(String));
      expect(move.fenAfter).toEqual(expect.any(String));
      expect(move.evalBefore).toBeDefined();
      expect(move.evalAfter).toBeDefined();
      expect(move.evalBefore.fen).toBe(move.fenBefore);
      expect(move.evalAfter.fen).toBe(move.fenAfter);
      expect(move.evalBefore.nodes).toBe(20_000);
      expect(move.evalAfter.nodes).toBe(20_000);
      expect(move.classification).toEqual(expect.any(String));
    }
  });

  it('white and black summaries account for every move', () => {
    const whiteMoves = review.moves.filter((m) => m.color === 'w').length;
    const blackMoves = review.moves.filter((m) => m.color === 'b').length;
    const sumCounts = (counts: Record<Classification, number>) =>
      Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sumCounts(review.white.counts)).toBe(whiteMoves);
    expect(sumCounts(review.black.counts)).toBe(blackMoves);
  });
});

describe('mate is represented the same way the client reports it', () => {
  it('at least one fixture has a move whose evalAfter has no lines (mate delivered)', () => {
    const anyMateDelivered = EXPECTED_FIXTURES.some((name) => {
      const review = loadFixture(name);
      return review.moves.some((m) => m.evalAfter.lines.length === 0);
    });
    expect(anyMateDelivered).toBe(true);
  });
});

describe('summary', () => {
  it('prints classification counts per fixture', () => {
    for (const name of EXPECTED_FIXTURES) {
      const review = loadFixture(name);
      const total = (counts: Record<Classification, number>) =>
        Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([cls, n]) => `${cls}:${n}`)
          .join(' ');
      console.log(
        `${name} (${review.moves.length} plies) — white[${total(review.white.counts)}] black[${total(review.black.counts)}]`,
      );
    }
    expect(true).toBe(true);
  });
});

describe('rebuilt fixtures under the review-overhaul rules', () => {
  it('the two famous queen sacrifices are brilliant, and nothing else is', () => {
    const opera = loadFixture('opera-game');
    const evergreen = loadFixture('evergreen-game');
    const brilliant = (r: Review) =>
      r.moves.filter((m) => m.classification === 'brilliant').map((m) => m.san);
    expect(brilliant(opera)).toEqual(['Qb8+']);
    expect(brilliant(evergreen)).toEqual(['Qxd7+']);
  });

  it('a recapture in a lost position is not a sacrifice (Opera 13...Rxd7)', () => {
    const move = loadFixture('opera-game').moves[25]!;
    expect(move.san).toBe('Rxd7');
    expect(move.classification).not.toBe('brilliant');
  });

  it('rule h: a game ending in mate ends the graph at 100', () => {
    const last = loadFixture('opera-game').moves.at(-1)!;
    expect(last.evalAfter.lines).toEqual([]);
    expect(winPercent(positionScore(last.evalAfter))).toBe(100);
  });

  it('accuracy is lichess gameAccuracy over every ply, book included', () => {
    const review = loadFixture('opera-game');
    const acc = gameAccuracy(
      review.moves.map((m) => forceCp(positionScore(m.evalAfter))),
      'w',
      forceCp(positionScore(review.moves[0]!.evalBefore)),
    );
    expect(review.white.accuracy).toBe(acc.w);
    expect(review.black.accuracy).toBe(acc.b);
  });
});
