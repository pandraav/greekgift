import 'server-only';

import { schema, type NewGame } from '@greekgift/db';
import { gameIdFromLink, openingName, parsePgn } from '@greekgift/engine';
import { sql } from 'drizzle-orm';

import * as cc from '@/lib/chesscom';
import { db } from '@/lib/db';

/**
 * Pulls games from chess.com into our own tables.
 *
 * The mirror is shared, not per-user: reviews are keyed by chess.com username,
 * so importing a player once serves everybody who looks at them.
 */

/** `https://api.chess.com/pub/country/US` → `US`. */
function countryCode(url: string | undefined): string | undefined {
  return url?.split('/').pop()?.toUpperCase();
}

const secondsToDate = (s: number | undefined) =>
  s ? new Date(s * 1000) : undefined;

export interface PlayerSnapshot {
  username: string;
  displayName: string;
  ratingRapid: number | null;
  ratingBlitz: number | null;
  ratingBullet: number | null;
  archiveCount: number | null;
  joinedAt: Date | null;
}

/**
 * Makes sure we hold a current profile for this player.
 *
 * Profiles are refetched at most once an hour; chess.com caches its own
 * responses anyway, and a rating that is sixty minutes stale costs nothing.
 */
export async function ensurePlayer(rawUsername: string): Promise<PlayerSnapshot> {
  const username = cc.normaliseUsername(rawUsername);

  const [profile, stats, archives] = await Promise.all([
    cc.profile(username),
    cc.stats(username).catch(() => ({})), // a brand-new account has no stats
    cc.archives(username).catch(() => [] as string[]),
  ]);

  const ratings = cc.bestRating(stats);

  const row = {
    username,
    displayName: profile.username,
    title: profile.title ?? null,
    realName: profile.name ?? null,
    countryCode: countryCode(profile.country) ?? null,
    avatarUrl: profile.avatar ?? null,
    joinedAt: secondsToDate(profile.joined) ?? null,
    lastOnlineAt: secondsToDate(profile.last_online) ?? null,
    ratingRapid: ratings.rapid ?? null,
    ratingBlitz: ratings.blitz ?? null,
    ratingBullet: ratings.bullet ?? null,
    archiveCount: archives.length,
    syncedAt: new Date(),
  };

  await db
    .insert(schema.players)
    .values(row)
    .onConflictDoUpdate({ target: schema.players.username, set: row });

  return {
    username,
    displayName: row.displayName,
    ratingRapid: row.ratingRapid,
    ratingBlitz: row.ratingBlitz,
    ratingBullet: row.ratingBullet,
    archiveCount: row.archiveCount,
    joinedAt: row.joinedAt,
  };
}

/** Turns one API game into a row, or null if it cannot be reviewed. */
function toRow(game: cc.ChesscomGame): NewGame | null {
  if (!game.pgn) return null;

  let parsed;
  try {
    parsed = parsePgn(game.pgn);
  } catch {
    // A PGN we cannot read is a game we cannot review. Skip it rather than
    // failing the whole month.
    return null;
  }

  const id = parsed.gameId ?? gameIdFromLink(game.url) ?? game.uuid;

  return {
    id,
    uuid: game.uuid,
    url: game.url,
    pgn: game.pgn,
    timeClass: game.time_class,
    timeControl: game.time_control,
    rated: game.rated,
    endTime: new Date(game.end_time * 1000),

    whiteUsername: cc.normaliseUsername(game.white.username),
    whiteName: game.white.username,
    whiteRating: game.white.rating ?? null,
    whiteResult: game.white.result,

    blackUsername: cc.normaliseUsername(game.black.username),
    blackName: game.black.username,
    blackRating: game.black.rating ?? null,
    blackResult: game.black.result,

    result: parsed.result ?? '*',
    termination: parsed.headers.Termination ?? null,

    eco: parsed.eco ?? null,
    ecoUrl: parsed.headers.ECOUrl ?? null,
    opening: openingName(parsed.headers.ECOUrl) ?? null,

    plies: parsed.moves.length,
    finalFen: game.fen ?? parsed.fens.at(-1) ?? null,

    ccAccuracyWhite: game.accuracies?.white ?? null,
    ccAccuracyBlack: game.accuracies?.black ?? null,
  };
}

export interface ImportResult {
  month: string;
  fetched: number;
  stored: number;
  skipped: number;
}

/** Imports one archive month. Idempotent — re-running updates in place. */
export async function importMonth(
  username: string,
  month: cc.ArchiveMonth,
): Promise<ImportResult> {
  const games = await cc.monthGames(username, month);
  const rows = games.map(toRow).filter((r): r is NewGame => r !== null);
  const label = `${month.year}-${String(month.month).padStart(2, '0')}`;

  if (rows.length > 0) {
    // Chunked: a month can hold hundreds of games and each row carries a
    // whole PGN, so one statement would be enormous.
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(schema.games)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: schema.games.id,
          set: {
            // Only the things chess.com can revise after the fact.
            ccAccuracyWhite: sql`excluded.cc_accuracy_white`,
            ccAccuracyBlack: sql`excluded.cc_accuracy_black`,
            pgn: sql`excluded.pgn`,
          },
        });
    }
  }

  return {
    month: label,
    fetched: games.length,
    stored: rows.length,
    skipped: games.length - rows.length,
  };
}

/**
 * Imports the most recent `months` archives, newest first.
 *
 * Serial on purpose: chess.com asks for sequential access, and a hobby app
 * has no reason to be the one that gets rate-limited.
 */
export async function importRecent(
  rawUsername: string,
  months = 1,
): Promise<{ player: PlayerSnapshot; imported: ImportResult[] }> {
  const username = cc.normaliseUsername(rawUsername);
  const player = await ensurePlayer(username);
  const all = await cc.archives(username);
  const recent = all.slice(-Math.max(1, months)).reverse();

  const imported: ImportResult[] = [];
  for (const url of recent) {
    imported.push(await importMonth(username, cc.monthOf(url)));
  }

  if (imported[0]) {
    await db
      .update(schema.players)
      .set({ importedThrough: imported[0].month })
      .where(sql`${schema.players.username} = ${username}`);
  }

  return { player, imported };
}
