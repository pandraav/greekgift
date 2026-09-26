import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { schema, type Db } from '@greekgift/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/**
 * A fresh in-memory Postgres with the real migrations applied. Every test
 * file gets its own, so nothing leaks between files and nothing touches the
 * `.pglite` directory the dev server owns.
 */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  // PGlite's session timezone otherwise follows the host's local zone, while
  // drizzle writes plain `new Date()` values as UTC wall-clock text into the
  // `timestamp` (no zone) columns. On a non-UTC host that skews every
  // `defaultNow()` column against every JS-set one by the local offset —
  // observed here as a several-hour gap that broke ordering by `addedAt` vs
  // `openedAt`. Pin the session to UTC so both sides agree.
  await db.execute(`SET TIME ZONE 'UTC'`);
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../../../packages/db/migrations'),
  });
  return db as unknown as Db;
}

let n = 0;
/** A member row. Better Auth normally writes these; tests do it directly. */
export async function makeUser(
  db: Db,
  overrides: Partial<typeof schema.user.$inferInsert> = {},
): Promise<typeof schema.user.$inferSelect> {
  n += 1;
  const [row] = await db
    .insert(schema.user)
    .values({
      id: `u${n}`,
      name: `User ${n}`,
      email: `u${n}@example.com`,
      status: 'approved',
      ...overrides,
    })
    .returning();
  return row!;
}

/** A minimal game row. `plies` and `pgn` are placeholders; nothing parses them here. */
export async function makeGame(
  db: Db,
  overrides: Partial<typeof schema.games.$inferInsert> & { id: string },
): Promise<typeof schema.games.$inferSelect> {
  const [row] = await db
    .insert(schema.games)
    .values({
      uuid: `uuid-${overrides.id}`,
      url: `https://www.chess.com/game/live/${overrides.id}`,
      pgn: '[Result "1-0"]\n\n1. e4 e5 1-0',
      timeClass: 'rapid',
      timeControl: '600',
      endTime: new Date('2026-09-05T12:00:00Z'),
      whiteUsername: 'alice',
      whiteName: 'Alice',
      whiteRating: 1200,
      whiteResult: 'win',
      blackUsername: 'bob',
      blackName: 'Bob',
      blackRating: 1180,
      blackResult: 'resigned',
      result: '1-0',
      plies: 2,
      ...overrides,
    })
    .returning();
  return row!;
}
