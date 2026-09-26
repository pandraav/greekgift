import 'server-only';

import { after } from 'next/server';

import { mailer } from '@/lib/auth';
import { db } from '@/lib/db';
import { gameTitle } from '@/lib/game-title';
import { guardApproved } from '@/lib/guards';
import { decideRequest } from '@/lib/shares';

export async function decide(id: string, decision: 'approved' | 'declined'): Promise<Response> {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const decided = await decideRequest(db, id, guarded.user, decision);
  if (!decided) return Response.json({ error: 'not_pending' }, { status: 404 });

  if (decision === 'approved') {
    // The decision is made whether or not the transport is quick about it, so
    // the response does not wait on the mail — but `after` keeps the function
    // alive until it is sent, which a bare `void` does not: a serverless
    // instance freezing at the response would drop the send.
    after(() =>
      mailer.sendShareApproved(decided.requester.email, decided.requester.name, {
        ownerName: guarded.user.name,
        gameTitle: gameTitle(decided.share.game),
        gameId: decided.share.game.id,
      }),
    );
  }
  return Response.json({ ok: true });
}
