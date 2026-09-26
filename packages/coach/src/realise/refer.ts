import type { Color, PieceRef } from '@greekgift/engine';

import type { Lexicon, Voice } from '../contracts.ts';

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
const PLACEHOLDER = /([RSMV])\|([^]*)/g;

export interface ReferrerOptions {
  lexicon: Lexicon;
  preferHere: boolean;
  /** Destination square of the played move, for `preferHere`. */
  playedSquare?: string;
  /** The reader's side; null for a neutral reader who owns nothing. */
  viewer: Color | null;
  /** Who moved; needed only to name the mover (`mover()`). Defaults to the viewer. */
  moverColor?: Color;
  /** How the mover is addressed; 'self' when not given. */
  voice?: Voice;
}

const colorName = (c: Color): string => (c === 'w' ? 'White' : 'Black');

const keyOf = (p: PieceRef): string => `${p.color}${p.piece}${p.square}`;

export class Referrer {
  private counts = new Map<string, number>();
  private byType = new Map<string, Map<string, PieceRef>>();
  private squares = new Set<string>();
  private last: string | null = null;
  /** Whether "your opponent" has been said, so later mentions are "they". */
  private moverNamed = false;
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

  /**
   * A placeholder for the mover as a subject: "you" (or the persona's
   * address), "your opponent" then "they", or "White"/"Black".
   */
  mover(): string {
    return `${MARK}V|mover${MARK}`;
  }

  /** The mover's possessive: "your", "their", or "White's"/"Black's". */
  moverPossessive(): string {
    const voice = this.opts.voice ?? 'self';
    if (voice === 'self') return 'your';
    if (voice === 'opponent') return 'their';
    return `${colorName(this.opts.moverColor ?? 'w')}'s`;
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
    c.moverNamed = this.moverNamed;
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
        case 'V':
          return this.resolveMover();
        default:
          return payload;
      }
    });
  }

  private name(piece: PieceRef): string {
    return this.opts.lexicon.pieceNames[piece.piece] ?? piece.piece.toLowerCase();
  }

  private owner(piece: PieceRef): string {
    const viewer = this.opts.viewer;
    if (viewer === null) return `${colorName(piece.color)}'s`;
    return piece.color === viewer ? 'your' : 'their';
  }

  private resolveMover(): string {
    const voice = this.opts.voice ?? 'self';
    if (voice === 'self') return this.opts.lexicon.address || 'you';
    if (voice === 'neutral') return colorName(this.opts.moverColor ?? 'w');
    if (this.moverNamed) return 'they';
    this.moverNamed = true;
    return 'your opponent';
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
