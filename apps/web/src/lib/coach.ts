import 'server-only';

import { renderCoachText, seedFor, type Persona } from '@greekgift/coach';
import type { CoachText, MoveFacts } from '@greekgift/engine';

/**
 * Writing one coaching note.
 *
 * The engine has already decided what is true and the coach package has
 * already decided which of it is worth saying and how it sounds — this is
 * just the call. It is a pure function of the facts, the persona, and a seed
 * derived from the game, move, and voice, so it never fails and never needs
 * a fallback.
 */

export interface WriteOptions {
  gameId: string;
  persona: Persona;
  facts: MoveFacts;
}

export function writeCoachText(options: WriteOptions): CoachText {
  const { gameId, persona, facts } = options;
  return renderCoachText(facts, persona, facts.audience, seedFor(gameId, facts.ply, persona.id));
}
