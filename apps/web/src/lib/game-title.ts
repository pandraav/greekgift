import type { Game } from '@greekgift/db';
import { formatTimeControl } from '@greekgift/engine';

import { openingFamily } from '@/lib/game-labels';

/** "Vardges_Tovmasian vs GothamChess" — how a game is named in emails and the bell. */
export const gameTitle = (game: Pick<Game, 'whiteName' | 'blackName'>): string =>
  `${game.whiteName} vs ${game.blackName}`;

/** "London System · rapid 10+0" */
export const gameSubtitle = (game: Pick<Game, 'opening' | 'timeClass' | 'timeControl'>): string =>
  `${openingFamily(game.opening) ?? 'Unnamed opening'} · ${game.timeClass} ${formatTimeControl(game.timeControl)}`;
