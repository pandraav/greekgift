import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { ChesscomError, isValidUsername, normaliseUsername, type ChesscomGame } from '@/lib/chesscom';
import { fetchCallbackGame, normaliseCallback } from '@/lib/chesscom-callback';
import { db } from '@/lib/db';
import { findGameInArchives } from '@/lib/find-in-archives';
import { parseGameLink } from '@/lib/game-link';
import { guardApproved } from '@/lib/guards';
import { gameToRow } from '@/lib/import';
import { addToLibrary, membership } from '@/lib/library';

/** The archive walk can touch twelve months. */
export const maxDuration = 60;

async function store(game: ChesscomGame): Promise<string | null> {
  const row = gameToRow(game);
  if (!row) return null;
  await db.insert(schema.games).values(row).onConflictDoNothing();
  return row.id;
}

export async function POST(request: Request) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;
  const userId = guarded.user.id;

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; username?: unknown };
  const link = typeof body.url === 'string' ? parseGameLink(body.url) : null;
  if (!link) return Response.json({ error: 'bad_link' }, { status: 400 });

  const done = async (gameId: string) => {
    if (!(await membership(db, userId, gameId))) {
      await addToLibrary(db, userId, gameId, { source: 'link' });
    }
    return Response.json({ href: `/g/${gameId}`, gameId, inLibrary: true });
  };

  // Already mirrored: no fetch at all.
  const [held] = await db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.id, link.id)).limit(1);
  if (held) return done(held.id);

  // chess.com's callback first.
  const normalised = normaliseCallback(await fetchCallbackGame(link), link);
  if (normalised) {
    const id = await store(normalised);
    if (id) return done(id);
  }

  // Then the archives of whichever player the member names.
  const username = typeof body.username === 'string' ? normaliseUsername(body.username) : '';
  if (!username) return Response.json({ error: 'need_username' }, { status: 422 });
  if (!isValidUsername(username)) return Response.json({ error: 'bad_username' }, { status: 400 });

  try {
    const found = await findGameInArchives(username, link.id);
    if (!found) return Response.json({ error: 'not_found' }, { status: 404 });
    const id = await store(found);
    if (!id) return Response.json({ error: 'not_found' }, { status: 404 });
    return done(id);
  } catch (error) {
    if (error instanceof ChesscomError) {
      return Response.json({ error: 'chesscom', status: error.status, message: error.message }, { status: error.status === 404 ? 404 : 502 });
    }
    throw error;
  }
}
