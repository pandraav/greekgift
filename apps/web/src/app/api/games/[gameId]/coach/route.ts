import { DEFAULT_PERSONA_ID, PERSONAS } from '@greekgift/coach';
import { z } from 'zod';

import { db } from '@/lib/db';
import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { ensureCoachText, getCoachTexts } from '@/lib/coach-store';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { guardApproved } from '@/lib/guards';
import { getReview } from '@/lib/review-store';

/**
 * The coach, one move at a time.
 *
 * Written on demand rather than for the whole game: most moves are never
 * looked at, and paying a model call for all sixty of them would be paying for
 * fifty-five nobody reads.
 */

/** The coach can take two 20 s model attempts; Vercel's legacy Hobby default is 10 s. */
export const maxDuration = 60;

const PERSONA_IDS = PERSONAS.map((p) => p.id);

const bodySchema = z.object({
  ply: z.number().int().positive(),
  personaId: z.string().refine((id) => PERSONA_IDS.includes(id), 'unknown persona'),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { gameId } = await params;
  const url = new URL(request.url);
  const personaId = url.searchParams.get('persona') ?? DEFAULT_PERSONA_ID;

  return Response.json({ personaId, texts: await getCoachTexts(gameId, personaId) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { gameId } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'bad_request', detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const { ply, personaId } = parsed.data;

  const review = await getReview(gameId, {
    nodes: ANALYSIS_NODES,
    engineBuild: ENGINE_BUILD,
  });
  if (!review) {
    return Response.json({ error: 'not_reviewed' }, { status: 404 });
  }
  if (!review.moves.some((m) => m.ply === ply)) {
    return Response.json({ error: 'no_such_move' }, { status: 404 });
  }

  // How much gets explained is the reader's setting, not the player's rating:
  // someone rated 1000 reading a grandmaster game still wants it spelled out.
  const [profile] = await db
    .select({ audience: schema.userProfiles.audience })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, guarded.user.id))
    .limit(1);

  const move = review.moves.find((m) => m.ply === ply)!;
  const summary = move.color === 'w' ? review.white : review.black;

  const text = await ensureCoachText(review, ply, personaId, {
    ...(profile ? { audience: profile.audience } : {}),
    playerName: summary.username,
  });

  return Response.json({ text, personaId });
}
