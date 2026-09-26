import { db } from '@/lib/db';
import { gameSubtitle, gameTitle } from '@/lib/game-title';
import { guardApproved } from '@/lib/guards';
import { relativeTime, whenLabel } from '@/lib/relative-time';
import { notifications } from '@/lib/shares';

/** Rows for the modal, with their display strings already written (spec §3.5). */
export async function GET() {
  const guarded = await guardApproved();
  if ('response' in guarded) return guarded.response;

  const n = await notifications(db, guarded.user.id);
  const now = new Date();
  const initials = (name: string) =>
    name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';

  return Response.json({
    pending: n.pending.map((r) => ({
      id: r.id,
      requesterName: r.requesterName,
      initials: initials(r.requesterName),
      title: gameTitle(r.game),
      sub: `${gameSubtitle(r.game)} · ${whenLabel(r.game.endTime, now)} · asked ${relativeTime(r.createdAt, now)}`,
      gameId: r.gameId,
    })),
    shared: n.shared.map((r) => ({
      gameId: r.gameId,
      sharedByName: r.sharedByName,
      initials: initials(r.sharedByName),
      title: gameTitle(r.game),
      sub: `${gameSubtitle(r.game)} · ${whenLabel(r.game.endTime, now)} · approved ${relativeTime(r.addedAt, now)}`,
    })),
    earlier: n.earlier.map((r) => ({
      id: r.id,
      requesterName: r.requesterName,
      initials: initials(r.requesterName),
      title: gameTitle(r.game),
      sub: `${gameSubtitle(r.game)} · ${r.status} ${r.decidedAt ? whenLabel(r.decidedAt, now) : ''}`.trim(),
      status: r.status,
    })),
  });
}
