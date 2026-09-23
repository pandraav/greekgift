import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { archives, ChesscomError, isOpenMonth, monthArchive, monthGames } from './chesscom';

/**
 * Regression for "0 of 26": Next's data cache is stale-while-revalidate, so a
 * `next.revalidate` fetch of the current month handed the refresh whatever
 * body was stored last time — for kafka_f0, a 9 September snapshot on 23
 * September, with none of the week's games in it. The archives list and any
 * open month must go to chess.com every time.
 */

type Init = RequestInit & { next?: { revalidate?: number } };
let calls: { url: string; init: Init }[];

function stubFetch(body: unknown, status = 200) {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: Init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T16:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chess.com freshness', () => {
  it('never caches the archives list', async () => {
    stubFetch({ archives: ['https://api.chess.com/pub/player/kafka_f0/games/2026/09'] });
    await archives('KAFKA_F0');
    expect(calls[0]!.url).toBe('https://api.chess.com/pub/player/kafka_f0/games/archives');
    expect(calls[0]!.init.cache).toBe('no-store');
    expect(calls[0]!.init.next).toBeUndefined();
  });

  it('never caches the current month', async () => {
    stubFetch({ games: [] });
    await monthArchive('kafka_f0', { year: 2026, month: 9 });
    expect(calls[0]!.url).toBe('https://api.chess.com/pub/player/kafka_f0/games/2026/09');
    expect(calls[0]!.init.cache).toBe('no-store');
    expect(calls[0]!.init.next).toBeUndefined();
  });

  it('keeps caching a settled month for a week', async () => {
    stubFetch({ games: [] });
    await monthArchive('kafka_f0', { year: 2026, month: 8 });
    expect(calls[0]!.init.cache).toBeUndefined();
    expect(calls[0]!.init.next).toEqual({ revalidate: 60 * 60 * 24 * 7 });
  });

  it('treats a month as open until two days after it ends', () => {
    expect(isOpenMonth({ year: 2026, month: 8 }, new Date('2026-09-01T00:00:00Z'))).toBe(true);
    expect(isOpenMonth({ year: 2026, month: 8 }, new Date('2026-09-02T23:59:59Z'))).toBe(true);
    expect(isOpenMonth({ year: 2026, month: 8 }, new Date('2026-09-03T00:00:00Z'))).toBe(false);
    expect(isOpenMonth({ year: 2025, month: 12 }, new Date('2026-01-01T12:00:00Z'))).toBe(true);
    expect(isOpenMonth({ year: 2026, month: 10 }, new Date('2026-09-23T00:00:00Z'))).toBe(true);
  });

  it('reads a month chess.com has no archive for as empty, not as a failure', async () => {
    stubFetch({ message: 'not found' }, 404);
    await expect(monthArchive('kafka_f0', { year: 2026, month: 9 })).resolves.toEqual([]);
  });

  it('still throws a rate limit', async () => {
    stubFetch({}, 429);
    await expect(monthArchive('kafka_f0', { year: 2026, month: 9 })).rejects.toBeInstanceOf(ChesscomError);
  });

  it('monthArchive keeps variants; monthGames, for pasted links, does not', async () => {
    const games = [
      { rules: 'chess', pgn: '1. e4 *' },
      { rules: 'chess960', pgn: '1. e4 *' },
      { rules: 'chess' },
    ];
    stubFetch({ games });
    expect(await monthArchive('kafka_f0', { year: 2026, month: 9 })).toHaveLength(3);
    stubFetch({ games });
    expect(await monthGames('kafka_f0', { year: 2026, month: 9 })).toHaveLength(1);
  });
});
