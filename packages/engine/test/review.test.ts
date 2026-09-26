import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { findOpening, openingCount, toEpd } from '../src/openings.ts';
import { parsePgn } from '../src/pgn.ts';
import { sacrificeFor } from '../src/motifs.ts';
import {
  buildReview,
  lineMaterial,
  playedLineIndex,
  playedMoveScore,
  positionScore,
  terminalScore,
  toWhiteView,
} from '../src/review.ts';
import { winPercent } from '../src/scoring.ts';
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

  it('returns key moments in ply order, the blunder among them', () => {
    expect(review.keyMoments.length).toBeGreaterThan(0);
    const plies = review.keyMoments.map((k) => k.ply);
    expect([...plies].sort((a, b) => a - b)).toEqual(plies);
    expect(review.keyMoments.some((k) => k.kind === 'blunder')).toBe(true);
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

  /**
   * Level game; Nf5 is the engine's move, its line gxf5 exf5 gives a knight
   * for a pawn, and the alternative (castling) is merely level.
   */
  const specs = (cpPlayed: number) =>
    game.fens.map((_, i): LineSpec[] => {
      if (i === nf5) {
        return [
          { score: { cp: cpPlayed }, pv: ['d4f5', 'g6f5', 'e4f5', 'e8g8'] },
          { score: { cp: 20 }, pv: ['f1e2'] },
        ];
      }
      if (i === game.fens.length - 1) return [{ score: { cp: 30 }, pv: ['g6f5', 'e4f5'] }];
      return [{ score: { cp: 40 }, pv: [game.moves[i]!.uci] }];
    });

  it('is a knight given up for a pawn that keeps the evaluation', () => {
    const review = plain('sac', game, evalsFrom(game.fens, specs(40)));
    const move = review.moves[nf5]!;
    expect(move.san).toBe('Nf5');
    expect(move.classification).toBe('brilliant');
    expect(move.epLoss).toBeLessThan(0.01);
    expect(review.white.counts.brilliant).toBe(1);
  });

  it('is a key moment, ranked as one', () => {
    const review = plain('sac', game, evalsFrom(game.fens, specs(40)));
    const moment = review.keyMoments.find((k) => k.kind === 'brilliant');
    expect(moment?.ply).toBe(review.moves[nf5]!.ply);
    expect(moment!.severity).toBeGreaterThan(0.2);
  });

  it('is not brilliant when the piece is not really given up', () => {
    // The engine's line has Black declining the knight: nothing was sacrificed.
    const declined = specs(40).map((lines, i) =>
      i === nf5
        ? [{ score: { cp: 40 }, pv: ['d4f5', 'd7d6', 'f5e3', 'e8g8'] }, lines[1]!]
        : lines,
    );
    const review = plain('declined', game, evalsFrom(game.fens, declined));
    expect(review.moves[nf5]!.classification).toBe('best');
  });
});

/* ── rule f: Brilliant (criterion 7f) ─────────────────────────────────── */

/** The fixture game up to 11.Bxh7+: a bishop for a pawn, with a check. */
const GREEK_GIFT = `[White "a"]
[Black "b"]
[Result "*"]

1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 Be7 5. Bd3 O-O 6. Nbd2 c5 7. c3 Nc6 8. O-O b6
9. Qe2 Bb7 10. Rae1 Ne5 11. Bxh7+ *`;

describe('rule f: brilliant needs a real sacrifice, not already winning', () => {
  const game = parsePgn(GREEK_GIFT);
  const BXH7 = game.moves.length - 1;
  const SAC_LINE = ['d3h7', 'g8h7', 'f3g5', 'h7g8'];

  const specs = (at: LineSpec[]) =>
    game.fens.map((_, i): LineSpec[] => {
      if (i === BXH7) return at;
      if (i === game.fens.length - 1) return [{ score: { cp: 300 }, pv: ['g8h7', 'f3g5'] }];
      return [{ score: { cp: 20 }, pv: [game.moves[i]!.uci] }];
    });
  const run = (at: LineSpec[]) => plain('greek', game, evalsFrom(game.fens, specs(at))).moves[BXH7]!;

  it('a capture sacrifice (Bxh7+: pawn taken, bishop given) is brilliant', () => {
    const move = run([
      { score: { cp: 300 }, pv: SAC_LINE },
      { score: { cp: 150 }, pv: ['f3e5'] },
    ]);
    expect(move.san).toBe('Bxh7+');
    expect(move.classification).toBe('brilliant');
  });

  it('is not brilliant when the alternative is already +8', () => {
    const move = run([
      { score: { cp: 900 }, pv: SAC_LINE },
      { score: { cp: 800 }, pv: ['f3e5'] },
    ]);
    expect(move.classification).toBe('best');
  });

  it('is not brilliant when unsound', () => {
    const move = run([
      { score: { cp: 300 }, pv: ['f3e5', 'e7d6'] },
      { score: { cp: -150 }, pv: SAC_LINE },
    ]);
    expect(move.classification).not.toBe('brilliant');
    expect(move.epLoss).toBeGreaterThan(0.1);
  });

  it('a pawn sacrifice is never one', () => {
    const gambit = parsePgn(`[White "a"]
[Black "b"]
[SetUp "1"]
[FEN "4k3/8/8/4p3/8/8/5P2/4K3 w - - 0 1"]

1. f4 *`);
    const move = gambit.moves[0]!;
    const evalBefore = evalsFrom([move.fenBefore], [[{ score: { cp: 0 }, pv: ['f2f4', 'e5f4', 'e1f2', 'e8e7'] }]])[0]!;
    const evalAfter = evalsFrom([move.fenAfter], [[{ score: { cp: 0 }, pv: ['e5f4'] }]])[0]!;
    const subject = { ...move, evalBefore, evalAfter };
    const lm = lineMaterial(subject);
    expect(lm.plies).toBe(4);
    expect(lm.played - lm.before).toBe(-1);
    expect(sacrificeFor(subject, lm)).toBeNull();
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

/* ── rules b, c: Best and the played move's score (criteria 7b, 7c) ───── */

const fromFen = (fen: string, moves: string) =>
  parsePgn(`[White "a"]
[Black "b"]
[SetUp "1"]
[FEN "${fen}"]

${moves} *`);

describe('rules b, c: Best is judged inside one search', () => {
  const KINGS = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
  const game = fromFen(KINGS, '1. Kd2');

  const run = (before: LineSpec[], after: LineSpec[]) =>
    plain('b', game, evalsFrom(game.fens, [before, after])).moves[0]!;

  it('a stored second line at an equal score is best, scored from that line', () => {
    const move = run(
      [
        { score: { cp: 100 }, pv: ['e1f2'] },
        { score: { cp: 100 }, pv: ['e1d2'] },
      ],
      // A different search after the move disagrees; the line score wins.
      [{ score: { cp: -50 }, pv: ['e8d7'] }],
    );
    expect(playedLineIndex(move)).toBe(1);
    expect(move.classification).toBe('best');
    expect(move.epLoss).toBe(0);
    expect(move.winAfter).toBe(winPercent({ cp: 100 }));
  });

  it('a stored second line 0.01 EP worse is excellent', () => {
    const move = run(
      [
        { score: { cp: 100 }, pv: ['e1f2'] },
        { score: { cp: 90 }, pv: ['e1d2'] },
      ],
      [{ score: { cp: 100 }, pv: ['e8d7'] }],
    );
    expect(move.epLoss).toBeGreaterThan(0.002);
    expect(move.epLoss).toBeLessThan(0.02);
    expect(move.classification).toBe('excellent');
  });

  it('a move outside the stored lines is never best, even at no loss', () => {
    const outside = fromFen(KINGS, '1. Kf1');
    const move = plain(
      'c',
      outside,
      evalsFrom(outside.fens, [
        [
          { score: { cp: 100 }, pv: ['e1f2'] },
          { score: { cp: 100 }, pv: ['e1d2'] },
        ],
        [{ score: { cp: 100 }, pv: ['e8d7'] }],
      ]),
    ).moves[0]!;
    expect(playedLineIndex(move)).toBeNull();
    expect(move.epLoss).toBe(0);
    expect(move.classification).toBe('excellent');
  });

  it('playedMoveScore falls back to the position after, then to the board', () => {
    const move = run([{ score: { cp: 100 }, pv: ['e1f2'] }], [{ score: { cp: 42 }, pv: ['e8d7'] }]);
    expect(playedMoveScore(move)).toEqual({ cp: 42 });
  });
});

/* ── rule d: Miss, parity-matched (criterion 7d) ──────────────────────── */

describe('rule d: miss compares lines over the same even number of plies', () => {
  // White rook b1, Black knight b8 undefended.
  const FEN = '1n2k3/8/8/8/8/8/7P/1R2K3 w - - 0 1';
  const game = fromFen(FEN, '1. Ke2');

  const run = (bestLine: string[]) =>
    plain(
      'd',
      game,
      evalsFrom(game.fens, [
        [{ score: { cp: 100 }, pv: bestLine }],
        [{ score: { cp: 30 }, pv: ['e8d7', 'h2h3', 'd7c7'] }],
      ]),
    ).moves[0]!;

  it('a best line ending on an unanswered capture does not count', () => {
    const move = run(['h2h3', 'e8d7', 'b1b8']);
    expect(lineMaterial(move)).toMatchObject({ plies: 2, before: 3, best: 3, played: 3 });
    expect(move.classification).toBe('inaccuracy');
  });

  it('a capture the opponent has answered does', () => {
    const move = run(['h2h3', 'e8d7', 'b1b8', 'd7c7']);
    expect(lineMaterial(move)).toMatchObject({ plies: 4, before: 3, best: 6, played: 3 });
    expect(move.classification).toBe('miss');
  });

  it('no capture-value term: a capture taken straight back is no miss', () => {
    // Rxb8+ "takes a knight", but ...Nxb8 takes the rook back.
    const traded = fromFen('1n2k3/3n4/8/8/8/8/7P/1R2K3 w - - 0 1', '1. Ke2');
    const move = plain(
      'd2',
      traded,
      evalsFrom(traded.fens, [
        [{ score: { cp: 100 }, pv: ['b1b8', 'd7b8', 'e1e2', 'e8e7'] }],
        [{ score: { cp: 30 }, pv: ['e8e7', 'h2h3', 'e7e6'] }],
      ]),
    ).moves[0]!;
    expect(lineMaterial(move).plies).toBe(4);
    expect(lineMaterial(move).best).toBeLessThan(lineMaterial(move).played);
    expect(move.classification).toBe('inaccuracy');
  });

  describe('at blunder size', () => {
    // Black to move; ...Kd7 leaves the knight on b8 to the rook.
    const FEN_B = '1n2k3/8/8/8/8/8/7P/1R2K3 b - - 0 1';
    const pair = fromFen(FEN_B, '1... Kd7 2. Ke2');
    const WHITE_BEST = ['b1b8', 'd7c6', 'b8b1', 'c6d5'];

    const run2 = (blackLines: LineSpec[]) =>
      plain(
        'gift',
        pair,
        evalsFrom(pair.fens, [
          blackLines,
          [{ score: { cp: 400 }, pv: WHITE_BEST }],
          [{ score: { cp: 0 }, pv: ['b8c6', 'h2h4', 'c6e5'] }],
        ]),
      ).moves;

    it('a blunder that only returns the opponent’s gift is a miss', () => {
      const [black, white] = run2([{ score: { cp: 0 }, pv: ['b8c6'] }]);
      expect(black!.classification).toBe('blunder');
      expect(white!.epLoss).toBeGreaterThanOrEqual(0.2);
      expect(lineMaterial(white!).best - lineMaterial(white!).played).toBe(3);
      expect(white!.classification).toBe('miss');
    });

    it('the same blunder without the prior error stays a blunder', () => {
      const [black, white] = run2([{ score: { cp: 400 }, pv: ['e8d7'] }]);
      expect(black!.classification).toBe('best');
      expect(white!.classification).toBe('blunder');
    });
  });
});

/* ── rule e: missed mate (criterion 7e) ───────────────────────────────── */

describe('rule e: missed mate', () => {
  const FEN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
  const run = (sans: string, after: Score) => {
    const game = fromFen(FEN, sans);
    return plain(
      'e',
      game,
      evalsFrom(game.fens, [
        [{ score: { mate: 2 }, pv: ['a1a8'] }],
        [{ score: after, pv: ['g8h8'] }],
      ]),
    ).moves[0]!;
  };

  it('keeping a longer mate is not a miss', () => {
    const move = run('1. Kf1', { mate: 4 });
    expect(move.classification).not.toBe('miss');
    expect(move.epLoss).toBe(0);
  });

  it('letting the mate go is a miss', () => {
    expect(run('1. Ra2', { cp: 500 }).classification).toBe('miss');
  });

  it('walking into mate is a blunder, not a miss', () => {
    expect(run('1. Ra2', { mate: -2 }).classification).toBe('blunder');
  });
});

/* ── rule h: terminal scores (criterion 7h) ───────────────────────────── */

describe('rule h: positionScore reads mate at the end', () => {
  it('scores a mated final position as ±1 mate, so the graph reads 100 or 0', () => {
    const game = parsePgn(SCHOLARS);
    const last = evalsFrom([game.fens.at(-1)!], [null])[0]!;
    expect(positionScore(last)).toEqual({ mate: 1 });
    expect(winPercent(positionScore(last))).toBe(100);

    const fools = parsePgn(FOOLS);
    const end = evalsFrom([fools.fens.at(-1)!], [null])[0]!;
    expect(winPercent(positionScore(end))).toBe(0);
  });

  it('otherwise reads the best line', () => {
    const e = evalsFrom(['4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'], [[{ score: { cp: 77 }, pv: ['e1d2'] }]])[0]!;
    expect(positionScore(e)).toEqual({ cp: 77 });
  });
});
