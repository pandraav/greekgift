import type { CoachText, MoveFacts } from '@greekgift/engine';

import type { Persona } from './personas.ts';
import { plan } from './plan.ts';
import { realise } from './realise/index.ts';
import { grammarFor } from './voices/index.ts';

/**
 * The coach, as a function.
 *
 * Facts in, five slots out, in the persona's voice, at the reader's depth.
 * Never throws and never leaves a slot empty: there is nothing to fall back
 * to, because there is nothing that can fail.
 */
export function renderCoachText(
  facts: MoveFacts,
  persona: Persona,
  audience: MoveFacts['audience'],
  seed: number,
): CoachText {
  return realise(plan(facts, audience), grammarFor(persona.id), seed);
}

/**
 * The coach's prose version. Bump it whenever a change alters the note an
 * existing seed renders: stored notes are keyed by it (through the web
 * store's review key), so readers stop being served the old wording without
 * a migration or a delete.
 *
 * 2: perspective voices; a played move no longer inherits the best move's
 *    capture; no "came out better in material" on a losing move.
 * 3: retrospective tense; errors explained by the refutation line and the
 *    better line (review-overhaul design §13).
 * 4: lessons follow the refutation's tactic; win percentages carry "%" and
 *    a subject; no "Better was" under the card's own "Better was" label.
 * 5: the clock: fast, long-think and time-trouble errors, and how the game
 *    ended on the last ply (review-overhaul design §14.5).
 * 6: a notable clock is mandatory in every voice.
 */
export const COACH_VERSION = 7;

/**
 * A stable seed: the same game, move and voice always render the same note.
 * The reader's side joins the hash when given ('w' | 'b' | 'n'), so the three
 * perspectives vary independently; without it the legacy seed is unchanged.
 */
export function seedFor(
  gameId: string,
  ply: number,
  personaId: string,
  perspective?: 'w' | 'b' | 'n',
): number {
  let h = 2166136261;
  const key = `${gameId}:${ply}:${personaId}${perspective ? `:${perspective}` : ''}`;
  for (const ch of key) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
