import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

export type Role = 'admin' | 'member';
export type Status = 'pending' | 'approved' | 'rejected';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: Status;
  emailVerified: boolean;
}

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? (session.user as unknown as AuthedUser) : null;
}

/* ── page guards: redirect ────────────────────────────────────────────────
   proxy.ts does the same checks, but it is a redirect convenience, not the
   security boundary. Next dispatches Server Functions as POSTs to whatever
   route they live on, so a matcher edit can silently drop proxy coverage —
   these run server-side on every render regardless. They also cover the case
   where the proxy waved a request through because the cookie cache had
   expired.
   ------------------------------------------------------------------------ */

export async function requireUser(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireApproved(): Promise<AuthedUser> {
  const user = await requireUser();
  if (user.status !== 'approved') redirect('/pending');
  return user;
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireApproved();
  if (user.role !== 'admin') redirect('/');
  return user;
}

/* ── route-handler guards: return a Response ──────────────────────────── */

type Guarded = { user: AuthedUser } | { response: Response };

export async function guardUser(): Promise<Guarded> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: Response.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  return { user };
}

export async function guardApproved(): Promise<Guarded> {
  const guarded = await guardUser();
  if ('response' in guarded) return guarded;
  if (guarded.user.status !== 'approved') {
    return {
      response: Response.json(
        { error: 'forbidden', status: guarded.user.status },
        { status: 403 },
      ),
    };
  }
  return guarded;
}

export async function guardAdmin(): Promise<Guarded> {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded;
  if (guarded.user.role !== 'admin') {
    return { response: Response.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return guarded;
}
