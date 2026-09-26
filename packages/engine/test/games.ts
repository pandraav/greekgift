import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Review } from '../src/types.ts';

/** Real chess.com games (trimmed API rows), `fixtures/chesscom-games.json`. */
export interface ChesscomFixture {
  id: string;
  note: string;
  url: string;
  time_control: string;
  time_class: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
  pgn: string;
}

const dir = path.dirname(fileURLToPath(import.meta.url));

export const GAMES: ChesscomFixture[] = JSON.parse(
  readFileSync(path.join(dir, 'fixtures/chesscom-games.json'), 'utf-8'),
);

export const game = (id: string): ChesscomFixture => {
  const g = GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`no fixture ${id}`);
  return g;
};

export const resultsOf = (g: ChesscomFixture) => ({ white: g.white.result, black: g.black.result });

/** 184269442794 analysed at 300k nodes (`build-fixtures.mjs --clocked`). */
export const REFERENCE: Review = JSON.parse(
  readFileSync(path.join(dir, 'fixtures/clocked/184269442794.json'), 'utf-8'),
);

export const REFERENCE_ID = '184269442794';
export const INCREMENT_ID = '181475901715';
export const DAILY_ID = '1014147686';
