import { db } from '@/lib/db';
import { normaliseUsername } from '@/lib/chesscom';
import { guardApproved } from '@/lib/guards';
import { removeAccount } from '@/lib/library';

export async function DELETE(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;
  const { username } = await params;
  await removeAccount(db, guarded.user.id, normaliseUsername(username));
  return Response.json({ ok: true });
}
