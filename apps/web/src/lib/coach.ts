import 'server-only';

import { renderCoachText, seedFor, type Persona } from '@greekgift/coach';
import type { CoachText, MoveFacts } from '@greekgift/engine';

/**
 * Writing one coaching note.
 *
 * The engine has already decided what is true and the coach package has
 * already decided which of it is worth saying and how it sounds — this is
 * just the call. It is a pure function of the facts, the persona, and a seed
 * derived from the game, move, voice and the reader's side, so it never fails
 * and never needs a fallback.
 */

export interface WriteOptions {
  gameId: string;
  persona: Persona;
  facts: MoveFacts;
}

/** The stored key for a reader's side: 'w' / 'b', or 'n' for neutral. */
export type PerspectiveKey = 'w' | 'b' | 'n';

export function perspectiveKey(side: 'w' | 'b' | null): PerspectiveKey {
  return side ?? 'n';
}

export function writeCoachText(options: WriteOptions): CoachText {
  const { gameId, persona, facts } = options;
  // Legacy facts (no perspective) keep the legacy seed.
  const key = facts.perspective === undefined ? undefined : perspectiveKey(facts.perspective);
  return renderCoachText(facts, persona, facts.audience, seedFor(gameId, facts.ply, persona.id, key));
}
