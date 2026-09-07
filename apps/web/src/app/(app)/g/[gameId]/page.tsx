import { DEFAULT_PERSONA_ID } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { parsePgn } from '@greekgift/engine';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Chip, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { requireApproved } from '@/lib/guards';
import { getReview } from '@/lib/review-store';

import { ReviewPanel } from './review-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return { title: `Review ${gameId} · greekgift` };
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const user = await requireApproved();
  const { gameId } = await params;

  const [game] = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);

  if (!game) notFound();

  const parsed = parsePgn(game.pgn);
  const review = await getReview(gameId, {
    nodes: ANALYSIS_NODES,
    engineBuild: ENGINE_BUILD,
  });

  const [profile] = await db
    .select({
      personaId: schema.userProfiles.personaId,
      audience: schema.userProfiles.audience,
    })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id))
    .limit(1);

  return (
    <main className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6 sm:py-9">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow onWood>
            Review ·{' '}
            {game.endTime.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Eyebrow>
          <h1 className="mt-1.5 font-display text-[26px] font-semibold">
            {game.whiteName}{' '}
            <span className="text-[18px] font-normal text-paper/50 italic">
              vs
            </span>{' '}
            {game.blackName}
          </h1>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-paper/55">
          <Chip tone="quiet">{game.result}</Chip>
          <Chip tone="felt">{parsed.moves.length} plies</Chip>
          {game.eco ? `${game.eco} · ` : ''}
          {game.opening ?? 'unnamed opening'} · {game.timeClass}{' '}
          {game.timeControl}
        </p>
      </div>

      <ReviewPanel
        gameId={gameId}
        fens={parsed.fens}
        initialReview={review}
        personaId={profile?.personaId ?? DEFAULT_PERSONA_ID}
        audience={profile?.audience ?? 'intermediate'}
      />

      <p className="mt-4 text-center text-[13px] text-paper/45">
        <Link
          href={`/u/${game.whiteUsername}`}
          className="underline underline-offset-2"
        >
          {game.whiteName}
        </Link>
        {' · '}
        <Link
          href={`/u/${game.blackUsername}`}
          className="underline underline-offset-2"
        >
          {game.blackName}
        </Link>
        {' · '}
        <a href={game.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          on chess.com
        </a>
      </p>
    </main>
  );
}
