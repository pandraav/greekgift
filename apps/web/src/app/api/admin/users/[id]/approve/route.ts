import { schema } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import { mailer } from '@/lib/auth';
import { db } from '@/lib/db';
import { guardAdmin } from '@/lib/guards';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin();
  if ('response' in guarded) return guarded.response;

  const { id } = await params;

  // Only pending rows flip, so a double-click cannot re-approve or
  // resurrect somebody who was rejected.
  const [updated] = await db
    .update(schema.user)
    .set({
      status: 'approved',
      approvedBy: guarded.user.id,
      approvedAt: new Date(),
    })
    .where(and(eq(schema.user.id, id), eq(schema.user.status, 'pending')))
    .returning({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
    });

  if (!updated) {
    return Response.json({ error: 'not_pending' }, { status: 404 });
  }

  void mailer.sendApproved(updated.email, updated.name);
  return Response.json({ ok: true, user: updated });
}
