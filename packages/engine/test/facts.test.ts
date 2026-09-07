import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { bestMoveEffect, factsFor, motifsFor } from '../src/facts.ts';
import type {
  Classification,
  EngineLine,
  Motif,
  MoveAnalysis,
  PlayerSummary,
  PositionEval,
  Review,
  Score,
} from '../src/types.ts';

/* ── builders ─────────────────────────────────────────────────────────── */

interface Line {
  score: Score;
  pv: string[];
}

function evalOf(fen: string, lines: Line[]): PositionEval {
  return {
    fen,
    nodes: 1000,
    engineBuild: 'test',
    lines: lines.map(
      (line, i): EngineLine => ({
        multipv: (i + 1) as 1 | 2 | 3,
        score: line.score,
        pv: line.pv,
        depth: 10,
        nodes: 1000,
      }),
    ),
  };
}

interface AnalysisOptions {
  fenBefore: string;
  uci: string;
  /** Engine lines for the position before the move, White-relative. */
  before: Line[];
  /** Engine lines for the position after the move, White-relative. */
  after: Line[];
  classification?: Classification;
  winBefore?: number;
  winAfter?: number;
  ply?: number;
  forced?: boolean;
}

/** A hand-built MoveAnalysis: the board is real, the eval is whatever we say. */
function analysis(options: AnalysisOptions): MoveAnalysis {
  const chess = new Chess(options.fenBefore);
  const color = chess.turn();
  const played = chess.move({
    from: options.uci.slice(0, 2),
    to: options.uci.slice(2, 4),
    ...(options.uci.length > 4 ? { promotion: options.uci[4] } : {}),
  });
  const fenAfter = chess.fen();
  const winBefore = options.winBefore ?? 50;
  const winAfter = options.winAfter ?? 50;
  const best = options.before[0];
  if (!best) throw new Error('an analysis needs at least one line before the move');

  return {
    ply: options.ply ?? 30,
    color,
    san: played.san,
    uci: options.uci,
    fenBefore: options.fenBefore,
    fenAfter,
    evalBefore: evalOf(options.fenBefore, options.before),
    evalAfter: evalOf(fenAfter, options.after),
    winBefore,
    winAfter,
    epLoss: Math.max(0, (winBefore - winAfter) / 100),
    moveAccuracy: 90,
    classification: options.classification ?? 'good',
    forced: options.forced ?? false,
    bestMove: best.pv[0] ?? options.uci,
    bestLine: best.pv,
  };
}

function summary(color: 'w' | 'b'): PlayerSummary {
  return {
    username: color === 'w' ? 'white' : 'black',
    color,
    accuracy: 90,
    acpl: 20,
    estimatedRating: 1500,
    estimatedRatingBand: 100,
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
  };
}

function reviewOf(moves: MoveAnalysis[]): Review {
  return {
    gameId: 'test',
    engineBuild: 'test',
    nodes: 1000,
    moves,
    keyMoments: [],
    white: summary('w'),
    black: summary('b'),
  };
}

const of = <T extends Motif['type']>(motifs: Motif[], type: T) =>
  motifs.filter((m): m is Extract<Motif, { type: T }> => m.type === type);

/* ── positions ────────────────────────────────────────────────────────── */

/** White knight on d5 can jump to c7, forking the king on e8 and the rook on a8. */
const KNIGHT_FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';

/** White to move; whatever White does, ...Nc2+ forks the king on e1 and the rook on a1. */
const WALKS_INTO_FORK = '4k3/8/8/8/1n6/8/7P/R3K3 w - - 0 1';

/** White rook on d1 can take the undefended knight on d5. */
const ROOK_TAKES_KNIGHT = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';

/** White rook on a1 can give check on a8. */
const ROOK_CHECK = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';

/** Back-rank mate in one: Ra8#. */
const BACK_RANK_MATE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

/** Black to move; the rook on a2 mates on a1. */
const BLACK_MATES = '4k3/8/8/8/8/8/r4PPP/6K1 b - - 0 1';

/** White knight on d4 can take the pawn on e6, which the pawn on f7 defends. */
const KNIGHT_TAKES_DEFENDED_PAWN = '4k3/5p2/4p3/8/3N4/8/8/4K3 w - - 0 1';

/** White knight on c3 can go to d5, where the pawn on e6 takes it for nothing. */
const KNIGHT_HANGS_ITSELF = '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1';

/** Black to move; a knight on e5 would be attacked by the pawn on d4 and the rook on e3. */
const KNIGHT_INTO_ATTACKERS = '4k3/8/2n5/8/3P4/4R3/8/4K3 b - - 0 1';

/* ── forks ────────────────────────────────────────────────────────────── */

describe('motifsFor: forks', () => {
  it('names the fork the mover just created, with byMover true', () => {
    const move = analysis({
      fenBefore: KNIGHT_FORK,
      uci: 'd5c7',
      before: [{ score: { cp: 500 }, pv: ['d5c7', 'e8d7', 'c7a8'] }],
      after: [{ score: { cp: 500 }, pv: ['e8d7', 'c7a8'] }],
      classification: 'best',
    });

    const forks = of(motifsFor(move), 'fork');
    expect(forks).toHaveLength(1);
    expect(forks[0]).toMatchObject({
      byMover: true,
      by: { piece: 'N', square: 'c7', color: 'w' },
    });
    expect(forks[0]!.targets.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
  });

  it('names the fork the reply lands, with byMover false', () => {
    const move = analysis({
      fenBefore: WALKS_INTO_FORK,
      uci: 'h2h3',
      before: [{ score: { cp: 0 }, pv: ['e1d1'] }],
      after: [{ score: { cp: -500 }, pv: ['b4c2', 'e1d2', 'c2a1'] }],
      classification: 'blunder',
      winBefore: 50,
      winAfter: 15,
    });

    const forks = of(motifsFor(move), 'fork');
    expect(forks).toHaveLength(1);
    expect(forks[0]).toMatchObject({
      byMover: false,
      by: { piece: 'N', square: 'c2', color: 'b' },
    });
    expect(forks[0]!.targets.map((t) => t.square).sort()).toEqual(['a1', 'e1']);
  });
});

/* ── hanging pieces ───────────────────────────────────────────────────── */

describe('motifsFor: hanging pieces', () => {
  it('names the attackers cheapest first', () => {
    const move = analysis({
      fenBefore: KNIGHT_INTO_ATTACKERS,
      uci: 'c6e5',
      before: [{ score: { cp: 0 }, pv: ['e8d7'] }],
      after: [{ score: { cp: 300 }, pv: ['d4e5'] }],
      classification: 'blunder',
      winBefore: 50,
      winAfter: 20,
    });

    const hanging = of(motifsFor(move), 'hanging_piece');
    expect(hanging).toHaveLength(1);
    expect(hanging[0]!.target).toEqual({ piece: 'N', square: 'e5', color: 'b' });
    expect(hanging[0]!.attackers).toEqual([
      { piece: 'P', square: 'd4', color: 'w' },
      { piece: 'R', square: 'e3', color: 'w' },
    ]);
    expect(hanging[0]!.defenders).toEqual([]);
  });
});

/* ── sacrifices ───────────────────────────────────────────────────────── */

describe('motifsFor: sacrifices', () => {
  const capture = (winBefore: number, winAfter: number) =>
    analysis({
      fenBefore: KNIGHT_TAKES_DEFENDED_PAWN,
      uci: 'd4e6',
      before: [{ score: { cp: 100 }, pv: ['d4e6', 'f7e6'] }],
      after: [{ score: { cp: 100 }, pv: ['f7e6'] }],
      classification: 'best',
      winBefore,
      winAfter,
    });

  it('is sound when the win% holds within two points', () => {
    const sacrifices = of(motifsFor(capture(55, 54)), 'sacrifice');
    expect(sacrifices).toHaveLength(1);
    expect(sacrifices[0]).toEqual({
      type: 'sacrifice',
      piece: { piece: 'N', square: 'e6', color: 'w' },
      netMaterial: -2,
      sound: true,
    });
  });

  it('is exactly sound at a two-point drop', () => {
    expect(of(motifsFor(capture(55, 53)), 'sacrifice')[0]?.sound).toBe(true);
  });

  it('is unsound when the win% drops by more than two points', () => {
    const sacrifices = of(motifsFor(capture(55, 30)), 'sacrifice');
    expect(sacrifices).toHaveLength(1);
    expect(sacrifices[0]).toMatchObject({ netMaterial: -2, sound: false });
  });

  it('calls a quiet move that the engine likes a sacrifice when the piece is taken', () => {
    const move = analysis({
      fenBefore: KNIGHT_HANGS_ITSELF,
      uci: 'c3d5',
      before: [{ score: { cp: 200 }, pv: ['c3d5', 'e6d5'] }],
      after: [{ score: { cp: 200 }, pv: ['e6d5'] }],
      classification: 'best',
      winBefore: 60,
      winAfter: 59,
    });

    expect(of(motifsFor(move), 'sacrifice')[0]).toEqual({
      type: 'sacrifice',
      piece: { piece: 'N', square: 'd5', color: 'w' },
      netMaterial: -3,
      sound: true,
    });
  });

  it('does not dress a quietly hung piece up as a sacrifice', () => {
    const move = analysis({
      fenBefore: KNIGHT_HANGS_ITSELF,
      uci: 'c3d5',
      before: [{ score: { cp: 200 }, pv: ['e1e2'] }],
      after: [{ score: { cp: -100 }, pv: ['e6d5'] }],
      classification: 'blunder',
      winBefore: 60,
      winAfter: 25,
    });

    const motifs = motifsFor(move);
    expect(of(motifs, 'sacrifice')).toEqual([]);
    expect(of(motifs, 'hanging_piece')[0]?.target).toEqual({ piece: 'N', square: 'd5', color: 'w' });
  });

  it('is not a sacrifice when the engine says the piece is never taken', () => {
    const move = analysis({
      fenBefore: KNIGHT_HANGS_ITSELF,
      uci: 'c3d5',
      before: [{ score: { cp: 200 }, pv: ['c3d5', 'e8d7'] }],
      after: [{ score: { cp: 200 }, pv: ['e8d7'] }],
      classification: 'best',
      winBefore: 60,
      winAfter: 60,
    });

    expect(of(motifsFor(move), 'sacrifice')).toEqual([]);
  });
});

/* ── only move ────────────────────────────────────────────────────────── */

describe('motifsFor: only move', () => {
  it('measures the margin in expected points, not centipawns', () => {
    const move = analysis({
      fenBefore: KNIGHT_FORK,
      uci: 'd5c7',
      before: [
        { score: { cp: 500 }, pv: ['d5c7', 'e8d7', 'c7a8'] },
        { score: { cp: 0 }, pv: ['e1e2'] },
      ],
      after: [{ score: { cp: 500 }, pv: ['e8d7', 'c7a8'] }],
      classification: 'best',
    });

    const only = of(motifsFor(move), 'only_move');
    expect(only).toHaveLength(1);
    // +500 cp is about 86% to win, level is 50%: a margin of about 0.36 points.
    expect(only[0]!.margin).toBeGreaterThan(0.3);
    expect(only[0]!.margin).toBeLessThan(0.4);
  });

  it('reads the margin from the mover’s side when Black moves', () => {
    const move = analysis({
      fenBefore: BLACK_MATES,
      uci: 'a2a1',
      before: [
        { score: { mate: -1 }, pv: ['a2a1'] },
        { score: { cp: 0 }, pv: ['e8d8'] },
      ],
      after: [{ score: { mate: 0 }, pv: [] }],
      classification: 'best',
    });

    const only = of(motifsFor(move), 'only_move');
    expect(only).toHaveLength(1);
    expect(only[0]!.margin).toBeCloseTo(0.5, 5);
  });

  it('says nothing when the second line is nearly as good', () => {
    const move = analysis({
      fenBefore: KNIGHT_FORK,
      uci: 'd5c7',
      before: [
        { score: { cp: 500 }, pv: ['d5c7', 'e8d7', 'c7a8'] },
        { score: { cp: 450 }, pv: ['e1e2'] },
      ],
      after: [{ score: { cp: 500 }, pv: ['e8d7', 'c7a8'] }],
      classification: 'best',
    });

    expect(of(motifsFor(move), 'only_move')).toEqual([]);
  });
});

/* ── mates ────────────────────────────────────────────────────────────── */

describe('motifsFor: mates', () => {
  it('puts a missed mate before everything else', () => {
    const move = analysis({
      fenBefore: BACK_RANK_MATE,
      uci: 'g1h1',
      before: [{ score: { mate: 1 }, pv: ['a1a8'] }],
      after: [{ score: { mate: 2 }, pv: ['g8h8', 'a1a8'] }],
      classification: 'miss',
      winBefore: 100,
      winAfter: 100,
    });

    const motifs = motifsFor(move);
    expect(motifs[0]).toEqual({ type: 'missed_mate', line: ['Ra8#'] });
  });

  it('puts a mate threat against the mover at the front', () => {
    const move = analysis({
      fenBefore: WALKS_INTO_FORK,
      uci: 'h2h3',
      before: [{ score: { cp: 0 }, pv: ['e1d1'] }],
      after: [{ score: { mate: -3 }, pv: ['b4c2', 'e1d2', 'c2a1'] }],
      classification: 'blunder',
      winBefore: 50,
      winAfter: 0,
    });

    const motifs = motifsFor(move);
    expect(motifs[0]).toMatchObject({ type: 'mate_threat', line: ['Nc2+', 'Kd2', 'Nxa1'] });
    expect(of(motifs, 'fork')[0]?.byMover).toBe(false);
  });
});

/* ── bestMoveEffect ───────────────────────────────────────────────────── */

describe('bestMoveEffect', () => {
  it('names what the best move captures', () => {
    const move = analysis({
      fenBefore: ROOK_TAKES_KNIGHT,
      uci: 'e1e2',
      before: [{ score: { cp: 500 }, pv: ['d1d5', 'e8e7'] }],
      after: [{ score: { cp: 0 }, pv: ['d5f4'] }],
      classification: 'blunder',
    });

    const effect = bestMoveEffect(move, 3, 0);
    expect(effect).toEqual({
      captures: { piece: 'N', square: 'd5', color: 'b' },
      check: false,
      materialGain: 3,
      line: ['Rxd5', 'Ke7'],
    });
  });

  it('has no capture when the best move is quiet', () => {
    const move = analysis({
      fenBefore: ROOK_TAKES_KNIGHT,
      uci: 'e1e2',
      before: [{ score: { cp: 0 }, pv: ['e1f1'] }],
      after: [{ score: { cp: 0 }, pv: ['e8e7'] }],
    });

    expect(bestMoveEffect(move, 0, 0).captures).toBeUndefined();
  });

  it('says when the best move is a check', () => {
    const move = analysis({
      fenBefore: ROOK_CHECK,
      uci: 'e1e2',
      before: [{ score: { cp: 50 }, pv: ['a1a8', 'e8e7'] }],
      after: [{ score: { cp: 0 }, pv: ['e8e7'] }],
    });

    const effect = bestMoveEffect(move, 0, 0);
    expect(effect.check).toBe(true);
    expect(effect.captures).toBeUndefined();
    expect(effect.forks).toBeUndefined();
    expect(effect.mateIn).toBeUndefined();
    expect(effect.line).toEqual(['Ra8+', 'Ke7']);
  });

  it('names the pieces the best move forks', () => {
    const move = analysis({
      fenBefore: KNIGHT_FORK,
      uci: 'e1e2',
      before: [{ score: { cp: 500 }, pv: ['d5c7', 'e8d7', 'c7a8'] }],
      after: [{ score: { cp: 0 }, pv: ['e8d7'] }],
      classification: 'mistake',
    });

    const effect = bestMoveEffect(move, 5, 0);
    expect(effect.check).toBe(true);
    expect(effect.forks?.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
    expect(effect.forks?.every((t) => t.color === 'b')).toBe(true);
    expect(effect.materialGain).toBe(5);
    expect(effect.line).toEqual(['Nc7+', 'Kd7', 'Nxa8']);
  });

  it('counts the mate in when the mate is the mover’s', () => {
    const move = analysis({
      fenBefore: BACK_RANK_MATE,
      uci: 'g1h1',
      before: [{ score: { mate: 1 }, pv: ['a1a8'] }],
      after: [{ score: { mate: 2 }, pv: ['g8h8', 'a1a8'] }],
      classification: 'miss',
    });

    const effect = bestMoveEffect(move, 0, 0);
    expect(effect.mateIn).toBe(1);
    expect(effect.check).toBe(true);
    expect(effect.line).toEqual(['Ra8#']);
  });

  it('counts the mate in from Black’s side too', () => {
    const move = analysis({
      fenBefore: BLACK_MATES,
      uci: 'e8d8',
      before: [{ score: { mate: -1 }, pv: ['a2a1'] }],
      after: [{ score: { mate: -1 }, pv: ['g1h1', 'a2a1'] }],
      classification: 'miss',
    });

    expect(bestMoveEffect(move, 0, 0).mateIn).toBe(1);
  });

  it('leaves mateIn unset when the mate belongs to the opponent', () => {
    const move = analysis({
      fenBefore: ROOK_TAKES_KNIGHT,
      uci: 'e1e2',
      before: [{ score: { mate: -3 }, pv: ['d1d5'] }],
      after: [{ score: { mate: -2 }, pv: ['e8e7'] }],
    });

    expect(bestMoveEffect(move, 0, 0).mateIn).toBeUndefined();
  });
});

/* ── factsFor ─────────────────────────────────────────────────────────── */

describe('factsFor', () => {
  const move = analysis({
    fenBefore: KNIGHT_FORK,
    uci: 'd5c7',
    before: [
      { score: { cp: 500 }, pv: ['d5c7', 'e8d7', 'c7a8'] },
      { score: { cp: 0 }, pv: ['e1e2'] },
    ],
    after: [{ score: { cp: 500 }, pv: ['e8d7', 'c7a8'] }],
    classification: 'best',
    winBefore: 86,
    winAfter: 86,
    ply: 41,
    forced: true,
  });

  it('carries the new fields through from the analysis', () => {
    const facts = factsFor(reviewOf([move]), 41, { rating: 2000 });

    expect(facts.ply).toBe(41);
    expect(facts.color).toBe('w');
    expect(facts.forced).toBe(true);
    expect(facts.moveAccuracy).toBe(90);
    expect(facts.classification).toBe('best');
    expect(Array.isArray(facts.situations)).toBe(true);
    expect(facts.audience).toBe('advanced');
    expect(facts.san).toBe('Nc7+');
    expect(facts.bestMove).toBe('Nc7+');
    expect(facts.bestLine).toEqual(['Nc7+', 'Kd7', 'Nxa8']);
    expect(facts.playedLine).toEqual(['Kd7', 'Nxa8']);
    expect(facts.phase).toBe('endgame');
    expect(facts.leftBook).toBe(false);
    expect(facts).not.toHaveProperty('threatOfBestMove');
  });

  it('measures material after both lines from the mover’s side', () => {
    const facts = factsFor(reviewOf([move]), 41);

    // Both lines end with the knight having taken the rook: White is +3.
    expect(facts.materialAfterBestLine).toBe(3);
    expect(facts.materialAfterPlayedLine).toBe(3);
    expect(facts.bestMoveEffect).toMatchObject({
      check: true,
      materialGain: 0,
      line: ['Nc7+', 'Kd7', 'Nxa8'],
    });
    expect(facts.bestMoveEffect.forks?.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
  });

  it('lists the mover’s fork and the only move among the motifs', () => {
    const facts = factsFor(reviewOf([move]), 41);
    const types = facts.motifs.map((m) => m.type);
    expect(types).toContain('fork');
    expect(types).toContain('only_move');
    expect(of(facts.motifs, 'fork')[0]?.byMover).toBe(true);
  });

  it('refuses a ply it has not seen', () => {
    expect(() => factsFor(reviewOf([move]), 7)).toThrow(/ply 7/);
  });
});
