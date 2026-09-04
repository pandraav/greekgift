import { schema } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guardAdmin } from '@/lib/guards';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin();
  if ('response' in guarded) return guarded.response;

  const { id } = await params;

  const [updated] = await db
    .update(schema.user)
    .set({
      status: 'rejected',
      approvedBy: guarded.user.id,
      approvedAt: new Date(),
    })
    .where(and(eq(schema.user.id, id), eq(schema.user.status, 'pending')))
    .returning({ id: schema.user.id });

  if (!updated) {
    return Response.json({ error: 'not_pending' }, { status: 404 });
  }

  /**
   * Kill their sessions.
   *
   * The cookie cache is self-contained and would otherwise carry a stale
   * `approved` for up to its window. Approval lagging is harmless; rejection
   * lagging is the dangerous direction.
   */
  await db.delete(schema.session).where(eq(schema.session.userId, id));

  // Rejections send no email, per spec.
  return Response.json({ ok: true });
}
