import { PERSONAS } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guardApproved, guardUser } from '@/lib/guards';

/**
 * GET takes a session-only guard, not an approved one: /pending has to render
 * "rejected" versus "awaiting approval", and it cannot ask an endpoint that
 * requires approval.
 */
export async function GET() {
  const guarded = await guardUser();
  if ('response' in guarded) return guarded.response;

  const [profile] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, guarded.user.id))
    .limit(1);

  return Response.json({
    user: {
      id: guarded.user.id,
      email: guarded.user.email,
      name: guarded.user.name,
      role: guarded.user.role,
      status: guarded.user.status,
    },
    profile: profile ?? null,
  });
}

/** PUT requires approval — only members with access edit their own settings. */
export async function PUT(request: Request) {
  return save(request);
}

/**
 * PATCH is the same write, and exists because changing your coach mid-review
 * is a one-field edit that should not have to send the whole settings form.
 */
export async function PATCH(request: Request) {
  return save(request);
}

async function save(request: Request) {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const body = (await request.json().catch(() => ({}))) as {
    chesscomUsername?: unknown;
    audience?: unknown;
    personaId?: unknown;
  };

  const username =
    typeof body.chesscomUsername === 'string'
      ? body.chesscomUsername.trim().slice(0, 60) || null
      : undefined;

  const levels = ['beginner', 'intermediate', 'advanced'] as const;
  const audience = levels.find((l) => l === body.audience);

  // Only a persona that exists: the column is plain text so the spec can gain
  // and lose voices without a migration, which puts the check here instead.
  const personaId = PERSONAS.find((p) => p.id === body.personaId)?.id;

  const [updated] = await db
    .update(schema.userProfiles)
    .set({
      ...(username !== undefined ? { chesscomUsername: username } : {}),
      ...(audience ? { audience } : {}),
      ...(personaId ? { personaId } : {}),
    })
    .where(eq(schema.userProfiles.userId, guarded.user.id))
    .returning();

  return Response.json({ profile: updated ?? null });
}
