'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { normaliseUsername } from '@/lib/chesscom';
import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';
import { importRecent } from '@/lib/import';
import { addToLibrary, membership } from '@/lib/library';

/** Pulls another slice of archive months for a player. */
export async function importMoreMonths(rawUsername: string, months: number) {
  // A server action is a POST to whatever route it lives on, so the proxy
  // gate does not necessarily cover it. Check here.
  await requireApproved();

  const username = normaliseUsername(rawUsername);
  const { imported } = await importRecent(db, username, Math.min(months, 12));
  revalidatePath(`/u/${username}`);

  return {
    months: imported.length,
    stored: imported.reduce((n, i) => n + i.stored, 0),
  };
}

/**
 * Opening a game from any player page adds it to the viewer's library, then
 * goes there. The page's player rides along on `accountUsername` so the row
 * can later say "opened from chess.com/dave" rather than "pasted link" —
 * spec §4 freezes the three `source` values, and that column is the only
 * place left to say which page an opened game arrived from. `removeAccount`
 * deletes `account` rows only, so unlinking dave never touches these.
 */
export async function openGame(gameId: string, rawUsername: string): Promise<never> {
  const user = await requireApproved();
  if (!(await membership(db, user.id, gameId))) {
    await addToLibrary(db, user.id, gameId, {
      source: 'link',
      accountUsername: normaliseUsername(rawUsername),
    });
  }
  redirect(`/g/${gameId}`);
}
