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

/**
 * The most specific named opening a game reached, and where it left theory.
 *
 * Walks forward through the positions and keeps the deepest match, so
 * "Sicilian Defense: Najdorf Variation, English Attack" wins over plain
 * "Sicilian Defense" — the specific name is the one worth showing.
 *
 * `fens` is the game's positions in order, starting from the initial one.
 */
export function findOpening(fens: string[]): OpeningMatch | undefined {
  let best: OpeningMatch | undefined;

  for (let i = 0; i < fens.length; i++) {
    const entry = BOOK[toEpd(fens[i]!)];
    if (entry) best = { eco: entry[0], name: entry[1], lastBookPly: i };
  }

  return best;
}

/** Was the position after `ply` half-moves still inside the book? */
export const isBookPly = (ply: number, lastBookPly: number): boolean =>
  ply <= lastBookPly;

export const openingCount = Object.keys(BOOK).length;
