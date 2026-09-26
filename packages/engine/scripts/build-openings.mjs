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

/**
 * Every prefix position of every named line is book (review-overhaul §4.9):
 * 1.d4 d5 2.Bf4 is named, and the position after 1.d4 d5 is theory on the
 * way there even when no line stops at it. A named position is stored as
 * `[eco, name, ply]`; an unnamed prefix as `[eco, '', ply]`, with the ECO of
 * the shortest named line through it. A named entry always wins over an
 * unnamed one; between two named ones the longer line wins, because the most
 * specific name for a position is the useful one.
 */
const book = {};
let rows = 0;
let failed = 0;

const put = (key, entry) => {
  const existing = book[key];
  if (!existing) {
    book[key] = entry;
    return;
  }
  const named = entry[1] !== '';
  const existingNamed = existing[1] !== '';
  if (named && !existingNamed) book[key] = entry;
  else if (named && existingNamed && entry[3] > existing[3]) book[key] = entry;
  else if (!named && !existingNamed && entry[3] < existing[3]) book[key] = entry;
};

for (const file of FILES) {
  const tsv = await fetch(`${BASE}/${file}.tsv`).then((r) => {
    if (!r.ok) throw new Error(`${file}.tsv: HTTP ${r.status}`);
    return r.text();
  });
  for (const line of tsv.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    rows++;
    try {
      const full = new Chess();
      full.loadPgn(pgn);
      const moves = full.history();
      const length = moves.length;
      // Walk the line: every position on the way is book. The fourth slot is
      // the length of the line it came from, used only to pick between
      // entries here, and dropped before writing.
      const chess = new Chess();
      moves.forEach((san, i) => {
        chess.move(san);
        const ply = i + 1;
        const key = epd(chess.fen());
        if (ply === length) put(key, [eco, name, ply, length]);
        else put(key, [eco, '', ply, length]);
      });
    } catch {
      failed++;
    }
  }
}

for (const key of Object.keys(book)) book[key] = book[key].slice(0, 3);

await writeFile(
  new URL('../src/data/openings.json', import.meta.url),
  JSON.stringify(book),
);

const bytes = JSON.stringify(book).length;
const named = Object.values(book).filter((e) => e[1] !== '').length;
console.log(
  `  ${Object.keys(book).length} positions (${named} named) from ${rows} rows` +
    `${failed ? ` (${failed} unreadable)` : ''}, ${(bytes / 1024).toFixed(0)} KB`,
);
