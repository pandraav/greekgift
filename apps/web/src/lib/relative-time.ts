/** "refreshed 12 min ago", "today", "2 Sep". Exact copy from the prototype. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function relativeTime(date: Date, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - date.getTime());
  if (ms < 45_000) return 'just now';
  if (ms < HOUR) return `${Math.round(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h ago`;
  const days = Math.round(ms / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const sameDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();

/** The date column of a game row. */
export function whenLabel(date: Date, now: Date = new Date()): string {
  if (sameDay(date, now)) return 'today';
  if (sameDay(date, new Date(now.getTime() - DAY))) return 'yesterday';
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]}`;
}

/** "31 August" — the week card's since date. */
export function longDay(date: Date): string {
  return `${date.getUTCDate()} ${LONG_MONTHS[date.getUTCMonth()]}`;
}
