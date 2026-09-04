import { schema } from '@greekgift/db';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guardAdmin } from '@/lib/guards';

/** GET /api/admin/users?status=pending — the approval queue. */
export async function GET(request: Request) {
  const guarded = await guardAdmin();
  if ('response' in guarded) return guarded.response;

  const status = new URL(request.url).searchParams.get('status');
  const valid = ['pending', 'approved', 'rejected'] as const;
  const filter = valid.find((v) => v === status);

  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      status: schema.user.status,
      emailVerified: schema.user.emailVerified,
      createdAt: schema.user.createdAt,
      approvedAt: schema.user.approvedAt,
      occupation: schema.userProfiles.occupation,
      note: schema.userProfiles.note,
      chesscomUsername: schema.userProfiles.chesscomUsername,
    })
    .from(schema.user)
    .leftJoin(
      schema.userProfiles,
      eq(schema.userProfiles.userId, schema.user.id),
    )
    .where(filter ? eq(schema.user.status, filter) : undefined)
    .orderBy(desc(schema.user.createdAt));

  return Response.json({ users: rows });
}
