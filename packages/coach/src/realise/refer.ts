import type { Color, PieceRef } from '@greekgift/engine';

import type { Lexicon } from '../contracts.ts';

/**
 * Referring expressions.
 *
 * A frame does not know which of its variants will be chosen, so `refer`,
 * `square` and `move` hand back placeholders rather than words. Once a variant
 * is picked, `resolve` walks the sentence left to right and decides, in the
 * order the reader will meet them, whether a piece is "the knight on d7", "it"
 * or "the knight", and whether a square has already been said. State lives for
 * one note; `last` is cleared at each slot so no slot opens with a bare "It".
 */

const MARK = '';
const PLACEHOLDER = /([RSM])\|([^]*)/g;

export interface ReferrerOptions {
  lexicon: Lexicon;
  preferHere: boolean;
  /** Destination square of the played move, for `preferHere`. */
  playedSquare?: string;
  moverColor: Color;
}

const keyOf = (p: PieceRef): string => `${p.color}${p.piece}${p.square}`;

export class Referrer {
  private counts = new Map<string, number>();
  private byType = new Map<string, Map<string, PieceRef>>();
  private squares = new Set<string>();
  private last: string | null = null;
  private readonly opts: ReferrerOptions;

  constructor(opts: ReferrerOptions) {
    this.opts = opts;
  }

  /** A placeholder for a piece; resolved in reading order by `resolve`. */
  refer(piece: PieceRef): string {
    return `${MARK}R|${piece.color}|${piece.piece}|${piece.square}${MARK}`;
  }

  square(sq: string): string {
    return `${MARK}S|${sq}${MARK}`;
  }

  move(san: string): string {
    return `${MARK}M|${san}${MARK}`;
  }

  /** Start of a new slot: a pronoun may not reach back across the gap. */
  newSlot(): void {
    this.last = null;
  }

  clone(): Referrer {
    const c = new Referrer(this.opts);
    c.counts = new Map(this.counts);
    c.byType = new Map([...this.byType].map(([k, v]) => [k, new Map(v)]));
    c.squares = new Set(this.squares);
    c.last = this.last;
    return c;
  }

  /** Replace every placeholder in reading order, advancing the mention state. */
  resolve(text: string): string {
    return text.replace(PLACEHOLDER, (_m, kind: string, payload: string) => {
      switch (kind.toUpperCase()) {
        case 'R': {
          const [color, piece, square] = payload.split('|');
          if (!color || !piece || !square) return payload;
          return this.resolvePiece({
            color: color.toLowerCase() as Color,
            piece: piece.toUpperCase() as PieceRef['piece'],
            square: square.toLowerCase(),
          });
        }
        case 'S':
          return this.resolveSquare(payload.toLowerCase());
        default:
          return payload;
      }
    });
  }

  private name(piece: PieceRef): string {
    return this.opts.lexicon.pieceNames[piece.piece] ?? piece.piece.toLowerCase();
  }

  private owner(piece: PieceRef): string {
    return piece.color === this.opts.moverColor ? 'your' : 'their';
  }

  private resolvePiece(piece: PieceRef): string {
    const key = keyOf(piece);
    const seen = this.counts.get(key) ?? 0;
    const name = this.name(piece);
    let text: string;

    if (seen === 0) {
      text =
        this.opts.preferHere && piece.square === this.opts.playedSquare
          ? `the ${name} here`
          : `the ${name} on ${piece.square}`;
      this.squares.add(piece.square);
    } else if (this.last === key) {
      text = 'it';
    } else {
      const others = [...(this.byType.get(piece.piece)?.values() ?? [])].filter(
        (o) => keyOf(o) !== key,
      );
      if (others.length === 0) text = `the ${name}`;
      else if (others.every((o) => o.color !== piece.color)) text = `${this.owner(piece)} ${name}`;
      else text = `the ${name} on ${piece.square}`;
    }

    this.counts.set(key, seen + 1);
    const ofType = this.byType.get(piece.piece) ?? new Map<string, PieceRef>();
    ofType.set(key, piece);
    this.byType.set(piece.piece, ofType);
    this.last = key;
    return text;
  }

  private resolveSquare(sq: string): string {
    if (this.opts.preferHere && sq === this.opts.playedSquare) return 'here';
    if (this.squares.has(sq)) return 'that square';
    this.squares.add(sq);
    return sq;
  }
}

/** Anything left over, e.g. from a persona `shape` that called `ctx.refer`. */
export const hasPlaceholders = (s: string): boolean => s.includes(MARK);
