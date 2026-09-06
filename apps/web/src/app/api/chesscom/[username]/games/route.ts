import { schema } from '@greekgift/db';
import { desc, eq, or } from 'drizzle-orm';

import {
  ChesscomError,
  isValidUsername,
  normaliseUsername,
} from '@/lib/chesscom';
import { db } from '@/lib/db';
import { guardApproved } from '@/lib/guards';
import { importRecent } from '@/lib/import';

/** Up to twelve monthly archives, fetched serially at chess.com's request. */
export const maxDuration = 60;

/**
 * GET /api/chesscom/[username]/games?months=3&refresh=1
 *
 * Reads our mirror of a player's games, importing first when we hold none —
 * or when `refresh` asks for it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const { username: raw } = await params;
  if (!isValidUsername(raw)) {
    return Response.json({ error: 'bad_username' }, { status: 400 });
  }
  const username = normaliseUsername(raw);

  const url = new URL(request.url);
  const months = Math.min(
    Math.max(Number(url.searchParams.get('months') ?? 1) || 1, 1),
    12,
  );
  const refresh = url.searchParams.get('refresh') === '1';

  const mine = or(
    eq(schema.games.whiteUsername, username),
    eq(schema.games.blackUsername, username),
  );

  let imported: Awaited<ReturnType<typeof importRecent>>['imported'] = [];

  const existing = await db.select({ id: schema.games.id }).from(schema.games).where(mine);

  if (refresh || existing.length === 0) {
    try {
      ({ imported } = await importRecent(username, months));
    } catch (error) {
      if (error instanceof ChesscomError) {
        return Response.json(
          { error: 'chesscom', message: error.message },
          { status: error.status === 404 ? 404 : 502 },
        );
      }
      throw error;
    }
  }

  const games = await db
    .select({
      id: schema.games.id,
      url: schema.games.url,
      endTime: schema.games.endTime,
      timeClass: schema.games.timeClass,
      timeControl: schema.games.timeControl,
      rated: schema.games.rated,
      result: schema.games.result,
      eco: schema.games.eco,
      opening: schema.games.opening,
      plies: schema.games.plies,
      whiteName: schema.games.whiteName,
      whiteRating: schema.games.whiteRating,
      whiteResult: schema.games.whiteResult,
      blackName: schema.games.blackName,
      blackRating: schema.games.blackRating,
      blackResult: schema.games.blackResult,
      ccAccuracyWhite: schema.games.ccAccuracyWhite,
      ccAccuracyBlack: schema.games.ccAccuracyBlack,
    })
    .from(schema.games)
    .where(mine)
    .orderBy(desc(schema.games.endTime))
    .limit(200);

  return Response.json({ username, imported, count: games.length, games });
}
