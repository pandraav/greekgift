import { DEFAULT_PERSONA_ID, PERSONAS } from '@greekgift/coach';

import { db } from '@/lib/db';
import { schema, type Audience } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { ensureCoachTexts } from '@/lib/coach-store';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { guardApproved } from '@/lib/guards';
import { canSeeGame } from '@/lib/library';
import { getReview } from '@/lib/review-store';

/**
 * The coach, for the whole game.
 *
 * One request returns a note for every move in the chosen voice at the
 * reader's depth, from the member's side, writing whatever is not cached yet. Rendering is a pure,
 * instant function of facts already on hand, so there is nothing to wait for
 * and nothing to time out.
 */

const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id));
const AUDIENCES: Audience[] = ['beginner', 'intermediate', 'advanced'];

/**
 * The reader's side: 'w' / 'b' reads the member's moves as "you", anything
 * else (including 'n' and a missing param) reads neutrally. The client picks
 * the voice only; access is checked separately and never trusts it.
 */
function parsePerspective(raw: string | null): 'w' | 'b' | null {
  return raw === 'w' || raw === 'b' ? raw : null;
}

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

  if (!(await canSeeGame(db, guarded.user, gameId))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get('persona') ?? DEFAULT_PERSONA_ID;
  const personaId = PERSONA_IDS.has(requested) ? requested : DEFAULT_PERSONA_ID;

  // How much gets explained is the reader's setting, not the player's rating:
  // someone rated 1000 reading a grandmaster game still wants it spelled out.
  const requestedAudience = url.searchParams.get('audience');
  const audience: Audience = AUDIENCES.includes(requestedAudience as Audience)
    ? (requestedAudience as Audience)
    : await readerAudience(guarded.user.id);

  const perspective = parsePerspective(url.searchParams.get('perspective'));

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
    perspective: perspective ?? 'n',
    texts: await ensureCoachTexts(review, personaId, { audience, perspective }),
  });
}
