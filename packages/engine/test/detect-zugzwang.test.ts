import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { zugzwang } from '../src/detect/zugzwang.ts';
import { expectedPoints, fromMoverView, winPercent } from '../src/scoring.ts';
import type {
  Classification,
  Color,
  EngineLine,
  MoveAnalysis,
  PlayerSummary,
  PositionEval,
  Review,
  Score,
} from '../src/types.ts';

/* ── positions ────────────────────────────────────────────────────────────
 * Every FEN below is listed here and checked against chess.js, so a typo
 * fails as a bad position rather than as a mysteriously silent detector.
 */

/**
 * The trébuchet, and the two plies that walk into it.
 *
 * White Kd6/Pe5 against Black Kf5/Pe6: each king holds its own pawn and
 * attacks the other's, so whoever is to move must let go. White arrives with
 * Kd6, Black hands the move back with Kf5, and now White has five legal moves
 * and all of them lose the pawn.
 */
const TREBUCHET_59_BEFORE = '8/8/2K1p3/4P3/5k2/8/8/8 w - - 0 1';
const TREBUCHET_60_BEFORE = '8/8/3Kp3/4P3/5k2/8/8/8 b - - 1 1';
const TREBUCHET_61_BEFORE = '8/8/3Kp3/4Pk2/8/8/8/8 w - - 2 2';
const TREBUCHET_61_AFTER = '8/8/4p3/2K1Pk2/8/8/8/8 b - - 3 2';

/**
 * King and pawn: Black to move in front of the pawn, which is the whole game.
 *
 * With White Ke6/Pe5 against Ke8 Black has exactly two moves, Kd8 and Kf8, and
 * both step aside for the white king. White's e4–e5 is the move that puts the
 * question, and it is the engine's own choice, so it costs nothing.
 */
const OPPOSITION_58_BEFORE = '3k4/8/4K3/8/4P3/8/8/8 b - - 0 1';
const OPPOSITION_59_BEFORE = '4k3/8/4K3/8/4P3/8/8/8 w - - 1 2';
const OPPOSITION_60_BEFORE = '4k3/8/4K3/4P3/8/8/8/8 b - - 0 2';
const OPPOSITION_60_AFTER = '3k4/8/4K3/4P3/8/8/8/8 w - - 1 3';

/** Four pieces, and the rook has a pawn to take — activity, not zugzwang. */
const ROOK_59_BEFORE = '8/8/8/k7/8/2p5/8/3RK3 w - - 0 1';
const ROOK_60_BEFORE = '8/8/8/k7/8/2p5/8/2R1K3 b - - 1 1';
const ROOK_61_BEFORE = '8/8/8/1k6/8/2p5/8/2R1K3 w - - 2 2';
/** After Rxc3, the capture the detector must refuse. */
const ROOK_61_AFTER_CAPTURE = '8/8/8/1k6/8/2R5/8/4K3 b - - 0 2';
/** After Rb1+, the check it must refuse too. */
const ROOK_61_AFTER_CHECK = '8/8/8/1k6/8/2p5/8/1R2K3 b - - 3 2';

/** Twelve pieces: a middlegame, whatever the evaluations say about it. */
const MIDDLEGAME_59_BEFORE = 'r4rk1/5ppp/8/8/8/8/5PPP/R4RK1 w - - 0 1';
const MIDDLEGAME_60_BEFORE = 'r4rk1/5ppp/8/8/8/8/5PPP/4RRK1 b - - 1 1';
const MIDDLEGAME_61_BEFORE = '4rrk1/5ppp/8/8/8/8/5PPP/4RRK1 w - - 2 2';
const MIDDLEGAME_61_AFTER = '4rrk1/5ppp/8/8/8/8/5PPP/3R1RK1 b - - 3 2';

const ALL_FENS = [
  TREBUCHET_59_BEFORE,
  TREBUCHET_60_BEFORE,
  TREBUCHET_61_BEFORE,
  TREBUCHET_61_AFTER,
  OPPOSITION_58_BEFORE,
  OPPOSITION_59_BEFORE,
  OPPOSITION_60_BEFORE,
  OPPOSITION_60_AFTER,
  ROOK_59_BEFORE,
  ROOK_60_BEFORE,
  ROOK_61_BEFORE,
  ROOK_61_AFTER_CAPTURE,
  ROOK_61_AFTER_CHECK,
  MIDDLEGAME_59_BEFORE,
  MIDDLEGAME_60_BEFORE,
  MIDDLEGAME_61_BEFORE,
  MIDDLEGAME_61_AFTER,
];

const pieceCount = (fen: string): number => {
  let total = 0;
  for (const row of new Chess(fen).board()) for (const cell of row) if (cell) total += 1;
  return total;
};

describe('the positions these tests are built on', () => {
  it('are all real', () => {
    for (const fen of ALL_FENS) expect(() => new Chess(fen)).not.toThrow();
  });

  it('are the endgames and the middlegame the cases assume', () => {
    expect(pieceCount(TREBUCHET_61_BEFORE)).toBe(4);
    expect(pieceCount(OPPOSITION_60_BEFORE)).toBe(3);
    expect(pieceCount(ROOK_61_BEFORE)).toBe(4);
    expect(pieceCount(MIDDLEGAME_61_BEFORE)).toBe(12);
  });

  it('leave the side to move only moves that give ground', () => {
    // The trébuchet: five king moves, none of them holding on to e5.
    expect(new Chess(TREBUCHET_61_BEFORE).moves()).toHaveLength(5);
    // The opposition: two moves, both stepping aside.
    expect(new Chess(OPPOSITION_60_BEFORE).moves().sort()).toEqual(['Kd8', 'Kf8']);
  });
});

/* ── fakes ────────────────────────────────────────────────────────────── */

const engineLines = (scores: Score[], pvs: string[]): EngineLine[] =>
  scores.map((score, i) => ({
    multipv: (i + 1) as 1 | 2 | 3,
    score,
    pv: [pvs[i] ?? pvs[0] ?? 'e1e2'],
    depth: 30,
    nodes: 1_000_000,
  }));

const evalOf = (fen: string, scores: Score[], pvs: string[]): PositionEval => ({
  fen,
  nodes: 1_000_000,
  engineBuild: 'test',
  lines: engineLines(scores, pvs),
});

interface Spec {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** White-relative scores of the engine's lines in `fenBefore`, best first. */
  scores: Score[];
  /** First UCI move of each of those lines; `pvs[0]` is the best move. */
  pvs: string[];
  /**
   * White-relative scores for `fenAfter`, when this fixture wants the two
   * readings of that one position to disagree. Defaults to the next move's,
   * which is the same position seen again.
   */
  scoresAfter?: Score[];
}

/** The mover's win% for a White-relative score — review.ts's own reading. */
const moverWin = (score: Score | undefined, moverIsWhite: boolean): number =>
  score === undefined ? 50 : winPercent(fromMoverView(score, moverIsWhite));

/**
 * A review built out of consecutive plies.
 *
 * `winBefore` and `winAfter` are computed from the engine lines rather than
 * written down, so every fixture obeys the invariant the detector relies on:
 * `winBefore === winPercent(fromMoverView(evalBefore.lines[0].score, ...))`.
 * `epLoss` follows from the pair, the way `classify` computes it.
 */
function reviewOf(specs: Spec[]): Review {
  const moves: MoveAnalysis[] = specs.map((spec, i) => {
    const color: Color = spec.ply % 2 === 1 ? 'w' : 'b';
    const moverIsWhite = color === 'w';
    const scoresAfter = spec.scoresAfter ?? specs[i + 1]?.scores ?? [{ cp: 0 }];

    const winBefore = moverWin(spec.scores[0], moverIsWhite);
    const winAfter = moverWin(scoresAfter[0], moverIsWhite);

    return {
      ply: spec.ply,
      color,
      san: spec.san,
      uci: spec.uci,
      fenBefore: spec.fenBefore,
      fenAfter: spec.fenAfter,
      evalBefore: evalOf(spec.fenBefore, spec.scores, spec.pvs),
      evalAfter: evalOf(spec.fenAfter, scoresAfter, [spec.uci]),
      winBefore,
      winAfter,
      epLoss: Math.max(0, expectedPoints(winBefore) - expectedPoints(winAfter)),
      moveAccuracy: 100,
      classification: 'best' as Classification,
      forced: false,
      bestMove: spec.pvs[0] ?? spec.uci,
      bestLine: spec.pvs[0] ? [spec.pvs[0]] : [],
    };
  });

  const player = (username: string, color: Color): PlayerSummary => ({
    username,
    color,
    accuracy: 90,
    acpl: 20,
    estimatedRating: 1800,
    estimatedRatingBand: 150,
    counts: {
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
    },
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

/** The mover's expected points for a White-relative score, as the spec defines it. */
const moverEp = (score: Score, moverIsWhite: boolean): number =>
  expectedPoints(winPercent(fromMoverView(score, moverIsWhite)));

/* ── the chains the cases are cut from ────────────────────────────────── */

/**
 * White walks into the trébuchet.
 *
 * The engine liked White's position a move ago (+2.5 with Black to move and
 * Black having to give way); after Kf5 the same evaluation is White's to
 * suffer. That swing across one opponent move is what the detector reads —
 * the opponent's move cost them nothing, so it is the obligation that hurts.
 */
const trebuchet = (last: Partial<Spec> = {}, intervening: Partial<Spec> = {}): Spec[] => [
  {
    ply: 59,
    san: 'Kd6',
    uci: 'c6d6',
    fenBefore: TREBUCHET_59_BEFORE,
    fenAfter: TREBUCHET_60_BEFORE,
    scores: [{ cp: 60 }],
    pvs: ['c6d6'],
  },
  {
    ply: 60,
    san: 'Kf5',
    uci: 'f4f5',
    fenBefore: TREBUCHET_60_BEFORE,
    fenAfter: TREBUCHET_61_BEFORE,
    scores: [{ cp: 250 }],
    pvs: ['f4f5'],
    ...intervening,
  },
  {
    ply: 61,
    san: 'Kc5',
    uci: 'd6c5',
    fenBefore: TREBUCHET_61_BEFORE,
    fenAfter: TREBUCHET_61_AFTER,
    scores: [{ cp: -250 }, { cp: -300 }, { cp: -320 }],
    pvs: ['d6c5', 'd6d7', 'd6c7'],
    scoresAfter: [{ cp: -260 }],
    ...last,
  },
];

/** Four pieces, but the best move takes a pawn or gives check. */
const rookEnding = (last: Partial<Spec>): Spec[] => [
  {
    ply: 59,
    san: 'Rc1',
    uci: 'd1c1',
    fenBefore: ROOK_59_BEFORE,
    fenAfter: ROOK_60_BEFORE,
    scores: [{ cp: 250 }],
    pvs: ['d1c1'],
  },
  {
    ply: 60,
    san: 'Kb5',
    uci: 'a5b5',
    fenBefore: ROOK_60_BEFORE,
    fenAfter: ROOK_61_BEFORE,
    scores: [{ cp: 250 }],
    pvs: ['a5b5'],
  },
  {
    ply: 61,
    san: 'Rxc3',
    uci: 'c1c3',
    fenBefore: ROOK_61_BEFORE,
    fenAfter: ROOK_61_AFTER_CAPTURE,
    scores: [{ cp: -250 }, { cp: -300 }],
    pvs: ['c1c3', 'c1b1'],
    scoresAfter: [{ cp: -260 }],
    ...last,
  },
];

/* ── the detector ─────────────────────────────────────────────────────── */

describe('zugzwang', () => {
  it('fires in the trébuchet, where every legal move loses the pawn', () => {
    const review = reviewOf(trebuchet());

    // The premise, spelled out rather than assumed: White stood at +2.5 after
    // Kd6, the best line now sits more than a tenth of a point under that, and
    // the worst line is under it too.
    const standing = moverEp({ cp: 250 }, true);
    expect(standing).toBeCloseTo(0.715, 3);
    expect(standing - moverEp({ cp: -250 }, true)).toBeGreaterThanOrEqual(0.1);
    expect(moverEp({ cp: -320 }, true)).toBeLessThanOrEqual(standing - 0.05);
    // And Black's move handed the position over without costing them anything.
    expect(review.moves[1]!.epLoss).toBe(0);

    expect(zugzwang(review, 61)).toEqual({ type: 'zugzwang', side: 'w' });
  });

  it('fires for Black in a king-and-pawn ending, reading the scores from Black’s side', () => {
    const review = reviewOf([
      {
        ply: 58,
        san: 'Ke8',
        uci: 'd8e8',
        fenBefore: OPPOSITION_58_BEFORE,
        fenAfter: OPPOSITION_59_BEFORE,
        scores: [{ cp: 90 }],
        pvs: ['d8e8'],
      },
      {
        ply: 59,
        san: 'e5',
        uci: 'e4e5',
        fenBefore: OPPOSITION_59_BEFORE,
        fenAfter: OPPOSITION_60_BEFORE,
        scores: [{ cp: 100 }],
        pvs: ['e4e5'],
      },
      {
        ply: 60,
        san: 'Kd8',
        uci: 'e8d8',
        fenBefore: OPPOSITION_60_BEFORE,
        fenAfter: OPPOSITION_60_AFTER,
        // White-relative, so positive numbers are the ones that hurt Black.
        scores: [{ cp: 320 }, { cp: 380 }],
        pvs: ['e8d8', 'e8f8'],
        scoresAfter: [{ cp: 400 }],
      },
    ]);

    const standing = moverEp({ cp: 100 }, false);
    expect(standing).toBeCloseTo(0.409, 3);
    expect(standing - moverEp({ cp: 320 }, false)).toBeGreaterThanOrEqual(0.1);
    expect(moverEp({ cp: 380 }, false)).toBeLessThanOrEqual(standing - 0.05);
    // e4–e5 was the engine's move: it cost White nothing.
    expect(review.moves[1]!.epLoss).toBe(0);

    expect(zugzwang(review, 60)).toEqual({ type: 'zugzwang', side: 'b' });
  });

  it('says nothing when the opponent’s move in between cost them real points', () => {
    // The drop has to be the obligation to move, not a present. Here the two
    // readings of the position after Kf5 disagree — the engine saw it as −2.5
    // when searching it in its own right, and as +0.7 at the end of Black's
    // move — so Black's move shows a real loss and the detector backs off.
    const review = reviewOf(trebuchet({}, { scoresAfter: [{ cp: 321 }] }));

    expect(review.moves[1]!.epLoss).toBeCloseTo(0.05, 2);
    expect(review.moves[1]!.epLoss).toBeGreaterThan(0.02);

    expect(zugzwang(review, 61)).toBeNull();
  });

  it('says nothing when one line still holds within five hundredths', () => {
    // A multipv set that came back out of order — the third line keeps White's
    // standing. A position with a move in it is not zugzwang.
    const review = reviewOf(
      trebuchet({ scores: [{ cp: -250 }, { cp: -300 }, { cp: 220 }] }),
    );

    const standing = moverEp({ cp: 250 }, true);
    const held = moverEp({ cp: 220 }, true);
    expect(held).toBeGreaterThan(standing - 0.05);
    expect(held).toBeLessThan(standing);

    expect(zugzwang(review, 61)).toBeNull();
  });

  it('says nothing when the best move takes something', () => {
    const review = reviewOf(rookEnding({}));

    // Everything else is in place: four pieces, a good opponent move, and a
    // drop of more than a tenth of a point across it.
    expect(review.moves[1]!.epLoss).toBe(0);
    expect(moverEp({ cp: 250 }, true) - moverEp({ cp: -250 }, true)).toBeGreaterThanOrEqual(
      0.1,
    );
    // Rxc3 is a capture, and a capture is activity, not zugzwang.
    expect(zugzwang(review, 61)).toBeNull();
  });

  it('says nothing when the best move gives check', () => {
    const review = reviewOf(
      rookEnding({
        san: 'Rb1+',
        uci: 'c1b1',
        fenAfter: ROOK_61_AFTER_CHECK,
        pvs: ['c1b1', 'c1c3'],
      }),
    );

    expect(zugzwang(review, 61)).toBeNull();
  });

  it('says nothing in a middlegame, however bad the alternatives look', () => {
    const review = reviewOf([
      {
        ply: 59,
        san: 'Rae1',
        uci: 'a1e1',
        fenBefore: MIDDLEGAME_59_BEFORE,
        fenAfter: MIDDLEGAME_60_BEFORE,
        scores: [{ cp: 250 }],
        pvs: ['a1e1'],
      },
      {
        ply: 60,
        san: 'Rae8',
        uci: 'a8e8',
        fenBefore: MIDDLEGAME_60_BEFORE,
        fenAfter: MIDDLEGAME_61_BEFORE,
        scores: [{ cp: 250 }],
        pvs: ['a8e8'],
      },
      {
        ply: 61,
        san: 'Red1',
        uci: 'e1d1',
        fenBefore: MIDDLEGAME_61_BEFORE,
        fenAfter: MIDDLEGAME_61_AFTER,
        scores: [{ cp: -250 }, { cp: -300 }, { cp: -320 }],
        pvs: ['e1d1', 'e1c1', 'e1b1'],
        scoresAfter: [{ cp: -260 }],
      },
    ]);

    expect(pieceCount(MIDDLEGAME_61_BEFORE)).toBeGreaterThan(7);
    expect(zugzwang(review, 61)).toBeNull();
  });

  it('says nothing when the mover has no previous move to be measured against', () => {
    const review = reviewOf(trebuchet());

    // Ply 59 is the first move the review knows about, so there is no ply 57
    // and so no standing to compare with.
    expect(zugzwang(review, 59)).toBeNull();
  });

  it('says nothing when the opponent’s move in between is missing', () => {
    const full = reviewOf(trebuchet());
    const gapped: Review = { ...full, moves: full.moves.filter((m) => m.ply !== 60) };

    expect(zugzwang(gapped, 61)).toBeNull();
  });

  it('says nothing about a ply the review does not contain', () => {
    expect(zugzwang(reviewOf(trebuchet()), 99)).toBeNull();
  });

  it('says nothing when the engine gave no lines', () => {
    const review = reviewOf(trebuchet({ scores: [], pvs: [] }));

    expect(zugzwang(review, 61)).toBeNull();
  });
});
