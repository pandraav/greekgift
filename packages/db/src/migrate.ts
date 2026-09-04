/**
 * `pnpm db:migrate` — for Neon.
 *
 * PGlite migrates in-process from Next's instrumentation hook instead: a
 * second process opening the same data directory corrupts it, so there must
 * be no reason to open it twice.
 */
import { driverFor, migrateDb } from './client.ts';

const url = process.env.DATABASE_URL;
console.log(`migrating (${driverFor(url)})…`);
await migrateDb(url);
console.log('migrations applied');
process.exit(0);
