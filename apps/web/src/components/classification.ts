import type { Classification } from '@greekgift/engine';

/**
 * How each classification looks, in one place.
 *
 * The glyph is the same everywhere it appears — on the board, in the notation,
 * in the tally — because a player learns one shape per class or none at all.
 */

export interface ClassStyle {
  label: string;
  /** HTML entity or character; rendered as markup so entities resolve. */
  glyph: string;
  /** A CSS custom property reference, so the palette stays in globals.css. */
  color: string;
}

export const CLASS_STYLE: Record<Classification, ClassStyle> = {
  brilliant: { label: 'Brilliant', glyph: '!!', color: 'var(--c-brilliant)' },
  great: { label: 'Great', glyph: '!', color: 'var(--c-great)' },
  book: { label: 'Book', glyph: '&#9635;', color: 'var(--c-book)' },
  best: { label: 'Best', glyph: '&#9733;', color: 'var(--c-best)' },
  excellent: { label: 'Excellent', glyph: '&#10022;', color: 'var(--c-excellent)' },
  good: { label: 'Good', glyph: '&#10003;', color: 'var(--c-good)' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: 'var(--c-inaccuracy)' },
  miss: { label: 'Miss', glyph: '&#10007;', color: 'var(--c-miss)' },
  mistake: { label: 'Mistake', glyph: '?', color: 'var(--c-mistake)' },
  blunder: { label: 'Blunder', glyph: '??', color: 'var(--c-blunder)' },
};

/** Best first, worst last — the order the tally and the legend both use. */
export const CLASS_ORDER: Classification[] = [
  'brilliant',
  'great',
  'book',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'miss',
  'mistake',
  'blunder',
];

/** The classes worth drawing an arrow for: something was actually missed. */
export const WORTH_AN_ARROW = new Set<Classification>([
  'inaccuracy',
  'miss',
  'mistake',
  'blunder',
]);
