import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { fortress } from '../src/detect/fortress.ts';
import { material } from '../src/motifs.ts';
import type {
  Classification,
  Color,
  MoveAnalysis,
  PlayerSummary,
  PositionEval,
  Review,
} from '../src/types.ts';

/* ── positions ────────────────────────────────────────────────────────── */

/** Black is a rook down and the pawns are welded together. */
const BLOCKED_ROOK_DOWN = '5k2/5p1p/5Pp1/6P1/7P/8/8/5K1R b - - 0 1';

/** White is a bishop down with the pawns locked. */
const BISHOP_DOWN = '8/8/1b2k3/4p3/4P3/8/4K3/8 w - - 0 1';

/** A rook each, but Black has two spare pawns: a deficit of two, not three. */
const TWO_PAWNS_DOWN = '4r3/pp2k3/8/8/8/8/4K3/4R3 w - - 0 1';

/** Level material in a normal middlegame. */
const MIDDLEGAME = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5';

const ALL_FENS = [BLOCKED_ROOK_DOWN, BISHOP_DOWN, TWO_PAWNS_DOWN, MIDDLEGAME];

describe('the positions these tests are built on', () => {
  it('are all real', () => {
    for (const fen of ALL_FENS) expect(() => new Chess(fen)).not.toThrow();
  });

  it('have the material balances the cases below assume', () => {
    expect(material(BLOCKED_ROOK_DOWN)).toBe(5);
    expect(material(BISHOP_DOWN)).toBe(-3);
    expect(material(TWO_PAWNS_DOWN)).toBe(-2);
    expect(material(MIDDLEGAME)).toBe(0);
  });
});

/* ── fakes ────────────────────────────────────────────────────────────── */

const positionEval = (fen: string): PositionEval => ({
  fen,
  nodes: 1_000_000,
  engineBuild: 'test',
  lines: [{ multipv: 1, score: { cp: 0 }, pv: ['e2e3'], depth: 30, nodes: 1_000_000 }],
});

const COUNTS: Record<Classification, number> = {
  brilliant: 0,
  great: 0,
  best: 0,
  excellent: 0,
  good: 0,
  book: 0,
  inaccuracy: 0,
  mistake: 0,
  miss: 0,
  blunder: 0,
};

const player = (username: string, color: Color): PlayerSummary => ({
  username,
  color,
  accuracy: 90,
  acpl: 20,
  estimatedRating: 1800,
  estimatedRatingBand: 150,
  counts: { ...COUNTS },
});

/**
 * A review whose only interesting content is, per ply, White's win% and the
 * position on the board afterwards — the two things the detector reads.
 */
function reviewOf(whiteWins: number[], fenAfter: string): Review {
  const moves: MoveAnalysis[] = whiteWins.map((whiteWin, i) => {
    const ply = i + 1;
    const color: Color = ply % 2 === 1 ? 'w' : 'b';
    // `winAfter` is stored in the mover's view, so Black's is the complement.
    const winAfter = color === 'w' ? whiteWin : 100 - whiteWin;
    return {
      ply,
      color,
      san: 'Kf1',
      uci: 'e1f1',
      fenBefore: fenAfter,
      fenAfter,
      evalBefore: positionEval(fenAfter),
      evalAfter: positionEval(fenAfter),
      winBefore: winAfter,
      winAfter,
      epLoss: 0,
      moveAccuracy: 100,
      classification: 'best',
      forced: false,
      bestMove: 'e1f1',
      bestLine: ['e1f1'],
    };
  });

  return {
    gameId: 'test',
    engineBuild: 'test',
    nodes: 1_000_000,
    moves,
    keyMoments: [],
    white: player('white', 'w'),
    black: player('black', 'b'),
  };
}

/** Ten plies of a pinned evaluation, said once so the cases stay readable. */
const STABLE_10 = [50, 52, 48, 55, 45, 50, 58, 42, 50, 51];

/* ── the detector ─────────────────────────────────────────────────────── */

describe('fortress', () => {
  it('fires when a rook-down side has held the evaluation for ten plies', () => {
    const review = reviewOf(STABLE_10, BLOCKED_ROOK_DOWN);

    expect(fortress(review, 10)).toEqual({
      type: 'fortress',
      side: 'b',
      deficit: 5,
      stablePlies: 10,
    });
  });

  it('fires at the bare minimum: a bishop down, eight stable plies', () => {
    // The first two plies are wild, so the run that ends at ply 10 is exactly
    // eight long — the shortest run the design accepts.
    const review = reviewOf([90, 20, 50, 52, 48, 55, 45, 50, 58, 42], BISHOP_DOWN);

    expect(fortress(review, 10)).toEqual({
      type: 'fortress',
      side: 'w',
      deficit: 3,
      stablePlies: 8,
    });
  });

  it('says nothing when the deficit is only two pawns', () => {
    const review = reviewOf(STABLE_10, TWO_PAWNS_DOWN);

    expect(fortress(review, 10)).toBeNull();
  });

  it('says nothing when the evaluation has only held for seven plies', () => {
    // Ply 3 is outside the band, so the run ending at ply 10 is seven long.
    const review = reviewOf([50, 50, 85, 52, 48, 55, 45, 50, 58, 42], BLOCKED_ROOK_DOWN);

    expect(fortress(review, 10)).toBeNull();
  });

  it('says nothing when the run has just broken at this very ply', () => {
    const review = reviewOf([50, 52, 48, 55, 45, 50, 58, 42, 50, 88], BLOCKED_ROOK_DOWN);

    expect(fortress(review, 10)).toBeNull();
  });

  it('says nothing about a level middlegame', () => {
    const review = reviewOf(STABLE_10, MIDDLEGAME);

    expect(fortress(review, 10)).toBeNull();
  });

  it('says nothing about a ply the review does not contain', () => {
    const review = reviewOf(STABLE_10, BLOCKED_ROOK_DOWN);

    expect(fortress(review, 99)).toBeNull();
  });
});
