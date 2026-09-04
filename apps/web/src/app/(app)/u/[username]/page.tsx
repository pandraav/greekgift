import { schema } from '@greekgift/db';
import { count, desc, eq, or } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { Card, Chip, Eyebrow } from '@/components/ui';
import { ChesscomError, normaliseUsername, isValidUsername } from '@/lib/chesscom';
import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';
import { importRecent } from '@/lib/import';

import { GameList } from './game-list';
import { ImportMore } from './import-more';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return { title: `${username} · greekgift` };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  await requireApproved();

  const { username: raw } = await params;
  if (!isValidUsername(raw)) notFound();
  const username = normaliseUsername(raw);

  // Is this player mirrored, and do we actually hold any of their games?
  // Checking only for the player row would leave anyone whose first import
  // failed stuck on an empty page forever.
  const [[existing], counted] = await Promise.all([
    db.select().from(schema.players).where(eq(schema.players.username, username)).limit(1),
    db
      .select({ n: count() })
      .from(schema.games)
      .where(
        or(
          eq(schema.games.whiteUsername, username),
          eq(schema.games.blackUsername, username),
        ),
      ),
  ]);
  const held = counted[0]?.n ?? 0;

  let failure: string | null = null;

  // Pull the profile and the newest month so the page has something on it.
  // Later months are imported on request.
  if (!existing || held === 0) {
    try {
      await importRecent(username, 1);
    } catch (error) {
      if (error instanceof ChesscomError && error.status === 404) notFound();
      failure =
        error instanceof ChesscomError
          ? error.message
          : 'chess.com did not answer. Try again in a moment.';
    }
  }

  const [player] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.username, username))
    .limit(1);

  if (!player) notFound();

  const games = await db
    .select()
    .from(schema.games)
    .where(
      or(
        eq(schema.games.whiteUsername, username),
        eq(schema.games.blackUsername, username),
      ),
    )
    .orderBy(desc(schema.games.endTime))
    .limit(60);

  const initials =
    player.displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() ||
    '??';

  /**
   * chess.com's /stats endpoint 404s for some accounts — an error on their
   * side, not ours. Rather than show nothing, fall back to the rating this
   * player carried in their most recent game of each class, which we already
   * hold.
   */
  const fallback = new Map<string, number>();
  for (const g of games) {
    const mine = g.whiteUsername === username ? g.whiteRating : g.blackRating;
    if (mine && !fallback.has(g.timeClass)) fallback.set(g.timeClass, mine);
  }

  const ratings: [string, number][] = (
    [
      ['Rapid', player.ratingRapid ?? fallback.get('rapid')],
      ['Blitz', player.ratingBlitz ?? fallback.get('blitz')],
      ['Bullet', player.ratingBullet ?? fallback.get('bullet')],
    ] as [string, number | undefined][]
  ).flatMap(([label, value]) => (typeof value === 'number' ? [[label, value] as [string, number]] : []));

  const ratingsAreFromGames =
    player.ratingRapid === null &&
    player.ratingBlitz === null &&
    player.ratingBullet === null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center gap-5">
        <span className="grid size-[76px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-wood-600 to-wood-900 text-2xl font-semibold tracking-[-.02em] text-brass-hi shadow-[0_0_0_1px_rgb(0_0_0/.4)]">
          {initials}
        </span>

        <div className="min-w-0">
          <Eyebrow onWood>chess.com/{player.username}</Eyebrow>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-2.5 font-display text-[26px] font-semibold">
            {player.displayName}
            {player.title ? <Chip tone="brass">{player.title}</Chip> : null}
          </h1>
          <p className="mt-0.5 text-sm text-paper/55">
            {player.joinedAt
              ? `Member since ${player.joinedAt.getUTCFullYear()}`
              : 'chess.com member'}
            {player.archiveCount
              ? ` · ${player.archiveCount} months of games`
              : ''}
            {player.importedThrough ? ` · read through ${player.importedThrough}` : ''}
          </p>
        </div>

        {ratings.length > 0 ? (
          <div className="ml-auto flex gap-6">
            {ratings.map(([label, value]) => (
              <div key={label} className="text-right">
                <div
                  className="font-mono text-[10px] tracking-[.13em] text-paper/50 uppercase"
                  title={ratingsAreFromGames ? 'From their latest game — chess.com had no stats for this account' : undefined}
                >
                  {label}
                  {ratingsAreFromGames ? '*' : ''}
                </div>
                <div className="font-display text-2xl font-semibold tracking-[-.02em]">
                  {value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {failure ? (
        <Card className="mb-4">
          <div className="px-5 py-4 text-[14.5px] text-lacquer">{failure}</div>
        </Card>
      ) : null}

      <GameList username={username} games={games} />

      <ImportMore username={username} />
    </main>
  );
}
