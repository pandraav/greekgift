/**
 * Compiles lichess's opening book into a lookup this package can ship.
 *
 * Run by hand when the upstream book changes — the output is committed,
 * because a build should not depend on GitHub being up, and the book moves
 * about once a year.
 *
 *   node scripts/build-openings.mjs
 *
 * Source: https://github.com/lichess-org/chess-openings (CC0)
 */
import { writeFile } from 'node:fs/promises';
import { Chess } from 'chess.js';

const FILES = ['a', 'b', 'c', 'd', 'e'];
const BASE =
  'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

/** Position without the halfmove/fullmove counters — what identifies a position. */
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

const book = {};
let rows = 0;
let failed = 0;

for (const file of FILES) {
  const tsv = await fetch(`${BASE}/${file}.tsv`).then((r) => r.text());
  for (const line of tsv.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    rows++;
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const ply = chess.history().length;
      // Longer lines win: the most specific name for a position is the useful one.
      const key = epd(chess.fen());
      const existing = book[key];
      if (!existing || ply > existing[2]) book[key] = [eco, name, ply];
    } catch {
      failed++;
    }
  }
}

await writeFile(
  new URL('../src/data/openings.json', import.meta.url),
  JSON.stringify(book),
);

const bytes = JSON.stringify(book).length;
console.log(
  `  ${Object.keys(book).length} positions from ${rows} rows` +
    `${failed ? ` (${failed} unreadable)` : ''}, ${(bytes / 1024).toFixed(0)} KB`,
);
