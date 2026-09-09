import 'server-only';

import { schema, type Db } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import * as cc from '@/lib/chesscom';
import { importMonth as realImportMonth, type ImportResult } from '@/lib/import';
import { materialiseAccount } from '@/lib/library';

/**
 * Brings one linked account up to date (spec §7.1).
 *
 * The current archive month is imported, and the previous one too when today
 * is within seven days of the month's start, so the window never has a hole
 * at a month boundary. Only months chess.com actually lists are fetched: a
 * player with no games this month has no archive for it, and asking would
 * 404. The stamp is written last, so a chess.com error leaves it alone and the
 * card keeps saying when it last succeeded.
 */

export interface RefreshDeps {
  archives: (username: string) => Promise<string[]>;
  importMonth: (db: Db, username: string, month: cc.ArchiveMonth) => Promise<ImportResult>;
  now: () => Date;
}

const defaultDeps: RefreshDeps = {
  archives: cc.archives,
  importMonth: realImportMonth,
  now: () => new Date(),
};

export function monthsToRefresh(now: Date): cc.ArchiveMonth[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const months: cc.ArchiveMonth[] = [{ year, month }];
  if (now.getUTCDate() <= 7) {
    months.push(month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
  }
  return months;
}

export async function refreshAccount(
  db: Db,
  userId: string,
  username: string,
  deps: RefreshDeps = defaultDeps,
): Promise<{ stored: number }> {
  const listed = new Set((await deps.archives(username)).map((u) => JSON.stringify(cc.monthOf(u))));
  let stored = 0;
  for (const month of monthsToRefresh(deps.now())) {
    if (!listed.has(JSON.stringify(month))) continue;
    stored += (await deps.importMonth(db, username, month)).stored;
  }
  await materialiseAccount(db, userId, username);
  await db
    .update(schema.userChesscomAccounts)
    .set({ lastRefreshedAt: deps.now() })
    .where(and(eq(schema.userChesscomAccounts.userId, userId), eq(schema.userChesscomAccounts.username, username)));
  return { stored };
}
