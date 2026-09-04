import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

import * as schema from './schema.ts';

/**
 * The common supertype of the Neon and PGlite drivers.
 *
 * A union of the two would make TypeScript intersect their method overloads,
 * which breaks `.returning({...})` at every call site. Both drivers extend
 * PgDatabase, so this keeps one `db` type across both without that.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const req = createRequire(import.meta.url);

/**
 * Which driver a connection string wants.
 *
 * The app runs on Neon in production and on PGlite locally. PGlite is
 * Postgres compiled to wasm, so the schema, the migrations and the Better
 * Auth adapter are identical either way — only the driver changes. That is
 * what lets `pnpm dev` work with no credentials at all.
 */
export function driverFor(url: string | undefined): 'neon' | 'pglite' {
  if (!url) return 'pglite';
  if (url.startsWith('pglite:') || url.startsWith('file:')) return 'pglite';
  return 'neon';
}

const DEFAULT_PGLITE_DIR = '.pglite';

/**
 * The workspace root, found by walking up for pnpm-workspace.yaml.
 *
 * Uses process.cwd() rather than import.meta.dirname, which is undefined once
 * Turbopack bundles this package. A bare relative path will not do either:
 * `db:migrate` runs in packages/db and `next dev` runs in apps/web, and that
 * would quietly give them two different databases.
 */
function workspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

export function migrationsDir(): string {
  return resolve(workspaceRoot(), 'packages/db/migrations');
}

export function pgliteDir(url: string | undefined): string {
  const path = (url ?? '')
    .replace(/^pglite:(\/\/)?/, '')
    .replace(/^file:(\/\/)?/, '');
  return resolve(workspaceRoot(), path || DEFAULT_PGLITE_DIR);
}

function create(url: string | undefined): Db {
  if (driverFor(url) === 'neon') {
    const { Pool } = req(
      '@neondatabase/serverless',
    ) as typeof import('@neondatabase/serverless');
    const { drizzle } = req(
      'drizzle-orm/neon-serverless',
    ) as typeof import('drizzle-orm/neon-serverless');
    // WebSocket Pool, not neon-http: Better Auth wraps sign-up in an
    // interactive transaction, which the HTTP driver cannot do.
    return drizzle(new Pool({ connectionString: url! }), { schema });
  }

  const { PGlite } = req(
    '@electric-sql/pglite',
  ) as typeof import('@electric-sql/pglite');
  const { drizzle } = req(
    'drizzle-orm/pglite',
  ) as typeof import('drizzle-orm/pglite');
  return drizzle(new PGlite(pgliteDir(url)), { schema });
}

const cache = new Map<string, Db>();

/**
 * The database handle, created on first use and never at import time.
 *
 * The laziness is load-bearing, not tidiness. `next build` collects page data
 * in five worker processes, each importing every route module. PGlite gives
 * one process exclusive use of a data directory but does not enforce it — a
 * second opener does not fail, it corrupts the store and aborts the wasm
 * runtime. Connecting at module scope therefore broke the build outright.
 * Importing is now free; only a real query opens anything.
 */
export function getDb(url: string | undefined): Db {
  const key = url ?? '';
  let db = cache.get(key);
  if (!db) {
    db = create(url);
    cache.set(key, db);
  }
  return db;
}

/**
 * Applies migrations. Called once per server process from Next's
 * instrumentation hook, which does not run during page-data collection.
 */
export async function migrateDb(url: string | undefined): Promise<void> {
  const db = getDb(url);
  const migrationsFolder = migrationsDir();

  if (driverFor(url) === 'neon') {
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    await migrate(db as NeonDatabase<typeof schema>, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder });
  }
}
