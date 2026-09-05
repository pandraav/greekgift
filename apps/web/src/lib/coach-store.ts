import 'server-only';

import { findPersona, type Persona } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { factsFor, type CoachText, type Review } from '@greekgift/engine';
import type { Audience } from '@greekgift/db';
import { and, eq, inArray } from 'drizzle-orm';

import { writeCoachText } from '@/lib/coach';
import { db } from '@/lib/db';

/**
 * Coaching notes, written once and kept.
 *
 * A note costs a model call, so it is cached by the three things it actually
 * depends on — the game, the move, and the persona. Change the voice and you
 * get a new row; ask for the same voice again and you get the same words,
 * which also means two friends reading the same game read the same review.
 */

export async function getCoachTexts(
  gameId: string,
  personaId: string,
  plies?: number[],
): Promise<Record<number, CoachText>> {
  const rows = await db
    .select({ ply: schema.coachTexts.ply, data: schema.coachTexts.data })
    .from(schema.coachTexts)
    .where(
      and(
        eq(schema.coachTexts.gameId, gameId),
        eq(schema.coachTexts.personaId, personaId),
        ...(plies && plies.length > 0 ? [inArray(schema.coachTexts.ply, plies)] : []),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.ply, r.data as CoachText]));
}

/**
 * The note for one move, written if it does not exist yet.
 *
 * `audience` is the reader's own setting, and it is the one thing about a
 * review that is not shared — which is also why it is not part of the cache
 * key. Two readers at different levels get whichever note was written first.
 * That is a deliberate trade: a third dimension on the key would triple the
 * model spend to serve a handful of friends.
 */
export async function ensureCoachText(
  review: Review,
  ply: number,
  personaId: string,
  options: { audience?: Audience; playerName?: string } = {},
): Promise<CoachText> {
  const persona: Persona = findPersona(personaId);

  const existing = await getCoachTexts(review.gameId, persona.id, [ply]);
  const cached = existing[ply];
  if (cached) return cached;

  const facts = factsFor(review, ply, {
    ...(options.audience ? { audience: options.audience } : {}),
  });

  const { text, reason } = await writeCoachText({
    persona,
    facts,
    ...(options.playerName ? { playerName: options.playerName } : {}),
  });

  if (reason) {
    // Worth knowing how often the model is refused, and why. Never shown to
    // the reader — the card already says the note is a template.
    console.warn(`[coach] ${review.gameId} ply ${ply} fell back: ${reason}`);
  }

  await db
    .insert(schema.coachTexts)
    .values({
      gameId: review.gameId,
      ply,
      personaId: persona.id,
      data: text,
      source: text.source,
      ...(text.model ? { model: text.model } : {}),
    })
    .onConflictDoNothing();

  return text;
}
