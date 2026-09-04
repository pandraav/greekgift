import { schema } from '@greekgift/db';
import { parsePgn } from '@greekgift/engine';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, CardBody, CardHead, Chip, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';

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
  await requireApproved();
  const { gameId } = await params;

  const [game] = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);

  if (!game) notFound();

  const parsed = parsePgn(game.pgn);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
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
        <p className="m-0 font-mono text-[12.5px] text-paper/55">
          {game.eco ? `${game.eco} · ` : ''}
          {game.opening ?? 'unnamed opening'} · {game.timeClass}{' '}
          {game.timeControl}
        </p>
      </div>

      <Card>
        <CardHead>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold">Imported and readable</h2>
            <Chip tone="felt">{parsed.moves.length} plies</Chip>
            <Chip tone="quiet">{game.result}</Chip>
            {game.ccAccuracyWhite !== null ? (
              <Chip tone="brass">
                chess.com: {game.ccAccuracyWhite.toFixed(1)} /{' '}
                {game.ccAccuracyBlack?.toFixed(1)}
              </Chip>
            ) : null}
          </div>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {game.termination ?? 'Game over.'}
          </p>
        </CardHead>
        <CardBody>
          <p className="mt-0 mb-4 max-w-[56ch] text-[14.5px] text-ink-2">
            The board, the engine and the coach land in the next milestones.
            What is proven here is the import: this game came from chess.com,
            parsed cleanly, and every position is reconstructable.
          </p>

          <div className="max-h-64 overflow-auto rounded-[3px] border border-rule bg-paper-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-2">
            {parsed.moves
              .map((m, i) =>
                i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san,
              )
              .join(' ')}
          </div>

          <p className="mt-4 mb-0 text-[13px] text-ink-3">
            Final position:{' '}
            <span className="font-mono">{parsed.fens.at(-1)}</span>
          </p>
        </CardBody>
      </Card>

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
