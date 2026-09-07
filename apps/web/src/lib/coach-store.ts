import 'server-only';

import { findPersona, type Persona } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { audienceFor, factsFor, type CoachText, type Review } from '@greekgift/engine';
import type { Audience } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import { writeCoachText } from '@/lib/coach';
import { db } from '@/lib/db';

/**
 * Coaching notes, written once and kept.
 *
 * Rendering is free and instant, so a whole game is written in one go the
 * first time anyone opens it in a voice, and the notes are cached by the four
 * things they depend on — the game, the move, the persona, and the audience —
 * so two friends reading the same game in the same voice at the same depth
 * read the same words.
 */

export async function getCoachTexts(
  gameId: string,
  personaId: string,
  audience: Audience,
): Promise<Record<number, CoachText>> {
  const rows = await db
    .select({ ply: schema.coachTexts.ply, data: schema.coachTexts.data })
    .from(schema.coachTexts)
    .where(
      and(
        eq(schema.coachTexts.gameId, gameId),
        eq(schema.coachTexts.personaId, personaId),
        eq(schema.coachTexts.audience, audience),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.ply, r.data as CoachText]));
}

/**
 * Every move's note for one voice and one depth, written where missing.
 *
 * A game is a few dozen moves and a note takes well under a millisecond, so
 * there is nothing to gain from writing them one at a time and something to
 * lose: a reader stepping through a game should never wait on a button.
 */
export async function ensureCoachTexts(
  review: Review,
  personaId: string,
  options: { audience?: Audience; rating?: number } = {},
): Promise<Record<number, CoachText>> {
  const persona: Persona = findPersona(personaId);
  const audience = options.audience ?? audienceFor(options.rating);

  const texts = await getCoachTexts(review.gameId, persona.id, audience);
  const missing = review.moves.filter((m) => !texts[m.ply]);
  if (missing.length === 0) return texts;

  const written = missing.map((m) => {
    const facts = factsFor(review, m.ply, { audience });
    return writeCoachText({ gameId: review.gameId, persona, facts });
  });

  await db
    .insert(schema.coachTexts)
    .values(
      written.map((text) => ({
        gameId: review.gameId,
        ply: text.ply,
        personaId: persona.id,
        audience,
        data: text,
        source: text.source,
      })),
    )
    .onConflictDoNothing();

  for (const text of written) texts[text.ply] = text;
  return texts;
}
