import { schema, type Db } from '@greekgift/db';
import type { KeyMoment } from '@greekgift/engine';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { reviewCacheKey } from '@/lib/engine/settings';
import type { CacheKey } from '@/lib/review-store';
import type { SlimMove, SlimReview } from '@/lib/slim-review';

/**
 * Turning points for a list of games, without the evaluations.
 *
 * A player page holds up to two hundred games and needs, per reviewed one,
 * the key moments and five fields of each move. Reading the whole `Review`
 * blob for that costs hundreds of kilobytes a row, so the projection happens
 * in Postgres: the eval arrays are never sent over the wire.
 *
 * `db` is explicit so this runs on the in-memory PGlite the tests use, the
 * same convention as `library.ts`.
 */

/** Five fields per move, built inside Postgres and ordered by ply. */
const SLIM_MOVES = sql<SlimMove[]>`(
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ply', m->'ply',
        'color', m->'color',
        'uci', m->'uci',
        'fenAfter', m->'fenAfter',
        'classification', m->'classification'
      )
      ORDER BY (m->>'ply')::int
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(${schema.reviews.data}->'moves') m
)`;

export async function getMoments(
  db: Db,
  gameIds: string[],
  key: CacheKey,
): Promise<Record<string, SlimReview>> {
  if (gameIds.length === 0) return {};

  const found: Record<string, SlimReview> = {};
  // Postgres takes a bind parameter per element, so the IN list is chunked
  // rather than handed two hundred ids at once — as `getCachedEvals` does.
  const CHUNK = 200;
  for (let i = 0; i < gameIds.length; i += CHUNK) {
    const rows = await db
      .select({
        gameId: schema.reviews.gameId,
        white: schema.reviews.whiteAccuracy,
        black: schema.reviews.blackAccuracy,
        keyMoments: sql<KeyMoment[]>`${schema.reviews.data}->'keyMoments'`,
        moves: SLIM_MOVES,
      })
      .from(schema.reviews)
      .where(
        and(
          inArray(schema.reviews.gameId, gameIds.slice(i, i + CHUNK)),
          eq(schema.reviews.nodes, key.nodes),
          eq(schema.reviews.engineBuild, reviewCacheKey(key).engineBuild),
        ),
      );

    for (const row of rows) {
      found[row.gameId] = {
        keyMoments: row.keyMoments ?? [],
        moves: row.moves ?? [],
        white: { accuracy: row.white },
        black: { accuracy: row.black },
      };
    }
  }

  return found;
}
