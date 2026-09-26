import 'server-only';

import { COACH_VERSION, findPersona, type Persona } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { audienceFor, factsFor, type CoachText, type Color, type Review } from '@greekgift/engine';
import type { Audience } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import { perspectiveKey, writeCoachText, type PerspectiveKey } from '@/lib/coach';
import { db } from '@/lib/db';

/**
 * Coaching notes, written once and kept.
 *
 * Rendering is free and instant, so a whole game is written in one go the
 * first time anyone opens it in a voice, and the notes are cached by the
 * things they depend on — the game, the move, the persona, the audience, the
 * reader's side and the review they were written from — so two friends
 * reading the same game in the same voice, at the same depth, from the same
 * side, read the same words.
 *
 * Rows with an empty perspective or review key are legacy notes, written in
 * the old "you are the mover" voice about an older review. They are kept and
 * never read.
 */

/**
 * Which review a note describes, and in which version of the coach's prose:
 * `${nodes}:${engineBuild}:c${COACH_VERSION}`. Folding the prose version in
 * here means a wording fix is served at once, with no migration and nothing
 * deleted; the old rows simply stop matching.
 */
export function reviewKeyOf(review: Pick<Review, 'nodes' | 'engineBuild'>): string {
  return `${review.nodes}:${review.engineBuild}:c${COACH_VERSION}`;
}

export async function getCoachTexts(
  gameId: string,
  personaId: string,
  audience: Audience,
  perspective: PerspectiveKey,
  reviewKey: string,
): Promise<Record<number, CoachText>> {
  const rows = await db
    .select({ ply: schema.coachTexts.ply, data: schema.coachTexts.data })
    .from(schema.coachTexts)
    .where(
      and(
        eq(schema.coachTexts.gameId, gameId),
        eq(schema.coachTexts.personaId, personaId),
        eq(schema.coachTexts.audience, audience),
        eq(schema.coachTexts.perspective, perspective),
        eq(schema.coachTexts.reviewKey, reviewKey),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.ply, r.data as CoachText]));
}

/**
 * Every move's note for one voice, one depth and one side, written where
 * missing.
 *
 * A game is a few dozen moves and a note takes well under a millisecond, so
 * there is nothing to gain from writing them one at a time and something to
 * lose: a reader stepping through a game should never wait on a button.
 *
 * `perspective` is the member's side ('w' / 'b'), or null for a neutral
 * reader. It is required: omitting it would write the legacy voice.
 */
export async function ensureCoachTexts(
  review: Review,
  personaId: string,
  options: { audience?: Audience; rating?: number; perspective: Color | null },
): Promise<Record<number, CoachText>> {
  const persona: Persona = findPersona(personaId);
  const audience = options.audience ?? audienceFor(options.rating);
  const perspective = options.perspective;
  const key = perspectiveKey(perspective);
  const reviewKey = reviewKeyOf(review);

  const texts = await getCoachTexts(review.gameId, persona.id, audience, key, reviewKey);
  const missing = review.moves.filter((m) => !texts[m.ply]);
  if (missing.length === 0) return texts;

  const written = missing.map((m) => {
    const facts = factsFor(review, m.ply, { audience, perspective });
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
        perspective: key,
        reviewKey,
        data: text,
        source: text.source,
      })),
    )
    .onConflictDoNothing();

  for (const text of written) texts[text.ply] = text;
  return texts;
}
