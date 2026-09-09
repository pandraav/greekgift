import { DEFAULT_PERSONA_ID } from '@greekgift/coach';
import { schema, type Game } from '@greekgift/db';
import { parsePgn } from '@greekgift/engine';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import { Chip, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { requireApproved } from '@/lib/guards';
import { canSeeGame, touchOpened } from '@/lib/library';
import { getReview } from '@/lib/review-store';
import { hasPendingRequest, shareByToken } from '@/lib/shares';

import { AskToSee } from './ask-to-see';
import { ReviewPanel } from './review-panel';
import { ShareButton } from './share-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return { title: `Review ${gameId} · greekgift` };
}

/** The left-hand eyebrow + heading block, shared by both the ask-to-see and the review layout. */
function Header({ game }: { game: Game }) {
  return (
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
  );
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const user = await requireApproved();
  const { gameId } = await params;
  const { s } = await searchParams;

  const [game] = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);

  if (!game) notFound();

  if (!(await canSeeGame(db, user, gameId))) {
    const share = s ? await shareByToken(db, s) : null;
    const valid = share && share.game.id === gameId ? share : null;
    const alreadyAsked = valid ? await hasPendingRequest(db, valid.share.token, user.id) : false;
    return (
      <main className="mx-auto max-w-[640px] px-4 py-7 sm:px-6 sm:py-9">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <Header game={game} />
        </div>
        <p className="-mt-3 mb-4 font-mono text-[12.5px] text-paper/55">
          {game.result} · {game.eco ? `${game.eco} · ` : ''}
          {game.opening ?? 'unnamed opening'} · {game.timeClass}{' '}
          {game.timeControl}
        </p>
        <AskToSee token={valid?.share.token ?? null} ownerName={valid?.owner.name ?? null} alreadyAsked={alreadyAsked} />
        <p className="mt-3.5 max-w-[52ch] text-[13px] text-paper/45">
          No link? Games reach your library when one of your accounts played them, when you open them from a player&rsquo;s page, or when someone shares them with you.
        </p>
      </main>
    );
  }

  const parsed = parsePgn(game.pgn);
  const review = await getReview(gameId, {
    nodes: ANALYSIS_NODES,
    engineBuild: ENGINE_BUILD,
  });
  if (review) after(() => touchOpened(db, user, gameId));

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
        <Header game={game} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[12.5px] text-paper/55">
            <Chip tone="quiet">{game.result}</Chip>
            <Chip tone="felt">{parsed.moves.length} plies</Chip>
            {game.eco ? `${game.eco} · ` : ''}
            {game.opening ?? 'unnamed opening'} · {game.timeClass}{' '}
            {game.timeControl}
          </p>
          <ShareButton gameId={gameId} />
        </div>
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
