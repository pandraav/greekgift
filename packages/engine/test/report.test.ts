import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { boardsOf, divide, gameReport, phaseAccuraciesFor, phaseOfPly } from '../src/report.ts';
import type { EngineLine, MoveAnalysis, PositionEval, Review } from '../src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fensOf = (sans: string[]): string[] => {
  const board = new Chess();
  const out = [board.fen()];
  for (const san of sans) {
    board.move(san);
    out.push(board.fen());
  }
  return out;
};

const ITALIAN = 'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 O-O Nc3 d6'.split(' ');
/** White: rook, rook, king left on the first rank after 9. Qd2 — a sparse back rank. */
const SPARSE = [...ITALIAN, 'Bg5', 'h6', 'Bh4', 'g5', 'Qd2'];
/** Queenless: two rooks and a knight against a rook and a knight. */
const ENDING = '2r3k1/pp3ppp/2n5/8/8/2N5/PP3PPP/3RR1K1 w - - 0 25';

describe('divide (scalachess Divider)', () => {
  it('the start position alone has no middlegame and no endgame', () => {
    expect(divide([new Chess().fen()])).toEqual({ middle: null, end: null, plies: 1 });
  });

  it('a developed Italian with a full back rank is still the opening', () => {
    expect(divide(fensOf(ITALIAN))).toEqual({ middle: null, end: null, plies: 13 });
  });

  it('the middlegame starts when a back rank thins below four pieces', () => {
    const d = divide(fensOf(SPARSE));
    expect(d.middle).toBe(17);
    expect(d.end).toBeNull();
    expect(phaseOfPly(16, d)).toBe('opening');
    expect(phaseOfPly(17, d)).toBe('middlegame');
  });

  it('a queenless rook-and-minor ending is the endgame', () => {
    const d = divide([...fensOf(SPARSE), ENDING]);
    expect(d).toEqual({ middle: 17, end: 18, plies: 19 });
    expect(phaseOfPly(18, d)).toBe('endgame');
  });

  it('with no middlegame before it, the ending does not start an endgame phase', () => {
    // Middle and end on the same board: the middle is dropped (not before the end).
    const d = divide([new Chess().fen(), ENDING]);
    expect(d).toEqual({ middle: null, end: 1, plies: 2 });
    expect(phaseOfPly(1, d)).toBe('opening');
  });
});

/* ── phase accuracy ──────────────────────────────────────────────────── */

const line = (cp: number): EngineLine => ({ multipv: 1, score: { cp }, pv: [], depth: 20, nodes: 1 });
const evalOf = (cp: number, fen = `fen${cp}`): PositionEval => ({
  fen,
  nodes: 1,
  engineBuild: 'test',
  lines: [line(cp)],
});

/** Moves whose positions after each ply score `cps`, starting from `initial`. */
function movesFrom(initial: number, cps: number[]): MoveAnalysis[] {
  return cps.map((cp, i) => ({
    ply: i + 1,
    color: i % 2 === 0 ? 'w' : 'b',
    san: 'x',
    uci: 'a1a1',
    fenBefore: '',
    fenAfter: '',
    evalBefore: evalOf(i === 0 ? initial : cps[i - 1]!),
    evalAfter: evalOf(cp),
    winBefore: 50,
    winAfter: 50,
    epLoss: 0,
    moveAccuracy: 100,
    classification: 'best',
    forced: false,
    bestMove: '',
    bestLine: [],
  }));
}

describe('phaseAccuraciesFor (lichess AccuracyPercent.phaseAccuracies)', () => {
  it('phase accuracy uses the previous phase eval (lichess test case)', () => {
    // Infos [15, 900, 0, 0], middle at ply 3: White's middlegame starts from
    // +9.00 and throws it away, so it is poor — not 100 from a fresh start.
    const phases = phaseAccuraciesFor(movesFrom(15, [15, 900, 0, 0]), { middle: 3, end: null, plies: 5 });
    const middle = phases.find((p) => p.phase === 'middlegame')!;
    expect(middle).toMatchObject({ firstPly: 3, lastPly: 4 });
    expect(middle.white!).toBeLessThan(20);
  });

  it('with no middlegame, one opening row covers the game', () => {
    const phases = phaseAccuraciesFor(movesFrom(15, [15, 15, 15, 15]), { middle: null, end: null, plies: 5 });
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ phase: 'opening', firstPly: 1, lastPly: 4 });
    expect(phases[0]!.white!).toBeCloseTo(100, 0);
  });

  it('omits phases with no plies', () => {
    const phases = phaseAccuraciesFor(movesFrom(15, [15, 15, 15, 15]), { middle: 2, end: null, plies: 5 });
    expect(phases.map((p) => p.phase)).toEqual(['opening', 'middlegame']);
  });

  it('a one-ply phase has no accuracy for either side (lichess: single move is None)', () => {
    const phases = phaseAccuraciesFor(movesFrom(15, [15, 15, 15, 15]), { middle: 1, end: 4, plies: 5 });
    const end = phases.find((p) => p.phase === 'endgame')!;
    expect(end).toMatchObject({ firstPly: 4, lastPly: 4, white: null, black: null });
  });
});

/* ── the report, on a committed fixture ──────────────────────────────── */

const fixture = (name: string): Review =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures/reviews', `${name}.json`), 'utf-8')) as Review;

describe('gameReport', () => {
  const review = fixture('opera-game');
  const report = gameReport(review);

  it('carries both players', () => {
    expect(report.white).toBe(review.white);
    expect(report.black).toBe(review.black);
  });

  it('orders the key moments by ply, left_book included', () => {
    expect(report.moments.map((m) => m.ply)).toEqual([...review.keyMoments.map((m) => m.ply)].sort((a, b) => a - b));
    expect(report.moments.length).toBe(review.keyMoments.length);
  });

  it('phases are contiguous, in order, and cover every ply', () => {
    const d = divide(boardsOf(review.moves));
    expect(report.phases.map((p) => p.phase)).toEqual(
      ['opening', 'middlegame', 'endgame'].filter((ph) => review.moves.some((m) => phaseOfPly(m.ply, d) === ph)),
    );
    expect(report.phases[0]!.firstPly).toBe(1);
    expect(report.phases.at(-1)!.lastPly).toBe(review.moves.length);
    for (let i = 1; i < report.phases.length; i++) {
      expect(report.phases[i]!.firstPly).toBe(report.phases[i - 1]!.lastPly + 1);
    }
  });

  it('names how far book went as a move', () => {
    const last = review.opening!.lastBookPly;
    const move = review.moves[last - 1]!;
    expect(report.opening).toMatchObject({ eco: review.opening!.eco, name: review.opening!.name, lastBookPly: last });
    expect(report.opening!.lastBookMove).toBe(
      `${Math.floor((move.ply - 1) / 2) + 1}${move.color === 'w' ? '.' : '…'} ${move.san}`,
    );
  });

  it('no book, no book move; no opening, null', () => {
    const noBook = gameReport({ ...review, opening: { eco: 'A00', name: 'Start', lastBookPly: 0 } });
    expect(noBook.opening!.lastBookMove).toBeNull();
    const none = gameReport({ ...review, opening: undefined });
    expect(none.opening).toBeNull();
  });
});
