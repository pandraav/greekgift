import { describe, expect, it } from 'vitest';

import { clocksFor } from '../src/clock.ts';
import { parsePgn } from '../src/pgn.ts';
import {
  gameReport,
  moveTimes,
  thinkLabel,
  timeReport,
  troubleThreshold,
} from '../src/report.ts';
import { buildReview } from '../src/review.ts';
import type { Classification, MoveAnalysis, PositionEval, Review } from '../src/types.ts';
import { DAILY_ID, game, INCREMENT_ID, REFERENCE, resultsOf } from './games.ts';

/** Criterion 19: time report from clocks and classifications alone (§14.4). */

describe('troubleThreshold', () => {
  it('is 10% of base, capped at 30 s, and null for daily', () => {
    expect(troubleThreshold({ base: 60_000, increment: 0, daily: false })).toBe(6_000);
    expect(troubleThreshold({ base: 600_000, increment: 0, daily: false })).toBe(30_000);
    expect(troubleThreshold({ base: 180_000, increment: 1_000, daily: false })).toBe(18_000);
    expect(troubleThreshold({ base: 259_200_000, increment: 0, daily: true })).toBeNull();
  });
});

describe('timeReport on the reference game (184269442794, 600, lost on time)', () => {
  const t = timeReport(REFERENCE, 'w')!;

  it('has the control, the threshold and a series per side from the base', () => {
    expect(t.control).toEqual({ base: 600_000, increment: 0, daily: false });
    expect(t.threshold).toBe(30_000);
    expect(t.series.w[0]).toEqual({ ply: 0, left: 600_000 });
    expect(t.series.w).toHaveLength(30);
    expect(t.series.b).toHaveLength(30);
    expect(t.series.w.at(-1)).toEqual({ ply: 57, left: 48_100 });
    expect(t.series.b.at(-1)).toEqual({ ply: 58, left: 214_700 });
  });

  it('medians over non-book moves: White 15.6 s, Black 11.0 s', () => {
    expect(t.median).toEqual({ w: 15_600, b: 11_000 });
  });

  it('longest thinks: 22.Nxd4, 21.Rf4, 19.Qh3 for White', () => {
    expect(t.longest.w.map((x) => x.label)).toEqual(['22.Nxd4', '21.Rf4', '19.Qh3']);
    expect(t.longest.w.map((x) => x.spent)).toEqual([69_300, 58_500, 47_000]);
    expect(t.longest.b[0]).toMatchObject({ label: '12…fxe5', spent: 49_300 });
  });

  it('nobody moved in time trouble', () => {
    expect(t.trouble).toEqual({ w: [], b: [] });
    expect(t.findings.some((f) => f.kind === 'trouble_errors')).toBe(false);
  });

  it('White: fast error 15.Bb2, long-think errors 21.Rf4 and 22.Nxd4, then the flag', () => {
    const white = t.findings.filter((f) => f.side === 'w');
    expect(white.map((f) => f.kind)).toEqual(['fast_errors', 'long_think_errors', 'flagged']);
    expect(white[0]).toMatchObject({ plies: [29] });
    expect(white[1]).toMatchObject({ plies: [41, 43] });
    const errors = REFERENCE.moves.filter(
      (m) => m.color === 'w' && ['mistake', 'blunder', 'miss'].includes(m.classification),
    ).length;
    expect(white[0]).toMatchObject({ errors });
    expect(white[2]).toEqual({
      kind: 'flagged',
      side: 'w',
      atMove: 30,
      finalThink: 48_100,
      verdict: 'equal',
      evalAtEnd: REFERENCE.ending.evalAtEnd,
    });
  });

  it('Black: fast error 15…Bc5, long-think error 11…f6', () => {
    const black = t.findings.filter((f) => f.side === 'b');
    expect(black.map((f) => [f.kind, 'plies' in f ? f.plies : null])).toEqual([
      ['fast_errors', [30]],
      ['long_think_errors', [22]],
    ]);
  });

  it('puts the member’s side first', () => {
    expect(t.findings[0]!.side).toBe('w');
    expect(timeReport(REFERENCE, 'b')!.findings[0]!.side).toBe('b');
  });

  it('phases add up to every second spent', () => {
    for (const c of ['w', 'b'] as const) {
      const total = REFERENCE.moves.filter((m) => m.color === c).reduce((a, m) => a + m.clock!.spent, 0);
      expect(t.phases.reduce((a, p) => a + p.spent[c], 0)).toBe(total);
      expect(t.phases.reduce((a, p) => a + p.moves[c], 0)).toBe(29);
    }
  });

  it('gameReport carries the time report and the ending', () => {
    const report = gameReport(REFERENCE, 'w');
    expect(report.time).toEqual(t);
    expect(report.ending.kind).toBe('timeout');
  });
});

/** The reference game with some clocks and classes changed, for the rules it does not exercise. */
function variant(edit: (m: MoveAnalysis) => Partial<MoveAnalysis>): Review {
  return { ...REFERENCE, moves: REFERENCE.moves.map((m) => ({ ...m, ...edit(m) })) };
}

describe('the correlation rules', () => {
  it('time trouble is judged on the clock before the move', () => {
    // White's clock after 25.Qf4 set to 25 s: 26.Qf7+ is then played in trouble.
    const r = variant((m) =>
      m.color === 'w' && m.ply >= 49
        ? { clock: { spent: 1_000, left: Math.max(1_000, 25_000 - (m.ply - 49) * 1_000) } }
        : {},
    );
    const t = timeReport(r)!;
    expect(t.trouble.w[0]).toBe(51); // 26.Qf7+, the first move made with under 30 s
    expect(t.trouble.w).not.toContain(49);
  });

  it('trouble_errors counts only errors made in trouble, out of all the side’s errors', () => {
    const r = variant((m) => {
      if (m.color !== 'w' || m.ply < 49) return {};
      return {
        clock: { spent: 1_000, left: 20_000 - (m.ply - 49) * 1_000 },
        ...(m.ply === 51 ? { classification: 'blunder' as Classification } : {}),
      };
    });
    const t = timeReport(r)!;
    const trouble = t.findings.find((f) => f.kind === 'trouble_errors' && f.side === 'w');
    const errors = r.moves.filter(
      (m) => m.color === 'w' && ['mistake', 'blunder', 'miss'].includes(m.classification),
    ).length;
    expect(trouble).toEqual({ kind: 'trouble_errors', side: 'w', plies: [51, 57], errors, threshold: 30_000 });
  });

  it('fast needs both under 25% of the median and under 5 s', () => {
    const times = moveTimes(REFERENCE)!;
    // 15.Bb2: 3.8 s against a 15.6 s median (3.9 s line) — fast.
    expect(times.get(29)!.fast).toBe(true);
    // 24.Qxh4 in 0.1 s — fast, but a best move, so not a finding.
    expect(times.get(47)!.fast).toBe(true);
    // 9.Qe1: 6.4 s — over 5 s, not fast.
    expect(times.get(17)!.fast).toBe(false);
  });

  it('a long think is over 3x the median and at least 30 s', () => {
    const times = moveTimes(REFERENCE)!;
    expect(times.get(41)!.longThink).toBe(true); // 21.Rf4, 58.5 s
    expect(times.get(37)!.longThink).toBe(true); // 19.Qh3, 47 s, best
    expect(times.get(27)!.longThink).toBe(false); // 14.Rf2, 27.8 s: under 30 s
  });

  it('emits no finding with empty plies', () => {
    const clean = variant((m) => ({ classification: m.classification === 'book' ? 'book' : 'best' }));
    const t = timeReport(clean)!;
    expect(t.findings.map((f) => f.kind)).toEqual(['flagged']);
  });

  it('thinkLabel writes 24.Qc4 and 24…Kh8', () => {
    expect(thinkLabel({ ply: 47, color: 'w', san: 'Qc4' })).toBe('24.Qc4');
    expect(thinkLabel({ ply: 48, color: 'b', san: 'Kh8' })).toBe('24…Kh8');
  });
});

describe('other controls', () => {
  const flat = (fens: string[]): PositionEval[] => fens.map((fen) => ({ fen, nodes: 1, engineBuild: 't', lines: [] }));
  const build = (id: string) => {
    const g = game(id);
    const parsed = parsePgn(g.pgn);
    return buildReview({
      gameId: id,
      game: parsed,
      evals: flat(parsed.fens),
      whiteUsername: g.white.username,
      blackUsername: g.black.username,
      nodes: 1,
      engineBuild: 't',
      results: resultsOf(g),
    });
  };

  it('an increment game reports, with spent including the increment', () => {
    const review = build(INCREMENT_ID);
    const parsed = parsePgn(game(INCREMENT_ID).pgn);
    expect(review.moves.map((m) => m.clock)).toEqual(clocksFor(parsed.moves, parsed.timeControl));
    const t = timeReport(review)!;
    expect(t.threshold).toBe(18_000);
    expect(t.series.w[0]).toEqual({ ply: 0, left: 180_000 });
  });

  it('a daily game has clocks but no time report and no clock facts', () => {
    const review = build(DAILY_ID);
    expect(review.moves.every((m) => m.clock)).toBe(true);
    expect(timeReport(review)).toBeNull();
    expect(moveTimes(review)).toBeNull();
    expect(gameReport(review).time).toBeNull();
  });

  it('a game without clocks has no time report', () => {
    const parsed = parsePgn(`[White "a"]
[Black "b"]

1. e4 e5 *`);
    const review = buildReview({
      gameId: 'n',
      game: parsed,
      evals: flat(parsed.fens),
      whiteUsername: 'a',
      blackUsername: 'b',
      nodes: 1,
      engineBuild: 't',
    });
    expect(timeReport(review)).toBeNull();
  });
});
