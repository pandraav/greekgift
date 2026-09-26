/**
 * The Node-only half of `instrumentation.ts`. Next compiles the instrumentation
 * entry for the Edge runtime too, and `process.once`/`process.on` there are a
 * build-time warning apiece; imported dynamically from the nodejs branch, this
 * module is never part of the Edge bundle.
 */

/**
 * Whether this process has already been given exit handlers. `register()` is
 * called once per process, but a module can be evaluated more than once in a
 * dev server — a production Next server hands every route its own copy — and
 * two SIGINT handlers closing the same store is not something to find out
 * about at Ctrl+C. Hung off `globalThis`, like `packages/db`'s handle cache,
 * so the guard is per-process rather than per-bundle.
 */
const REGISTERED_KEY = Symbol.for('greekgift.pglite.shutdown');

/** Closes the PGlite store for `url` when the process is on its way out. */
export async function registerPgliteShutdown(url: string) {
  const slot = globalThis as Record<symbol, unknown>;
  if (slot[REGISTERED_KEY]) return;
  slot[REGISTERED_KEY] = true;

  const { closeDb } = await import('@greekgift/db');

  // PGlite flushes to disk on close; without this the last writes are lost
  // and the store aborts the wasm runtime when the next server opens it.
  // Next dev runs the app in a worker child, so `register()` — and therefore
  // this handler — lives in whichever process actually owns the store.
  const close = async () => {
    try {
      await closeDb(url);
    } catch {
      // Exiting anyway; a store that will not close is not worth a stack trace.
    }
  };
  const onSignal = () => {
    void close().then(() => process.exit(0));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.on('beforeExit', () => {
    void close();
  });
}
