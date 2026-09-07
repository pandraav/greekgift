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

/** A stable seed: the same game, move and voice always render the same note. */
export function seedFor(gameId: string, ply: number, personaId: string): number {
  let h = 2166136261;
  for (const ch of `${gameId}:${ply}:${personaId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
