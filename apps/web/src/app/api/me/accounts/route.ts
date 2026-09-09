import { db } from '@/lib/db';
import { guardApproved } from '@/lib/guards';
import { AccountError, addAccount, listAccounts } from '@/lib/library';

/** `ensurePlayer` calls chess.com three times; that is the whole budget. */
export const maxDuration = 30;

export async function GET() {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;
  return Response.json({ accounts: await listAccounts(db, guarded.user.id) });
}

const STATUS: Record<AccountError['code'], number> = {
  bad_username: 400,
  limit: 409,
  exists: 409,
  no_such_player: 404,
};

export async function POST(request: Request) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const body = (await request.json().catch(() => ({}))) as { username?: unknown };
  const raw = typeof body.username === 'string' ? body.username : '';

  try {
    const account = await addAccount(db, guarded.user.id, raw);
    return Response.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountError) {
      return Response.json({ error: error.code }, { status: STATUS[error.code] });
    }
    throw error;
  }
}
