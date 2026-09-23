import { readFileSync } from 'node:fs';
import path from 'node:path';

import { schema, type Db } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { makeUser, testDb } from '../../test/db';
import { ChesscomError } from './chesscom';
import { importMonth, type ImportResult } from './import';
import { MAX_REFRESH_MONTHS, monthsToRefresh, refreshAccount } from './refresh-account';
import { skippedLabel } from './skipped';
import { weekGames, weekWindow } from './week';

const at = (iso: string) => new Date(iso);
const m = (year: number, month: number) => ({ year, month });

describe('monthsToRefresh', () => {
  it('covers an Aug 20 → Sep 10 gap', () => {
    expect(monthsToRefresh(at('2026-09-10T09:00:00Z'), at('2026-08-20T18:00:00Z'))).toEqual([m(2026, 9), m(2026, 8)]);
  });

  it('reaches back to the month of the last refresh, however long ago', () => {
    expect(monthsToRefresh(at('2026-09-10T09:00:00Z'), at('2026-06-30T23:00:00Z'))).toEqual([
      m(2026, 9),
      m(2026, 8),
      m(2026, 7),
      m(2026, 6),
    ]);
  });

  it('always includes the previous month, even after a refresh this month', () => {
    // The week window straddles the boundary until the 8th, and a game ending
    // at 23:59 on the 31st lands in the previous archive.
    expect(monthsToRefresh(at('2026-09-23T16:00:00Z'), at('2026-09-23T15:00:00Z'))).toEqual([m(2026, 9), m(2026, 8)]);
  });

  it('on the 1st of a month', () => {
    expect(monthsToRefresh(at('2026-09-01T00:00:00Z'), at('2026-08-31T23:30:00Z'))).toEqual([m(2026, 9), m(2026, 8)]);
    expect(monthsToRefresh(at('2026-01-01T00:05:00Z'), at('2025-12-31T22:00:00Z'))).toEqual([m(2026, 1), m(2025, 12)]);
  });

  it('for an account never refreshed', () => {
    expect(monthsToRefresh(at('2026-09-23T16:00:00Z'), null)).toEqual([m(2026, 9), m(2026, 8)]);
    expect(monthsToRefresh(at('2026-01-02T00:00:00Z'))).toEqual([m(2026, 1), m(2025, 12)]);
  });

  it('caps a very old stamp at a year of months', () => {
    const months = monthsToRefresh(at('2026-09-10T00:00:00Z'), at('2024-01-01T00:00:00Z'));
    expect(months).toHaveLength(MAX_REFRESH_MONTHS);
    expect(months.at(-1)).toEqual(m(2025, 10));
  });
});

/* ── the refresh, end to end over PGlite with chess.com stubbed ──────────── */

const FIXTURE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../test/fixtures/month-kafka_f0-2026-09.json'), 'utf8'),
) as { games: unknown[] };

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const NOW = at('2026-09-23T16:53:00Z');

async function link(userId: string, username: string, lastRefreshedAt: Date | null) {
  await db.insert(schema.userChesscomAccounts).values({ userId, username, lastRefreshedAt });
}

async function stampOf(userId: string, username: string) {
  const [row] = await db
    .select()
    .from(schema.userChesscomAccounts)
    .where(and(eq(schema.userChesscomAccounts.userId, userId), eq(schema.userChesscomAccounts.username, username)));
  return row!.lastRefreshedAt;
}

describe('refreshAccount', () => {
  it('imports this week\'s games from a fresh current month (regression: 0 of 26)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const requested: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requested.push({ url, init });
      const body = url.endsWith('/2026/09') ? FIXTURE : { games: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const u = await makeUser(db);
    // Stamped two weeks ago, when the month held none of this week's games.
    await link(u.id, 'kafka_f0', at('2026-09-09T17:31:40Z'));

    const result = await refreshAccount(db, u.id, 'kafka_f0', at('2026-09-09T17:31:40Z'), {
      importMonth,
      now: () => NOW,
    });

    // No archives lookup gates the month; the current month is never cached.
    expect(requested.map((r) => r.url)).toEqual([
      'https://api.chess.com/pub/player/kafka_f0/games/2026/09',
      'https://api.chess.com/pub/player/kafka_f0/games/2026/08',
    ]);
    expect(requested[0]!.init.cache).toBe('no-store');

    expect(result.stored).toBe(4);
    expect(result.months).toEqual(['2026-09', '2026-08']);
    expect(result.skipped).toEqual({ count: 2, reasons: { variant: 1, no_moves: 1 } });
    expect(skippedLabel(result.skipped)).toBe('2 games not reviewable: variant/aborted');

    // chess.com spells it KAFKA_F0; the library and the week find it lowercased.
    const games = await db.select().from(schema.games);
    const week = weekGames(games, 'kafka_f0', weekWindow(NOW).since);
    expect(week.map((w) => w.game.id)).toEqual(['184263578210', '184263302354', '184263048440']);
    const library = await db.select().from(schema.userGames).where(eq(schema.userGames.userId, u.id));
    expect(library).toHaveLength(4);
    expect(await stampOf(u.id, 'kafka_f0')).toEqual(NOW);
  });

  it('leaves the stamp alone and throws when a month fails, keeping what did import', async () => {
    const u = await makeUser(db);
    const before = at('2026-08-20T18:00:00Z');
    await link(u.id, 'kafka_f0', before);
    const seen: string[] = [];
    const importMonthStub = async (d: Db, username: string, month: { year: number; month: number }): Promise<ImportResult> => {
      seen.push(`${month.year}-${month.month}`);
      if (month.month === 8) throw new ChesscomError('chess.com is rate-limiting us — try again shortly', 429);
      return { month: '2026-09', fetched: 0, stored: 0, skipped: 0, skips: [] };
    };

    await expect(
      refreshAccount(db, u.id, 'kafka_f0', before, { importMonth: importMonthStub, now: () => at('2026-09-10T09:00:00Z') }),
    ).rejects.toMatchObject({ status: 429 });
    expect(seen).toEqual(['2026-9', '2026-8']);
    expect(await stampOf(u.id, 'kafka_f0')).toEqual(before);
    // The games from the earlier import (the first test's rows) are in this member's library too.
    const library = await db.select().from(schema.userGames).where(eq(schema.userGames.userId, u.id));
    expect(library.length).toBeGreaterThan(0);
  });

  it('counts only the week\'s skips', async () => {
    const u = await makeUser(db);
    await link(u.id, 'solo', null);
    const result = await refreshAccount(db, u.id, 'solo', null, {
      now: () => NOW,
      importMonth: async () => ({
        month: '2026-09',
        fetched: 2,
        stored: 0,
        skipped: 2,
        skips: [
          { reason: 'unparseable', endTime: at('2026-09-22T00:00:00Z') },
          { reason: 'variant', endTime: at('2026-09-01T00:00:00Z') },
        ],
      }),
    });
    // Two months asked, each answering the same stub: two in-window skips.
    expect(result.skipped).toEqual({ count: 2, reasons: { unparseable: 2 } });
    expect(await stampOf(u.id, 'solo')).toEqual(NOW);
  });
});

describe('skippedLabel', () => {
  it('is null for none and names each reason once', () => {
    expect(skippedLabel({ count: 0, reasons: {} })).toBeNull();
    expect(skippedLabel(null)).toBeNull();
    expect(skippedLabel({ count: 1, reasons: { unparseable: 1 } })).toBe('1 game not reviewable: unreadable');
  });
});
