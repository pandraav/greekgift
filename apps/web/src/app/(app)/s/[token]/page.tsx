import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';
import { shareByToken } from '@/lib/shares';

export const dynamic = 'force-dynamic';

/** A share link is just the game page with the token attached. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await requireApproved();
  const { token } = await params;
  const share = await shareByToken(db, token);
  if (!share) notFound();
  redirect(`/g/${share.game.id}?s=${encodeURIComponent(token)}`);
}
