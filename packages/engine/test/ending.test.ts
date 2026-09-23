import { describe, expect, it } from 'vitest';

import { endingFor, terminationOf, verdictOf } from '../src/ending.ts';
import { parsePgn } from '../src/pgn.ts';
import { buildReview } from '../src/review.ts';
import type { PositionEval, TerminationKind } from '../src/types.ts';
import { game, GAMES, REFERENCE, resultsOf } from './games.ts';

/** One real chess.com game per kind (fixtures/chesscom-games.json). */
const KINDS: [id: string, kind: TerminationKind, winner: 'w' | 'b' | null][] = [
  ['174325503836', 'checkmate', 'w'],
  ['184263578210', 'resignation', 'w'],
  ['184269442794', 'timeout', 'b'],
  ['173764953788', 'timeout_vs_insufficient', null],
  ['173901854476', 'abandoned', 'w'],
  ['180004932402', 'agreement', null],
  ['179914673355', 'repetition', null],
  ['172977236646', 'stalemate', null],
  ['179913471991', 'insufficient', null],
  ['172398084636', 'fifty_move', null],
];

/** Evals that say nothing: level everywhere, so only the headers and the board decide. */
const flatEvals = (fens: string[]): PositionEval[] =>
  fens.map((fen) => ({ fen, nodes: 1, engineBuild: 't', lines: [] }));

describe('terminationOf', () => {
  it.each(KINDS)('%s from the Termination header → %s', (id, kind, winner) => {
    const g = game(id);
    expect(terminationOf(parsePgn(g.pgn).headers)).toEqual({ kind, winner });
  });

  it.each(KINDS)('%s from the result codes → %s', (id, kind, winner) => {
    const g = game(id);
    expect(terminationOf({}, resultsOf(g))).toEqual({ kind, winner });
  });

  it('the result codes take precedence over the header', () => {
    const headers = parsePgn(game('184263578210').pgn).headers; // "… won by resignation"
    expect(terminationOf(headers, { white: 'win', black: 'timeout' })).toEqual({
      kind: 'timeout',
      winner: 'w',
    });
  });

  it('resolves the winner from the header name case-insensitively', () => {
    expect(
      terminationOf({ White: 'KAFKA_F0', Black: 'JakeLeupen', Termination: 'jakeleupen won on time', Result: '*' }),
    ).toEqual({ kind: 'timeout', winner: 'b' });
  });

  it('falls back to the Result when the name matches nobody', () => {
    expect(
      terminationOf({ White: 'a', Black: 'b', Termination: 'someone won by resignation', Result: '1-0' }),
    ).toEqual({ kind: 'resignation', winner: 'w' });
  });

  it('is unknown with neither codes nor a recognised header', () => {
    expect(terminationOf({ Result: '0-1' })).toEqual({ kind: 'unknown', winner: 'b' });
    expect(terminationOf({})).toEqual({ kind: 'unknown', winner: null });
  });
});

describe('verdictOf', () => {
  it.each([
    [{ cp: 300 }, 'winning'],
    [{ cp: 299 }, 'better'],
    [{ cp: 100 }, 'better'],
    [{ cp: 99 }, 'equal'],
    [{ cp: -99 }, 'equal'],
    [{ cp: -100 }, 'worse'],
    [{ cp: -299 }, 'worse'],
    [{ cp: -300 }, 'losing'],
    [{ mate: 3 }, 'winning'],
    [{ mate: -2 }, 'losing'],
  ] as const)('White at %j is %s', (score, verdict) => {
    expect(verdictOf(score, 'w')).toBe(verdict);
  });

  it('reads the same score from Black’s side', () => {
    expect(verdictOf({ cp: 250 }, 'b')).toBe('worse');
    expect(verdictOf({ mate: 3 }, 'b')).toBe('losing');
    expect(verdictOf({ cp: -2 }, 'b')).toBe('equal');
  });
});

describe('endingFor on real games', () => {
  it.each(KINDS)('%s: %s, onBoard as §14.3 says', (id, kind, winner) => {
    const g = game(id);
    const parsed = parsePgn(g.pgn);
    const review = buildReview({
      gameId: id,
      game: parsed,
      evals: flatEvals(parsed.fens),
      whiteUsername: g.white.username,
      blackUsername: g.black.username,
      nodes: 1,
      engineBuild: 't',
      results: resultsOf(g),
    });
    expect(review.ending.kind).toBe(kind);
    expect(review.ending.winner).toBe(winner);
    expect(review.ending.atPly).toBe(parsed.moves.length);
    expect(review.ending.onBoard).toBe(
      ['checkmate', 'stalemate', 'insufficient', 'fifty_move', 'repetition'].includes(kind),
    );
    expect(review.ending.clocks).toBeDefined();
  });

  it('the board overrides a stale header: a mated final position is checkmate', () => {
    const g = game('174325503836');
    const parsed = parsePgn(g.pgn.replace('won by checkmate', 'won by resignation'));
    const ending = endingFor(
      { ...REFERENCE, moves: [] },
      { headers: parsed.headers, fens: parsed.fens },
      { white: 'win', black: 'resigned' },
    );
    expect(ending.kind).toBe('checkmate');
    expect(ending.winner).toBe('w');
    expect(ending.onBoard).toBe(true);
  });

  it('every real fixture gets a kind other than unknown', () => {
    for (const g of GAMES) {
      const parsed = parsePgn(g.pgn);
      expect(terminationOf(parsed.headers, resultsOf(g)).kind, g.id).not.toBe('unknown');
    }
  });
});

describe('the reference game: lost on time in an equal position', () => {
  const { ending } = REFERENCE;

  it('is a timeout won by Black, off the board, at ply 58', () => {
    expect(ending).toMatchObject({ kind: 'timeout', winner: 'b', onBoard: false, atPly: 58 });
  });

  it('reads the eval at the flag from both sides: equal', () => {
    expect(ending.evalAtEnd).toEqual(REFERENCE.moves.at(-1)!.evalAfter.lines[0]!.score);
    expect(Math.abs(ending.evalAtEnd.cp!)).toBeLessThan(100);
    expect(ending.verdictAtEnd).toEqual({ w: 'equal', b: 'equal' });
  });

  it('White flagged: 0:00 on the clock, after a 48.1 s unfinished think', () => {
    expect(ending.clocks).toEqual({ w: 0, b: 214_700 });
    expect(ending.finalThink).toBe(48_100);
  });

  it('carries the time control and a clock on every move', () => {
    expect(REFERENCE.timeControl).toEqual({ base: 600_000, increment: 0, daily: false });
    expect(REFERENCE.moves.every((m) => m.clock)).toBe(true);
  });
});

describe('games without clocks', () => {
  it('degrade cleanly: no clocks, no time control, still an ending', () => {
    const parsed = parsePgn(`[White "a"]
[Black "b"]
[Result "0-1"]
[Termination "b won by resignation"]

1. e4 e5 2. Qh5 Nc6 0-1`);
    const review = buildReview({
      gameId: 'x',
      game: parsed,
      evals: flatEvals(parsed.fens),
      whiteUsername: 'a',
      blackUsername: 'b',
      nodes: 1,
      engineBuild: 't',
    });
    expect(review.timeControl).toBeUndefined();
    expect(review.moves.every((m) => m.clock === undefined)).toBe(true);
    expect(review.ending).toMatchObject({ kind: 'resignation', winner: 'b' });
    expect(review.ending.clocks).toBeUndefined();
  });
});
