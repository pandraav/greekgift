import 'server-only';

import { getDb, type Db } from '@greekgift/db';

import { env } from '@/env';

/**
 * The one database handle.
 *
 * `getDb` is lazy — nothing connects until the first query — which is what
 * keeps `next build`'s page-data workers from each opening PGlite. Migrations
 * run from instrumentation.ts, once per server process.
 */
export const db: Db = getDb(env.DATABASE_URL);

export type { Db };
