/**
 * Clock times, as the review shows them. All inputs are milliseconds.
 *
 * Seconds are floored, never rounded: a clock that reads 0:48.9 has not got
 * 49 seconds on it, and "0:00" must mean the flag fell.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "0:48", "9:56", "1:02:05": a clock face. */
export function clockFace(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact think time for a cell: "3.8s" under 10 s, "41s" under a minute, "1:09" from a minute. */
export function spentShort(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 10_000) return `${(Math.floor(safe / 100) / 10).toFixed(1)}s`;
  if (safe < 60_000) return `${Math.floor(safe / 1000)}s`;
  return clockFace(safe);
}

/** A duration in a sentence: "no time", "1 second", "48 seconds", then "1:42". */
export function durationWords(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  if (t === 0) return 'no time';
  if (t === 1) return '1 second';
  if (t < 60) return `${t} seconds`;
  return clockFace(ms);
}
