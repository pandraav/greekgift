import { describe, expect, it } from 'vitest';

import { longDay, relativeTime, whenLabel } from './relative-time';

const NOW = new Date('2026-09-07T12:00:00Z');

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [44_000, 'just now'],
    [12 * 60_000, '12 min ago'],
    [3 * 3_600_000, '3 h ago'],
    [26 * 3_600_000, 'yesterday'],
    [3 * 86_400_000, '3 days ago'],
  ])('%d ms → %s', (ago, text) => {
    expect(relativeTime(new Date(NOW.getTime() - ago), NOW)).toBe(text);
  });
});

describe('whenLabel', () => {
  it('today, yesterday, then the date', () => {
    expect(whenLabel(new Date('2026-09-07T01:00:00Z'), NOW)).toBe('today');
    expect(whenLabel(new Date('2026-09-06T23:00:00Z'), NOW)).toBe('yesterday');
    expect(whenLabel(new Date('2026-09-02T23:00:00Z'), NOW)).toBe('2 Sep');
    expect(longDay(new Date('2026-08-31T12:00:00Z'))).toBe('31 August');
  });
});
