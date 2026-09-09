import type { Game } from '@greekgift/db';

/** Words for a game row. Shared by the compact and rich rows and the week summary. */

export type Outcome = 'won' | 'drawn' | 'lost';

export const DRAW_RESULTS = new Set([
  'agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient',
]);

export function sideOf(game: Pick<Game, 'whiteUsername' | 'blackUsername'>, username: string): 'w' | 'b' | null {
  if (game.whiteUsername === username) return 'w';
  if (game.blackUsername === username) return 'b';
  return null;
}

/**
 * The two chess.com result codes from the member's seat.
 *
 * One place decides which seat that is, so "won" and "resigned" can never
 * disagree about it. A username that played neither side reads as Black,
 * which is what the callers have always done.
 */
function resultsFor(game: Game, username: string): { mine: string; theirs: string } {
  return game.whiteUsername === username
    ? { mine: game.whiteResult, theirs: game.blackResult }
    : { mine: game.blackResult, theirs: game.whiteResult };
}

export function outcomeFor(game: Game, username: string): Outcome {
  const { mine } = resultsFor(game, username);
  if (mine === 'win') return 'won';
  if (DRAW_RESULTS.has(mine)) return 'drawn';
  return 'lost';
}

/** "Closed Sicilian Defense, Fianchetto" → "Closed Sicilian Defense". */
export function openingFamily(opening: string | null | undefined): string | null {
  if (!opening) return null;
  const family = opening.split(',')[0]!.trim();
  return family || null;
}

const TERMINATIONS: Record<string, string> = {
  checkmated: 'checkmate',
  resigned: 'resigned',
  timeout: 'on time',
  // chess.com's catch-all for a loss with no more specific cause.
  lose: 'lost',
  abandoned: 'abandoned',
  agreed: 'agreed',
  repetition: 'repetition',
  stalemate: 'stalemate',
  insufficient: 'insufficient material',
  '50move': '50 moves',
  timevsinsufficient: 'time vs insufficient',
};

/** "resigned", "checkmate", "lost on time" — how it ended, from the member's seat. */
export function terminationLabel(game: Game, username: string): string {
  const { mine, theirs } = resultsFor(game, username);
  const code = mine === 'win' ? theirs : mine;
  const word = TERMINATIONS[code] ?? code;
  if (code === 'timeout') return mine === 'win' ? 'won on time' : 'lost on time';
  return word;
}
