import 'server-only';

import {
  schema,
  type Db,
  type Game,
  type LibrarySource,
  type UserChesscomAccount,
} from '@greekgift/db';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';

import { ChesscomError, isValidUsername, normaliseUsername } from '@/lib/chesscom';
import { ensurePlayer as realEnsurePlayer, type PlayerSnapshot } from '@/lib/import';
import type { CacheKey } from '@/lib/review-store';

/**
 * The library: which games a member can see, and why.
 *
 * Visibility is one question with three answers — a linked account played it,
 * the member opened it, or someone shared it — and every route and page asks
 * it through `canSeeGame`, which is the only place the admin bypass lives.
 * Everything takes `db` explicitly so it runs on in-memory PGlite in tests.
 */

export const ACCOUNT_LIMIT = 5;
/** How many "My reviews" rows the home card asks for. Exported so the count label can say `20+`. */
export const LIBRARY_PAGE = 20;
export const STALE_AFTER_MS = 60 * 60 * 1000;

/** Who is asking. Everything that gates on the library takes one of these. */
export type Viewer = { id: string; role: 'admin' | 'member' };

export async function linkedUsernamesFor(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ username: schema.userChesscomAccounts.username })
    .from(schema.userChesscomAccounts)
    .where(eq(schema.userChesscomAccounts.userId, userId));
  return rows.map((r) => r.username);
}

/** Which linked account played this game, if any. */
async function playedByLinked(db: Db, userId: string, gameId: string): Promise<string | null> {
  const [row] = await db
    .select({ username: schema.userChesscomAccounts.username })
    .from(schema.userChesscomAccounts)
    .innerJoin(
      schema.games,
      and(
        eq(schema.games.id, gameId),
        or(
          eq(schema.games.whiteUsername, schema.userChesscomAccounts.username),
          eq(schema.games.blackUsername, schema.userChesscomAccounts.username),
        ),
      ),
    )
    .where(eq(schema.userChesscomAccounts.userId, userId))
    .limit(1);
  return row?.username ?? null;
}

export async function membership(db: Db, userId: string, gameId: string): Promise<LibrarySource | null> {
  const [row] = await db
    .select({ source: schema.userGames.source })
    .from(schema.userGames)
    .where(and(eq(schema.userGames.userId, userId), eq(schema.userGames.gameId, gameId)))
    .limit(1);
  if (row) return row.source;
  return (await playedByLinked(db, userId, gameId)) ? 'account' : null;
}

/** The one place admins bypass the library. */
export async function canSeeGame(db: Db, user: Viewer, gameId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  return (await membership(db, user.id, gameId)) !== null;
}

/* ── accounts ─────────────────────────────────────────────────────────── */

export class AccountError extends Error {
  constructor(readonly code: 'bad_username' | 'limit' | 'exists' | 'no_such_player') {
    super(code);
    this.name = 'AccountError';
  }
}

export async function listAccounts(db: Db, userId: string): Promise<UserChesscomAccount[]> {
  return db
    .select()
    .from(schema.userChesscomAccounts)
    .where(eq(schema.userChesscomAccounts.userId, userId))
    .orderBy(asc(schema.userChesscomAccounts.addedAt), asc(schema.userChesscomAccounts.username));
}

/** One linked account, or null. The refresh route's whole question. */
export async function getAccount(db: Db, userId: string, username: string): Promise<UserChesscomAccount | null> {
  const [row] = await db
    .select()
    .from(schema.userChesscomAccounts)
    .where(
      and(
        eq(schema.userChesscomAccounts.userId, userId),
        eq(schema.userChesscomAccounts.username, username),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface AddAccountDeps {
  ensurePlayer: (raw: string) => Promise<PlayerSnapshot>;
}

/** Cap and duplicate checks happen before chess.com is asked anything. */
export async function addAccount(
  db: Db,
  userId: string,
  raw: string,
  deps: AddAccountDeps = { ensurePlayer: (r) => realEnsurePlayer(db, r) },
): Promise<UserChesscomAccount> {
  if (!isValidUsername(raw)) throw new AccountError('bad_username');
  const username = normaliseUsername(raw);

  const existing = await listAccounts(db, userId);
  if (existing.some((a) => a.username === username)) throw new AccountError('exists');
  if (existing.length >= ACCOUNT_LIMIT) throw new AccountError('limit');

  try {
    await deps.ensurePlayer(username);
  } catch (error) {
    if (error instanceof ChesscomError && error.status === 404) throw new AccountError('no_such_player');
    throw error;
  }

  const [row] = await db
    .insert(schema.userChesscomAccounts)
    .values({ userId, username })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new AccountError('exists');
  return row;
}

/**
 * Deletes the account and the library rows it accounted for. Rows added by
 * link or share survive. The other linked accounts are re-materialised so a
 * game two of them played stays in the library under the one that remains.
 */
export async function removeAccount(db: Db, userId: string, username: string): Promise<void> {
  await db
    .delete(schema.userChesscomAccounts)
    .where(and(eq(schema.userChesscomAccounts.userId, userId), eq(schema.userChesscomAccounts.username, username)));
  await db
    .delete(schema.userGames)
    .where(
      and(
        eq(schema.userGames.userId, userId),
        eq(schema.userGames.source, 'account'),
        eq(schema.userGames.accountUsername, username),
      ),
    );
  for (const remaining of await linkedUsernamesFor(db, userId)) {
    await materialiseAccount(db, userId, remaining);
  }
}

/** Copies every stored game this account played into the library. Idempotent. */
export async function materialiseAccount(db: Db, userId: string, username: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO "user_games" ("user_id", "game_id", "source", "account_username")
    SELECT ${userId}, "id", 'account', ${username}
    FROM "games"
    WHERE "white_username" = ${username} OR "black_username" = ${username}
    ON CONFLICT DO NOTHING
  `);
}

export interface LibraryEntry {
  source: LibrarySource;
  accountUsername?: string;
  sharedBy?: string;
}

/** Upsert with precedence: an `account` row can be upgraded, a `link` or `share` row is never touched. */
export async function addToLibrary(db: Db, userId: string, gameId: string, entry: LibraryEntry): Promise<void> {
  // `new Date()` in both branches, not SQL `now()`: `libraryReviews` orders by
  // `coalesce(openedAt, addedAt)` against `touchOpened`'s JS-clock `openedAt`,
  // so this module's own two timestamps must come from one clock regardless
  // of the session's timezone setting.
  await db
    .insert(schema.userGames)
    .values({
      userId,
      gameId,
      source: entry.source,
      accountUsername: entry.accountUsername ?? null,
      sharedBy: entry.sharedBy ?? null,
      addedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.userGames.userId, schema.userGames.gameId],
      set: {
        source: sql`excluded.source`,
        accountUsername: sql`excluded.account_username`,
        sharedBy: sql`excluded.shared_by`,
        addedAt: new Date(),
      },
      setWhere: and(eq(schema.userGames.source, 'account'), sql`excluded.source <> 'account'`),
    });
}

/**
 * Marks a game opened. When the only membership is a linked account that has
 * not been materialised yet, the row is inserted first. Admins reading a
 * stranger's game leave no trace.
 */
export async function touchOpened(db: Db, user: Viewer, gameId: string): Promise<void> {
  const [row] = await db
    .select({ gameId: schema.userGames.gameId })
    .from(schema.userGames)
    .where(and(eq(schema.userGames.userId, user.id), eq(schema.userGames.gameId, gameId)))
    .limit(1);

  if (!row) {
    const played = await playedByLinked(db, user.id, gameId);
    if (!played) return;
    await addToLibrary(db, user.id, gameId, { source: 'account', accountUsername: played });
  }

  await db
    .update(schema.userGames)
    .set({ openedAt: new Date() })
    .where(and(eq(schema.userGames.userId, user.id), eq(schema.userGames.gameId, gameId)));
}

export interface LibraryRow {
  game: Game;
  source: LibrarySource;
  sharedByName: string | null;
  /** The member's colour when a linked account played it; null for a pasted or shared stranger's game. */
  side: 'w' | 'b' | null;
  /** The member's own accuracy; null when no linked account played, or the game is unread. */
  accuracy: number | null;
  /** Both seats, for a game the member did not play: the row shows "94.1 · 88.0". */
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  /**
   * Which player page a `link` row was opened from, else null — so a row can
   * say "opened from chess.com/dave" rather than "pasted link". `source` is
   * frozen at three values by spec §4, so the arrival is carried on the
   * `account_username` column, which is documented for `account` rows and
   * here means "the page it came from". `removeAccount` only deletes rows
   * with `source = 'account'`, so unlinking dave leaves these standing.
   */
  arrivedFrom: string | null;
  /** Opened, else added. */
  at: Date;
}

/** "My reviews": opened games and approved shares, newest by opened-or-added. */
export async function libraryReviews(db: Db, userId: string, key: CacheKey, limit = LIBRARY_PAGE): Promise<LibraryRow[]> {
  const at = sql<Date>`coalesce(${schema.userGames.openedAt}, ${schema.userGames.addedAt})`;
  const rows = await db
    .select({
      game: schema.games,
      source: schema.userGames.source,
      accountUsername: schema.userGames.accountUsername,
      sharedByName: schema.user.name,
      white: schema.reviews.whiteAccuracy,
      black: schema.reviews.blackAccuracy,
      at,
    })
    .from(schema.userGames)
    .innerJoin(schema.games, eq(schema.games.id, schema.userGames.gameId))
    .leftJoin(schema.user, eq(schema.user.id, schema.userGames.sharedBy))
    .leftJoin(
      schema.reviews,
      and(
        eq(schema.reviews.gameId, schema.games.id),
        eq(schema.reviews.nodes, key.nodes),
        eq(schema.reviews.engineBuild, key.engineBuild),
      ),
    )
    .where(
      and(
        eq(schema.userGames.userId, userId),
        or(sql`${schema.userGames.openedAt} IS NOT NULL`, eq(schema.userGames.source, 'share')),
      ),
    )
    .orderBy(desc(at))
    .limit(limit);

  const linked = new Set(await linkedUsernamesFor(db, userId));

  return rows.map((r) => {
    const side: 'w' | 'b' | null = linked.has(r.game.whiteUsername)
      ? 'w'
      : linked.has(r.game.blackUsername)
        ? 'b'
        : null;
    const accuracy =
      side === null || r.white === null || r.black === null
        ? null
        : side === 'b'
          ? r.black
          : r.white;
    return {
      game: r.game,
      source: r.source,
      sharedByName: r.source === 'share' ? r.sharedByName : null,
      side,
      accuracy,
      whiteAccuracy: r.white,
      blackAccuracy: r.black,
      arrivedFrom: r.source === 'link' ? r.accountUsername : null,
      at: new Date(r.at),
    };
  });
}

export function isStale(lastRefreshedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastRefreshedAt) return true;
  return now.getTime() - lastRefreshedAt.getTime() > STALE_AFTER_MS;
}
