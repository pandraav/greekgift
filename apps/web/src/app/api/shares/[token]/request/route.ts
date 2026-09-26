import { after } from 'next/server';

import { mailer } from '@/lib/auth';
import { db } from '@/lib/db';
import { gameTitle } from '@/lib/game-title';
import { guardApproved } from '@/lib/guards';
import { requestAccess } from '@/lib/shares';

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;
  const { token } = await params;

  const result = await requestAccess(db, token, guarded.user.id);
  if (!result) return Response.json({ error: 'not_found' }, { status: 404 });

  if (result.status === 'created') {
    // The request is recorded whether or not the transport is quick about it,
    // so the response does not wait on the mail — but `after` keeps the
    // function alive until it is sent, which a bare `void` does not: a
    // serverless instance freezing at the response would drop the send.
    after(() =>
      mailer.sendShareRequested(result.share.owner.email, result.share.owner.name, {
        requesterName: guarded.user.name,
        gameTitle: gameTitle(result.share.game),
      }),
    );
  }
  return Response.json({ status: result.status });
}
