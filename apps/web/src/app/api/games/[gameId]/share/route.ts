import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { env } from '@/env';
import { guardApproved } from '@/lib/guards';
import { canSeeGame } from '@/lib/library';
import { getOrCreateShare } from '@/lib/shares';

export async function POST(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;
  const { gameId } = await params;

  const [game] = await db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.id, gameId)).limit(1);
  if (!game) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!(await canSeeGame(db, guarded.user, gameId))) return Response.json({ error: 'forbidden' }, { status: 403 });

  const share = await getOrCreateShare(db, gameId, guarded.user.id);
  return Response.json({ token: share.token, url: `${env.NEXT_PUBLIC_APP_URL}/s/${share.token}` });
}
