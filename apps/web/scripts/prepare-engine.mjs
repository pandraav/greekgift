/**
 * Copies the Stockfish worker into public/engine.
 *
 * The build ships as a self-contained pair — a small JS loader that detects it
 * is running as a Worker, and a wasm blob with the neural network already
 * inside it. Which flavour matters enormously:
 *
 *   stockfish-18.wasm              107.8 MB   needs cross-origin isolation
 *   stockfish-18-single.wasm       107.7 MB
 *   stockfish-18-lite.wasm           6.7 MB   needs cross-origin isolation
 *   stockfish-18-lite-single.wasm    6.9 MB   ← 5.4 MB gzipped, no headers
 *
 * The lite single-threaded build is what upstream recommends and is the only
 * one whose first load is not punishing. It needs no SharedArrayBuffer, so no
 * COOP/COEP headers, which is what makes it deployable on Vercel unchanged.
 *
 * The files are copied rather than committed: the version is pinned by
 * package.json, and 7 MB does not belong in git.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const BUILD = 'stockfish-18-lite-single';

const from = dirname(require.resolve('stockfish/package.json'));
const out = join(import.meta.dirname, '..', 'public', 'engine');

await mkdir(out, { recursive: true });

for (const ext of ['js', 'wasm']) {
  const src = join(from, 'bin', `${BUILD}.${ext}`);
  const dst = join(out, `${BUILD}.${ext}`);
  await copyFile(src, dst);
  const { size } = await stat(dst);
  console.log(`  engine: ${BUILD}.${ext} → public/engine (${(size / 1048576).toFixed(1)} MB)`);
}
