/**
 * chess.com writes time controls as seconds, optionally with an increment,
 * and daily games as `1/<seconds per move>`. None of that is readable.
 *
 *   "180"       → "3 min"
 *   "180+1"     → "3+1"
 *   "60"        → "1 min"
 *   "30"        → "30 sec"
 *   "1/86400"   → "1 day"
 *   "1/604800"  → "7 days"
 */
export function formatTimeControl(raw: string): string {
  const value = raw.trim();

  // Daily: one move per N seconds.
  const daily = /^1\/(\d+)$/.exec(value);
  if (daily) {
    const days = Number(daily[1]) / 86400;
    if (days >= 1) {
      const n = Math.round(days);
      return `${n} day${n === 1 ? '' : 's'}`;
    }
    const hours = Math.round(Number(daily[1]) / 3600);
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }

  const [baseRaw, incRaw] = value.split('+');
  const base = Number(baseRaw);
  if (!Number.isFinite(base)) return value;

  const increment = incRaw ? Number(incRaw) : 0;
  const minutes = base / 60;
  const baseLabel =
    base < 60
      ? `${base} sec`
      : Number.isInteger(minutes)
        ? `${minutes} min`
        : `${(base / 60).toFixed(1)} min`;

  if (!increment) return baseLabel;

  // With an increment the "3+2" form is what players actually say.
  return Number.isInteger(minutes)
    ? `${minutes}+${increment}`
    : `${baseLabel}+${increment}`;
}
