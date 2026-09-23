import type { MoveClock, TimeControl } from './types.ts';

/**
 * Clocks and time controls, from chess.com's PGN (review-overhaul §14.2).
 *
 * chess.com writes `{[%clk 0:09:56.6]}` after every move: the mover's clock
 * *after* the move. chess.js drops comments it cannot key by position, and
 * keys the ones it keeps by FEN, which merges repeated positions — so the
 * clocks are read here, from the raw movetext, before chess.js sees it.
 * All times are milliseconds.
 */

/** `"600"`, `"180+2"`, `"1/86400"` → a TimeControl; `"-"`, empty or unreadable → undefined. */
export function parseTimeControl(tc: string | undefined): TimeControl | undefined {
  const raw = tc?.trim();
  if (!raw || raw === '-') return undefined;

  const daily = /^1\/(\d+)$/.exec(raw);
  if (daily) return { base: Number(daily[1]) * 1000, increment: 0, daily: true };

  const live = /^(\d+)(?:\+(\d+(?:\.\d+)?))?$/.exec(raw);
  if (live) {
    return {
      base: Number(live[1]) * 1000,
      increment: Math.round(Number(live[2] ?? 0) * 1000),
      daily: false,
    };
  }
  return undefined;
}

const CLK = /%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)/;

/** `H:MM:SS(.d)` inside a comment → ms, or null. */
function clockIn(comment: string): number | null {
  const m = CLK.exec(comment);
  if (!m) return null;
  return Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000 + Math.round(Number(m[3]) * 1000);
}

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

/**
 * One entry per ply of the main line: the ms left after it, or null for a
 * ply with no `%clk`. A `{ … }` (or `;` to end of line) comment belongs to
 * the ply before it; `( … )` variations and `$n` NAGs are skipped; move
 * numbers (`12.`, `12...`) and the result are not moves.
 */
export function parseClocks(pgn: string): (number | null)[] {
  // The movetext is what follows the header block.
  const lines = pgn.replace(/\r\n?/g, '\n').split('\n');
  let start = 0;
  while (start < lines.length && /^\s*(\[.*\])?\s*$/.test(lines[start]!)) start++;
  const text = lines.slice(start).join('\n');

  const clocks: (number | null)[] = [];
  let depth = 0; // variation nesting
  let i = 0;
  let token = '';

  const flush = () => {
    let t = token;
    token = '';
    if (!t || depth > 0) return;
    t = t.replace(/^\d+\.+/, ''); // "12." / "12..." / "12.e4"
    if (!t || RESULT.test(t) || /^\$\d+$/.test(t) || /^[!?]+$/.test(t)) return;
    clocks.push(null);
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '{' || ch === ';') {
      flush();
      const end = ch === '{' ? text.indexOf('}', i + 1) : text.indexOf('\n', i + 1);
      const stop = end === -1 ? text.length : end;
      const comment = text.slice(i + 1, stop);
      if (depth === 0 && clocks.length > 0) {
        const ms = clockIn(comment);
        if (ms !== null) clocks[clocks.length - 1] = ms;
      }
      i = stop + 1;
      continue;
    }
    if (ch === '(') {
      flush();
      depth++;
    } else if (ch === ')') {
      flush();
      depth = Math.max(0, depth - 1);
    } else if (/\s/.test(ch)) {
      flush();
    } else {
      token += ch;
    }
    i++;
  }
  flush();
  return clocks;
}

/**
 * Clock after and time spent on each move, or null when the game has no
 * usable clocks: an unknown control, or any move without a clock. All or
 * nothing, so a half-clocked game reads as "no clocks", never wrong numbers.
 *
 * Live: `spent = max(0, previous left − left + increment)`, the previous
 * left starting at the base. The clamp absorbs chess.com's lag
 * compensation, which can make a clock go up.
 *
 * Daily: chess.com's `%clk` in a daily game is the time *taken* for the
 * move, not the time left. Checked on 29 real daily games (1, 2, 3 and 7
 * day controls): no value comes near the allowance (the largest is 14.4 h
 * against 7 days, most are under 3 h, many are 0 — conditional moves). So
 * `spent = %clk` and `left = max(0, base − spent)`. (Spec §14.2 assumed the
 * opposite, unverified; this is the reading the data supports.)
 */
export function clocksFor(
  moves: { color: 'w' | 'b'; clock?: number }[],
  tc: TimeControl | undefined,
): MoveClock[] | null {
  if (!tc || moves.length === 0) return null;
  if (moves.some((m) => m.clock === undefined)) return null;

  if (tc.daily) {
    return moves.map((m) => ({ spent: m.clock!, left: Math.max(0, tc.base - m.clock!) }));
  }

  const prev = { w: tc.base, b: tc.base };
  return moves.map((m) => {
    const left = m.clock!;
    const spent = Math.max(0, prev[m.color] - left + tc.increment);
    prev[m.color] = left;
    return { left, spent };
  });
}

/**
 * A duration as the coach says it (§14.5): under a minute "N seconds"
 * (floored; "1 second"; zero is "no time"), from a minute `m:ss`.
 */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (seconds < 60) {
    if (seconds === 0) return 'no time';
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The minutes form the coach may use for a clock of two minutes or more: "7 minutes". */
export function formatMinutes(ms: number): string | null {
  if (ms < 120_000) return null;
  return `${Math.floor(ms / 60_000)} minutes`;
}
