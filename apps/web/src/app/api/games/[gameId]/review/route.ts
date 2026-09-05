import { schema } from '@greekgift/db';
import { parsePgn, type PositionEval } from '@greekgift/engine';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { guardApproved } from '@/lib/guards';
import {
  getCachedEvals,
  getReview,
  ReviewInputError,
  saveReview,
} from '@/lib/review-store';

/**
 * The analysis cache, over HTTP.
 *
 * GET hands the browser everything it can be spared from computing: the
 * finished review if one exists, otherwise whichever positions have already
 * been evaluated. POST takes raw engine output back and builds the review
 * from it server-side.
 */

const scoreSchema = z
  .object({ cp: z.number().optional(), mate: z.number().optional() })
  .refine((s) => s.cp !== undefined || s.mate !== undefined, {
    message: 'a score is either cp or mate',
  });

const lineSchema = z.object({
  multipv: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  score: scoreSchema,
  pv: z.array(z.string().max(6)).max(120),
  depth: z.number().int().nonnegative(),
  nodes: z.number().int().nonnegative(),
});

const bodySchema = z.object({
  nodes: z.number().int().positive(),
  engineBuild: z.string().min(1).max(120),
  evals: z
    .array(
      z.object({
        fen: z.string().min(10).max(120),
        nodes: z.number().int().positive(),
        engineBuild: z.string().min(1).max(120),
        lines: z.array(lineSchema).max(3),
      }),
    )
    // Longest recorded competitive game is 269 moves; the ceiling is here to
    // bound the request, not to judge anyone's endgame technique.
    .min(1)
    .max(700),
});

const keyFrom = (url: URL) => ({
  nodes: Number(url.searchParams.get('nodes')) || ANALYSIS_NODES,
  engineBuild: url.searchParams.get('build') || ENGINE_BUILD,
});

async function loadGame(gameId: string) {
  const [game] = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);
  return game;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { gameId } = await params;
  const key = keyFrom(new URL(request.url));

  const game = await loadGame(gameId);
  if (!game) return Response.json({ error: 'not_found' }, { status: 404 });

  const review = await getReview(gameId, key);
  if (review) return Response.json({ review, cached: {}, ...key });

  const { fens } = parsePgn(game.pgn);
  const cached = await getCachedEvals(fens, key);

  return Response.json({ review: null, cached, ...key });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { gameId } = await params;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return Response.json(
      { error: 'bad_request', detail: parsedBody.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const { nodes, engineBuild, evals } = parsedBody.data;

  const game = await loadGame(gameId);
  if (!game) return Response.json({ error: 'not_found' }, { status: 404 });

  try {
    const review = await saveReview(game, evals as PositionEval[], {
      nodes,
      engineBuild,
    });
    return Response.json({ review, nodes, engineBuild });
  } catch (error) {
    if (error instanceof ReviewInputError) {
      return Response.json(
        { error: 'mismatched_analysis', detail: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}
