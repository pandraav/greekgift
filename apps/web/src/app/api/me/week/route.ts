import { schema } from '@greekgift/db';
import { parsePgn } from '@greekgift/engine';
import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { guardApproved } from '@/lib/guards';
import { linkedUsernamesFor } from '@/lib/library';
import { weekWindow } from '@/lib/week';

/**
 * What the WeekReader should read: every game a linked account finished in
 * the last seven days that has no review at the current key, oldest first,
 * with the positions the engine will need. Nothing older, nothing unlinked.
 */
export async function GET() {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const usernames = await linkedUsernamesFor(db, guarded.user.id);
  const { since } = weekWindow();
  if (usernames.length === 0) return Response.json({ since, games: [] });

  const rows = await db
    .select({ id: schema.games.id, pgn: schema.games.pgn, white: schema.games.whiteUsername, black: schema.games.blackUsername })
    .from(schema.games)
    .leftJoin(
      schema.reviews,
      and(
        eq(schema.reviews.gameId, schema.games.id),
        eq(schema.reviews.nodes, ANALYSIS_NODES),
        eq(schema.reviews.engineBuild, ENGINE_BUILD),
      ),
    )
    .where(
      and(
        or(inArray(schema.games.whiteUsername, usernames), inArray(schema.games.blackUsername, usernames)),
        gte(schema.games.endTime, since),
        isNull(schema.reviews.gameId),
      ),
    )
    .orderBy(asc(schema.games.endTime));

  const games = rows.flatMap((g) => {
    try {
      return [{
        gameId: g.id,
        account: usernames.includes(g.white) ? g.white : g.black,
        fens: parsePgn(g.pgn).fens,
      }];
    } catch {
      return []; // an unreadable PGN is not the reader's problem
    }
  });

  return Response.json({ since, games });
}
