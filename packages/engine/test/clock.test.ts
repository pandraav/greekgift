import { describe, expect, it } from 'vitest';

import { clocksFor, formatClock, formatMinutes, parseClocks, parseTimeControl } from '../src/clock.ts';
import { parsePgn } from '../src/pgn.ts';
import { DAILY_ID, game, GAMES, INCREMENT_ID, REFERENCE_ID } from './games.ts';

describe('parseTimeControl', () => {
  it('reads live, increment and daily controls', () => {
    expect(parseTimeControl('600')).toEqual({ base: 600_000, increment: 0, daily: false });
    expect(parseTimeControl('180+2')).toEqual({ base: 180_000, increment: 2_000, daily: false });
    expect(parseTimeControl('1/86400')).toEqual({ base: 86_400_000, increment: 0, daily: true });
  });

  it('has nothing to say about "-", empty or nonsense', () => {
    expect(parseTimeControl('-')).toBeUndefined();
    expect(parseTimeControl('')).toBeUndefined();
    expect(parseTimeControl(undefined)).toBeUndefined();
    expect(parseTimeControl('ten minutes')).toBeUndefined();
  });
});

describe('parseClocks', () => {
  it('reads one clock per ply from the reference game', () => {
    const clocks = parseClocks(game(REFERENCE_ID).pgn);
    expect(clocks).toHaveLength(58);
    expect(clocks[56]).toBe(48_100); // 29.Rf3, 0:00:48.1
    expect(clocks[57]).toBe(214_700); // 29…Ne5, 0:03:34.7
    expect(clocks.every((c) => c !== null)).toBe(true);
  });

  it('reads every real fixture with one clock per move', () => {
    for (const g of GAMES) {
      const parsed = parsePgn(g.pgn);
      expect(parsed.moves.every((m) => m.clock !== undefined), g.id).toBe(true);
    }
  });

  it('gives null for a ply whose comment has no %clk, and skips variations and NAGs', () => {
    const pgn = `[White "a"]
[Black "b"]

1. e4 {[%clk 0:09:59]} 1... e5 {a plain comment} 2. Nf3 $1 {[%clk 0:09:58.5]} (2. Bc4 {[%clk 0:00:01]} Nc6) 2... Nc6 {[%clk 0:09:57]} *`;
    expect(parseClocks(pgn)).toEqual([599_000, null, 598_500, 597_000]);
  });

  it('keeps clocks apart in a repeated position (chess.js keys comments by FEN)', () => {
    const pgn = `[White "a"]
[Black "b"]

1. Nf3 {[%clk 0:01:00]} 1... Nf6 {[%clk 0:00:59]} 2. Ng1 {[%clk 0:00:58]} 2... Ng8 {[%clk 0:00:57]} 3. Nf3 {[%clk 0:00:56]} 3... Nf6 {[%clk 0:00:55]} *`;
    expect(parseClocks(pgn)).toEqual([60_000, 59_000, 58_000, 57_000, 56_000, 55_000]);
    expect(parsePgn(pgn).moves.map((m) => m.clock)).toEqual([60_000, 59_000, 58_000, 57_000, 56_000, 55_000]);
  });
});

describe('clocksFor', () => {
  it('reference game (600): spent is the drop in the mover’s own clock', () => {
    const parsed = parsePgn(game(REFERENCE_ID).pgn);
    const clocks = clocksFor(parsed.moves, parsed.timeControl)!;
    expect(clocks[0]).toEqual({ left: 596_600, spent: 3_400 }); // 1.e4
    expect(clocks[1]).toEqual({ left: 598_400, spent: 1_600 }); // 1…c5
    expect(clocks[42]).toEqual({ left: 230_300, spent: 69_300 }); // 22.Nxd4
    expect(clocks[56]).toEqual({ left: 48_100, spent: 40_700 }); // 29.Rf3
  });

  it('adds the increment back (180+1)', () => {
    const parsed = parsePgn(game(INCREMENT_ID).pgn);
    expect(parsed.timeControl).toEqual({ base: 180_000, increment: 1_000, daily: false });
    const clocks = clocksFor(parsed.moves, parsed.timeControl)!;
    const raw = parsed.moves.map((m) => m.clock!);
    // spent = previous own clock − clock + increment, the first from the base.
    expect(clocks[0]!.spent).toBe(Math.max(0, 180_000 - raw[0]! + 1_000));
    expect(clocks[2]!.spent).toBe(Math.max(0, raw[0]! - raw[2]! + 1_000));
    expect(clocks[3]!.spent).toBe(Math.max(0, raw[1]! - raw[3]! + 1_000));
    expect(clocks.every((c) => c.spent >= 0)).toBe(true);
  });

  it('daily: %clk is the time taken, and left is the allowance minus it', () => {
    const parsed = parsePgn(game(DAILY_ID).pgn);
    expect(parsed.timeControl).toEqual({ base: 259_200_000, increment: 0, daily: true });
    const clocks = clocksFor(parsed.moves, parsed.timeControl)!;
    // 1. d4 {[%clk 1:45:53.8]}: 1 h 45 min taken of a 3-day allowance.
    expect(clocks[0]).toEqual({ spent: 6_353_800, left: 259_200_000 - 6_353_800 });
    // 11…Nc6 {[%clk 0:00:00.7]}
    expect(clocks[21]!.spent).toBe(700);
  });

  it('is all or nothing: one missing clock, an unknown control, or no moves → null', () => {
    const parsed = parsePgn(game(REFERENCE_ID).pgn);
    const holed = parsed.moves.map((m, i) => (i === 10 ? { ...m, clock: undefined } : m));
    expect(clocksFor(holed, parsed.timeControl)).toBeNull();
    expect(clocksFor(parsed.moves, undefined)).toBeNull();
    expect(clocksFor([], parsed.timeControl)).toBeNull();
  });

  it('clamps a clock that went up (lag compensation) to zero spent', () => {
    const tc = { base: 60_000, increment: 0, daily: false };
    expect(clocksFor([{ color: 'w', clock: 60_400 }], tc)).toEqual([{ left: 60_400, spent: 0 }]);
  });
});

describe('formatClock', () => {
  it.each([
    [0, 'no time'],
    [999, 'no time'],
    [1_000, '1 second'],
    [48_100, '48 seconds'],
    [59_999, '59 seconds'],
    [60_000, '1:00'],
    [69_300, '1:09'],
    [470_000, '7:50'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });

  it('offers the minutes form only from two minutes', () => {
    expect(formatMinutes(119_999)).toBeNull();
    expect(formatMinutes(470_000)).toBe('7 minutes');
  });
});
