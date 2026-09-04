/**
 * Runs once per server process, before any request. Next does not call this
 * during `next build`'s page-data collection, which makes it the only safe
 * place to touch PGlite: a second process opening the same data directory
 * corrupts it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { migrateDb, driverFor } = await import('@greekgift/db');
  const { env } = await import('@/env');

  const driver = driverFor(env.DATABASE_URL);
  if (driver !== 'pglite') return; // Neon uses `pnpm db:migrate` in deploy.

  await migrateDb(env.DATABASE_URL);
  console.log('[db] pglite ready, migrations applied');
}
