import book from './data/openings.json' with { type: 'json' };

/**
 * Opening lookup against lichess's book (CC0), compiled by
 * `scripts/build-openings.mjs`.
 *
 * Positions are keyed by EPD — a FEN without the move counters — because two
 * games reaching the same position by different move orders are in the same
 * opening, and the counters would make them look different.
 */

type Entry = [eco: string, name: string, ply: number];
const BOOK = book as unknown as Record<string, Entry>;

/** A FEN reduced to the position itself. */
export const toEpd = (fen: string): string =>
  fen.split(' ').slice(0, 4).join(' ');

export interface OpeningMatch {
  eco: string;
  name: string;
  /**
   * Index of the last position still in the book, counted as a ply. 0 means
   * the players left theory immediately.
   */
  lastBookPly: number;
}

/** Longest run of consecutive non-book positions the book may bridge (§4.9). */
export const BOOK_MAX_GAP = 2;
/**
 * A gap may only be bridged into a book position at or before this ply: 24
 * is the 99th percentile of named-line length in lichess's book, so past it
 * a "book" position is a late transposition, not theory being followed.
 */
export const BOOK_GAP_MAX_PLY = 24;

/**
 * Where theory ran out, and the most specific name it reached on the way
 * (review-overhaul design §4.9).
 *
 * Book is the longest prefix of the game whose positions are in the book,
 * allowing short gaps: lichess's book stores every position of every named
 * line, but not every move order into them, so a game that reaches named
 * theory by transposition (1.d4 e6 2.Bf4 d5 3.Nf3 is the London with ...e6)
 * passes through a position or two the book never lists. The walk goes on
 * through at most `BOOK_MAX_GAP` consecutive non-book positions, and only
 * into a book position at ply ≤ `BOOK_GAP_MAX_PLY`; it stops at the first gap
 * that breaks either rule. `lastBookPly` is the last book position found, so
 * a lone book position after a long non-book stretch never counts.
 *
 * `name`/`eco` come from the deepest *named* entry inside the run, so
 * "Sicilian Defense: Najdorf Variation, English Attack" wins over plain
 * "Sicilian Defense". A run with no named entry has `name: ''`. No book
 * position at all is `undefined`.
 *
 * `fens` is the game's positions in order, starting from the initial one.
 */
export function findOpening(fens: string[]): OpeningMatch | undefined {
  let lastBookPly = 0;
  let deepest: Entry | undefined;
  let deepestNamed: Entry | undefined;

  for (let i = 1; i < fens.length; i++) {
    const entry = BOOK[toEpd(fens[i]!)];
    if (!entry) {
      if (i - lastBookPly > BOOK_MAX_GAP) break;
      continue;
    }
    const bridged = i - lastBookPly > 1;
    if (bridged && i > BOOK_GAP_MAX_PLY) break;
    lastBookPly = i;
    deepest = entry;
    if (entry[1] !== '') deepestNamed = entry;
  }

  if (lastBookPly === 0 || !deepest) return undefined;
  const source = deepestNamed ?? deepest;
  return { eco: source[0], name: deepestNamed ? deepestNamed[1] : '', lastBookPly };
}

/** Was the position after `ply` half-moves still inside the book? */
export const isBookPly = (ply: number, lastBookPly: number): boolean =>
  ply <= lastBookPly;

/** Named positions in the book; unnamed prefix positions are not counted. */
export const openingCount = Object.values(BOOK).filter((entry) => entry[1] !== '').length;
