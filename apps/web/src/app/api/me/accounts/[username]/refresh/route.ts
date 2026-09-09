import { ChesscomError, normaliseUsername } from '@/lib/chesscom';
import { db } from '@/lib/db';
import { guardApproved } from '@/lib/guards';
import { getAccount, isStale } from '@/lib/library';
import { refreshAccount } from '@/lib/refresh-account';

/** Up to two archive months, serially. */
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const username = normaliseUsername((await params).username);
  const account = await getAccount(db, guarded.user.id, username);
  if (!account) return Response.json({ error: 'not_linked' }, { status: 404 });

  const ifStale = new URL(request.url).searchParams.get('ifStale') === '1';
  if (ifStale && !isStale(account.lastRefreshedAt)) return Response.json({ refreshed: false });

  try {
    const { stored } = await refreshAccount(db, guarded.user.id, username);
    return Response.json({ refreshed: true, stored });
  } catch (error) {
    if (error instanceof ChesscomError) {
      // The stamp is untouched, so a 429 shows once and the loop cannot spin.
      return Response.json({ error: 'chesscom', status: error.status, message: error.message }, { status: 502 });
    }
    throw error;
  }
}
