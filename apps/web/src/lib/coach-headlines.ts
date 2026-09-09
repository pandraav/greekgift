import { schema, type Audience, type Db } from '@greekgift/db';
import { and, eq, or, sql } from 'drizzle-orm';

/**
 * One headline per game, for the one ply a list row shows.
 *
 * `ensureCoachTexts` reads and writes a whole game's notes; a row on the
 * player page wants a single sentence. Asking for it game by game is a SELECT
 * per row and, on a cold cache, an INSERT per row too, so the rows that
 * already have their note are answered here in one query and only the misses
 * fall through to the writer.
 *
 * `db` is explicit so this runs on the in-memory PGlite the tests use, the
 * same convention as `library.ts`.
 */

export async function getCoachHeadlines(
  db: Db,
  entries: { gameId: string; ply: number }[],
  personaId: string,
  audience: Audience,
): Promise<Record<string, string>> {
  if (entries.length === 0) return {};

  const found: Record<string, string> = {};
  // Two bind parameters per entry, so the pair list is chunked rather than
  // handed two hundred rows at once.
  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const pairs = entries.slice(i, i + CHUNK);
    const rows = await db
      .select({
        gameId: schema.coachTexts.gameId,
        headline: sql<string>`${schema.coachTexts.data}->>'headline'`,
      })
      .from(schema.coachTexts)
      .where(
        and(
          eq(schema.coachTexts.personaId, personaId),
          eq(schema.coachTexts.audience, audience),
          or(
            ...pairs.map((e) =>
              and(eq(schema.coachTexts.gameId, e.gameId), eq(schema.coachTexts.ply, e.ply)),
            ),
          ),
        ),
      );

    for (const row of rows) {
      if (row.headline !== null) found[row.gameId] = row.headline;
    }
  }

  return found;
}
