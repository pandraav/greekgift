'use server';

import { revalidatePath } from 'next/cache';

import { normaliseUsername } from '@/lib/chesscom';
import { requireApproved } from '@/lib/guards';
import { importRecent } from '@/lib/import';

/** Pulls another slice of archive months for a player. */
export async function importMoreMonths(rawUsername: string, months: number) {
  // A server action is a POST to whatever route it lives on, so the proxy
  // gate does not necessarily cover it. Check here.
  await requireApproved();

  const username = normaliseUsername(rawUsername);
  const { imported } = await importRecent(username, Math.min(months, 12));
  revalidatePath(`/u/${username}`);

  return {
    months: imported.length,
    stored: imported.reduce((n, i) => n + i.stored, 0),
  };
}
