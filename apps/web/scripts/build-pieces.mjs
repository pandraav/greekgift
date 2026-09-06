/**
 * Compiles the Cburnett piece set into a module the board can import.
 *
 * The SVGs live in `docs/design/pieces/` and are collected in `pieces.json`,
 * which is also what the HTML prototype loads — one source for both, so the
 * prototype and the app can never end up with different pieces.
 *
 * Kept as markup strings rather than JSX: they are a fixed asset with no props
 * and no interpolation, and twelve hand-converted trees would be twelve
 * chances to mistype a path.
 *
 *   node scripts/build-pieces.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const SOURCE = join(root, 'docs/design/pieces.json');
const OUT = join(root, 'apps/web/src/components/board/pieces.ts');

/** King first, then down the value order, White before Black. */
const ORDER = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

const pieces = JSON.parse(readFileSync(SOURCE, 'utf8'));

const missing = ORDER.filter((key) => !pieces[key]);
if (missing.length > 0) {
  throw new Error(`pieces.json is missing: ${missing.join(', ')}`);
}

const q = String.fromCharCode(39);
const out = [
  '/**',
  " * Cburnett's pieces (CC BY-SA 3.0 / BSD-3 option), the set chess.com and",
  ' * lichess both grew up with — the shapes a player already reads without',
  ' * thinking.',
  ' *',
  ' * Kept as markup strings rather than components: they are a fixed local',
  ' * asset with no props and no interpolation, and twelve hand-converted JSX',
  ' * trees would be twelve chances to mistype a path.',
  ' *',
  ' * Generated from docs/design/pieces.json by apps/web/scripts/build-pieces.mjs.',
  ' * Do not edit — change the source and rebuild.',
  ' */',
  '',
  'export type PieceKey =',
  ...ORDER.map((k, i) => `  | ${q}${k}${q}` + (i === ORDER.length - 1 ? ';' : '')),
  '',
  'export const PIECES: Record<PieceKey, string> = {',
  ...ORDER.map((k) => `  ${k}: ${JSON.stringify(pieces[k])},`),
  '};',
  '',
  '/** chess.js reports a colour and a lowercase type; the sprites are keyed wN. */',
  'export const pieceKey = (color: string, type: string): PieceKey =>',
  '  (color + type.toUpperCase()) as PieceKey;',
  '',
].join('\n');

writeFileSync(OUT, out);
console.log(`${ORDER.length} pieces → ${relative(process.cwd(), OUT)}`);
