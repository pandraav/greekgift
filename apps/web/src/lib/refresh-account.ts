import 'server-only';

import { schema, type Db } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import * as cc from '@/lib/chesscom';
import { importMonth as realImportMonth, type ImportResult } from '@/lib/import';
import { materialiseAccount } from '@/lib/library';
import type { SkippedSummary } from '@/lib/skipped';
import { WEEK_MS } from '@/lib/week';

/**
 * Brings one linked account up to date (spec §7.1).
 *
 * Every month from the last successful refresh (or the previous month,
 * whichever is earlier) through the current one is imported, so a member who
 * stays away for three weeks comes back to no hole. The months are asked for
 * directly rather than looked up in the archives list first: chess.com
 * answers a month with no games with an empty list, so the list adds a request
 * and, cached, could hide the month a game just landed in.
 *
 * The stamp is written only after every month imported. A chess.com error (or
 * any other) leaves it alone and is thrown to the caller, so the card keeps
 * saying when it last succeeded and the next visit tries again. Whatever did
 * import before the failure is still copied into the library.
 */

/**
 * The most months one refresh reads. At about a second a month this keeps a
 * refresh inside the route's 60-second budget; an account left alone for more
 * than a year gets its latest year and nothing older.
 */
export const MAX_REFRESH_MONTHS = 12;

export interface RefreshDeps {
  importMonth: (db: Db, username: string, month: cc.ArchiveMonth) => Promise<ImportResult>;
  now: () => Date;
}

const defaultDeps: RefreshDeps = {
  importMonth: realImportMonth,
  now: () => new Date(),
};

const index = ({ year, month }: cc.ArchiveMonth) => year * 12 + (month - 1);
const fromIndex = (i: number): cc.ArchiveMonth => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
const monthOfDate = (d: Date): cc.ArchiveMonth => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });

/** Newest first: the current month, back to the earlier of the last refresh's month and the previous month. */
export function monthsToRefresh(now: Date, lastRefreshedAt: Date | null = null): cc.ArchiveMonth[] {
  const current = index(monthOfDate(now));
  const from = Math.min(current - 1, lastRefreshedAt ? index(monthOfDate(lastRefreshedAt)) : current - 1);
  const oldest = Math.max(from, current - (MAX_REFRESH_MONTHS - 1));
  const months: cc.ArchiveMonth[] = [];
  for (let i = current; i >= oldest; i -= 1) months.push(fromIndex(i));
  return months;
}

export interface RefreshResult {
  stored: number;
  months: string[];
  /** Only the week window's skips: the home card is a week, so that is what it reports. */
  skipped: SkippedSummary;
}

export async function refreshAccount(
  db: Db,
  userId: string,
  username: string,
  lastRefreshedAt: Date | null,
  deps: RefreshDeps = defaultDeps,
): Promise<RefreshResult> {
  const now = deps.now();
  const since = now.getTime() - WEEK_MS;
  const result: RefreshResult = { stored: 0, months: [], skipped: { count: 0, reasons: {} } };

  try {
    for (const month of monthsToRefresh(now, lastRefreshedAt)) {
      const imported = await deps.importMonth(db, username, month);
      result.stored += imported.stored;
      result.months.push(imported.month);
      for (const skip of imported.skips) {
        if (skip.endTime.getTime() < since) continue;
        result.skipped.count += 1;
        result.skipped.reasons[skip.reason] = (result.skipped.reasons[skip.reason] ?? 0) + 1;
      }
    }
  } finally {
    // Partial progress still reaches the library; only the stamp waits for success.
    await materialiseAccount(db, userId, username);
  }

  await db
    .update(schema.userChesscomAccounts)
    .set({ lastRefreshedAt: now })
    .where(and(eq(schema.userChesscomAccounts.userId, userId), eq(schema.userChesscomAccounts.username, username)));
  return result;
}
