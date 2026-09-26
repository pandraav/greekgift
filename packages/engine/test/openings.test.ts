import { describe, expect, it } from 'vitest';

import book from '../src/data/openings.json' with { type: 'json' };
import {
  BOOK_GAP_MAX_PLY,
  BOOK_MAX_GAP,
  findOpening,
  openingCount,
  toEpd,
} from '../src/openings.ts';
import { parsePgn } from '../src/pgn.ts';

/** Rule g (criterion 7g): book is the consecutive run from the start. */

const BOOK = book as unknown as Record<string, [string, string, number]>;
const inBook = (fen: string) => BOOK[toEpd(fen)] !== undefined;

const fensOf = (moves: string) =>
  parsePgn(`[White "a"]
[Black "b"]

${moves} *`).fens;

describe('findOpening (rule g)', () => {
  it('counts only named positions', () => {
    const named = Object.values(BOOK).filter((e) => e[1] !== '').length;
    expect(openingCount).toBe(named);
    expect(openingCount).toBeGreaterThan(3000);
    expect(Object.keys(BOOK).length).toBeGreaterThan(openingCount);
  });

  it('an unnamed prefix position continues the run', () => {
    // In the Najdorf, the positions after 4.Nxd4 and 6.Nc3 are named by no
    // line — they are only on the way to named ones — and are still theory.
    const fens = fensOf('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6');
    expect(BOOK[toEpd(fens[7]!)]?.[1]).toBe('');
    expect(BOOK[toEpd(fens[9]!)]?.[1]).toBe('');
    const found = findOpening(fens)!;
    expect(found.lastBookPly).toBe(10);
    expect(found.name).toMatch(/Najdorf/);
  });

  it('a run ending on an unnamed prefix takes the name of the deepest named one', () => {
    const fens = fensOf('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Qb6');
    const found = findOpening(fens)!;
    expect(found.lastBookPly).toBeGreaterThanOrEqual(9);
    expect(found.name).toMatch(/Sicilian/);
  });

  it('bridges a short gap into named theory reached by transposition', () => {
    // /g/173953106852: 1.d4 e6 2.Bf4 d5 3.Nf3 is the London System with ...e6
    // by another move order. Lichess's book lists the positions after 1.d4,
    // 1...e6 and 3.Nf3, but not after 2.Bf4 or 2...d5 (a 2-ply gap), and none
    // after 3...c5, 4.c3, 4...Nc6, 5.e3 or 5...Nf6 (plies 6–10); 6.Nbd2 is
    // book again at ply 11, after a 5-ply gap. So the most this data can
    // support is ply 5 (3.Nf3), not chess.com's ply 10.
    const fens = fensOf('1. d4 e6 2. Bf4 d5 3. Nf3 c5 4. c3 Nc6 5. e3 Nf6 6. Nbd2 Bd6');
    expect([1, 2, 5, 11].every((i) => inBook(fens[i]!))).toBe(true);
    expect([3, 4, 6, 7, 8, 9, 10].some((i) => inBook(fens[i]!))).toBe(false);
    const found = findOpening(fens)!;
    expect(found.lastBookPly).toBe(5);
    expect(found.name).toMatch(/London System/);
  });

  it('a lone book position after a 3+-ply gap does not extend the book', () => {
    // Italian to 3...Bc5 (ply 6); 4.Ng1 Nf6 5.Nf3 leave theory for three
    // plies; 5...Ng8 lands on a book position (the Italian after 3.Bc4 Nc6…
    // by an absurd road) — ignored.
    const fens = fensOf('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Ng1 Nf6 5. Nf3 Ng8');
    expect(inBook(fens[6]!)).toBe(true);
    expect([7, 8, 9].some((i) => inBook(fens[i]!))).toBe(false);
    expect(inBook(fens[10]!)).toBe(true);
    expect(findOpening(fens)!.lastBookPly).toBe(6);
  });

  it('bridges at most two plies, and only up to ply 24', () => {
    expect(BOOK_MAX_GAP).toBe(2);
    expect(BOOK_GAP_MAX_PLY).toBe(24);
  });

  it('names the deepest named entry inside the run', () => {
    const fens = fensOf('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. Nh4');
    const found = findOpening(fens)!;
    expect(found.eco).toMatch(/^C7/);
    expect(found.name).toMatch(/Ruy Lopez|Spanish/i);
    expect(found.lastBookPly).toBe(8);
  });

  it('has no run when the first move is not book', () => {
    expect(findOpening(['8/8/8/4k3/8/4K3/8/8 w - - 0 1', '8/8/8/4k3/8/3K4/8/8 b - - 1 1'])).toBeUndefined();
  });
});
