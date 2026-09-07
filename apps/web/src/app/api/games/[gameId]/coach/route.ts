import { DEFAULT_PERSONA_ID, PERSONAS } from '@greekgift/coach';

import { db } from '@/lib/db';
import { schema, type Audience } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { ensureCoachTexts } from '@/lib/coach-store';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { guardApproved } from '@/lib/guards';
import { getReview } from '@/lib/review-store';

/**
 * The coach, for the whole game.
 *
 * One request returns a note for every move in the chosen voice at the
 * reader's depth, writing whatever is not cached yet. Rendering is a pure,
 * instant function of facts already on hand, so there is nothing to wait for
 * and nothing to time out.
 */

const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id));
const AUDIENCES: Audience[] = ['beginner', 'intermediate', 'advanced'];

async function readerAudience(userId: string): Promise<Audience> {
  const [profile] = await db
    .select({ audience: schema.userProfiles.audience })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId))
    .limit(1);
  return profile?.audience ?? 'intermediate';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { gameId } = await params;
  const url = new URL(request.url);
  const requested = url.searchParams.get('persona') ?? DEFAULT_PERSONA_ID;
  const personaId = PERSONA_IDS.has(requested) ? requested : DEFAULT_PERSONA_ID;

  // How much gets explained is the reader's setting, not the player's rating:
  // someone rated 1000 reading a grandmaster game still wants it spelled out.
  const requestedAudience = url.searchParams.get('audience');
  const audience: Audience = AUDIENCES.includes(requestedAudience as Audience)
    ? (requestedAudience as Audience)
    : await readerAudience(guarded.user.id);

  const review = await getReview(gameId, {
    nodes: ANALYSIS_NODES,
    engineBuild: ENGINE_BUILD,
  });
  if (!review) {
    return Response.json({ error: 'not_reviewed' }, { status: 404 });
  }

  return Response.json({
    personaId,
    audience,
    texts: await ensureCoachTexts(review, personaId, { audience }),
  });
}
