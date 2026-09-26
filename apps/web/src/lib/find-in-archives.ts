import 'server-only';

import { gameIdFromLink } from '@greekgift/engine';

import * as cc from '@/lib/chesscom';

/**
 * Finds one game by id in a player's archives, newest month first.
 *
 * Nothing is imported: this reads the cached month responses and returns the
 * one game, so pasting a link never drags a stranger's whole year into the
 * mirror. Twelve months is the ceiling because that is as far back as anyone
 * pastes.
 */
export async function findGameInArchives(
  username: string,
  id: string,
  maxMonths = 12,
): Promise<cc.ChesscomGame | null> {
  const archives = (await cc.archives(username)).slice().reverse().slice(0, maxMonths);
  for (const url of archives) {
    const games = await cc.monthGames(username, cc.monthOf(url));
    const hit = games.find((g) => gameIdFromLink(g.url) === id);
    if (hit) return hit;
  }
  return null;
}
