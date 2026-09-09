import { DEFAULT_PERSONA_ID } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { factsFor, formatTimeControl, moveNumber, parsePgn } from '@greekgift/engine';
import { and, count, desc, eq, gte, inArray, or } from 'drizzle-orm';
import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { CLASS_STYLE } from '@/components/classification';
import { Avatar, Card, Chip, Eyebrow } from '@/components/ui';
import { ChesscomError, isValidUsername, normaliseUsername } from '@/lib/chesscom';
import { getCoachHeadlines } from '@/lib/coach-headlines';
import { ensureCoachTexts } from '@/lib/coach-store';
import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { openingFamily, outcomeFor, terminationLabel } from '@/lib/game-labels';
import { requireApproved } from '@/lib/guards';
import { importRecent } from '@/lib/import';
import { listAccounts } from '@/lib/library';
import { getMoments } from '@/lib/moments-store';
import { longDay, whenLabel } from '@/lib/relative-time';
import { getReviews } from '@/lib/review-store';
import { START_FEN } from '@/lib/slim-review';
import { gameMoment, WEEK_MS, weekGames, weekRatingDelta, weekSummary, weekWindow, type Moment } from '@/lib/week';

import { AccountTabs } from './account-tabs';
import { GamesBrowser, type BrowserRow } from './games-browser';
import { WeekCard } from './week-card';

export const dynamic = 'force-dynamic';
const KEY = { nodes: ANALYSIS_NODES, engineBuild: ENGINE_BUILD };

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `${username} · greekgift` };
}

export default async function PlayerPage({ params }: { params: Promise<{ username: string }> }) {
  const user = await requireApproved();
  const { username: raw } = await params;
  if (!isValidUsername(raw)) notFound();
  const username = normaliseUsername(raw);

  // Unchanged from before: mirror the player and their newest month when we hold nothing.
  const [[existing], counted] = await Promise.all([
    db.select().from(schema.players).where(eq(schema.players.username, username)).limit(1),
    db.select({ n: count() }).from(schema.games).where(or(eq(schema.games.whiteUsername, username), eq(schema.games.blackUsername, username))),
  ]);
  let failure: string | null = null;
  if (!existing || (counted[0]?.n ?? 0) === 0) {
    try {
      await importRecent(db, username, 1);
    } catch (error) {
      if (error instanceof ChesscomError && error.status === 404) notFound();
      failure = error instanceof ChesscomError ? error.message : 'chess.com did not answer. Try again in a moment.';
    }
  }
  const [player] = await db.select().from(schema.players).where(eq(schema.players.username, username)).limit(1);
  if (!player) notFound();

  const accounts = await listAccounts(db, user.id);
  const linked = accounts.some((a) => a.username === username);
  const { since } = weekWindow();

  // 200 newest: enough for the window plus the previous game per class for the deltas.
  const games = await db
    .select()
    .from(schema.games)
    .where(or(eq(schema.games.whiteUsername, username), eq(schema.games.blackUsername, username)))
    .orderBy(desc(schema.games.endTime))
    .limit(200);

  // Two hundred whole reviews is two hundred blobs of per-ply evaluations.
  // The week summary is the only thing that needs them, and only for the
  // window; every row wants the turning point, which is five fields a move
  // projected in SQL (`getMoments`).
  const [reviews, moments] = await Promise.all([
    getReviews(games.filter((g) => g.endTime.getTime() >= since.getTime()).map((g) => g.id), KEY),
    getMoments(db, games.map((g) => g.id), KEY),
  ]);
  const [profile] = await db
    .select({ personaId: schema.userProfiles.personaId, audience: schema.userProfiles.audience })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id))
    .limit(1);
  const personaId = profile?.personaId ?? DEFAULT_PERSONA_ID;
  const audience = profile?.audience ?? 'intermediate';

  const week = weekGames(games, username, since);
  const summary = linked ? weekSummary(week, reviews, username, (r, ply) => factsFor(r, ply)) : null;

  // Tabs: every linked account with its games-this-week count. One query for
  // all the display names, then a single count() per non-current account —
  // never every one of its games.
  const tabPlayers = linked
    ? await db
        .select({ username: schema.players.username, displayName: schema.players.displayName })
        .from(schema.players)
        .where(inArray(schema.players.username, accounts.map((a) => a.username)))
    : [];
  const displayNameOf = new Map(tabPlayers.map((p) => [p.username, p.displayName]));
  const tabs = linked
    ? await Promise.all(
        accounts.map(async (a) => {
          const thisWeek =
            a.username === username
              ? week.length
              : ((
                  await db
                    .select({ n: count() })
                    .from(schema.games)
                    .where(
                      and(
                        or(eq(schema.games.whiteUsername, a.username), eq(schema.games.blackUsername, a.username)),
                        gte(schema.games.endTime, since),
                      ),
                    )
                )[0]?.n ?? 0);
          return { username: a.username, displayName: displayNameOf.get(a.username) ?? a.username, thisWeek };
        }),
      )
    : [];

  // The turning point per reviewed game, and the ply whose headline the row
  // shows. Both come from the slim projection — no blob is read for this.
  const momentOf = new Map<string, Moment>();
  const wanted: { gameId: string; ply: number }[] = [];
  for (const game of games) {
    const slim = moments[game.id];
    if (!slim) continue;
    const moment = gameMoment(slim, game.whiteUsername === username ? 'w' : 'b');
    momentOf.set(game.id, moment);
    wanted.push({ gameId: game.id, ply: moment.ply ?? slim.moves.length });
  }

  // One query for every headline already written. Only the misses cost a
  // whole review and a write, and those go through mapChunked rather than one
  // giant read plus one giant Promise.all: on a cold cache a hundred games
  // would otherwise be a hundred review blobs held at once and a hundred
  // concurrent connections on every force-dynamic render. Each chunk reads
  // its own reviews and lets go of them.
  const headlines = await getCoachHeadlines(db, wanted, personaId, audience);
  const missing = wanted.filter((w) => headlines[w.gameId] === undefined);
  await mapChunked(missing, 8, async (chunk) => {
    const full = await getReviews(chunk.map((m) => m.gameId), KEY);
    await Promise.all(
      chunk.map(async ({ gameId, ply }) => {
        const review = full[gameId];
        if (!review) return;
        const texts = await ensureCoachTexts(review, personaId, { audience });
        const headline = texts[ply]?.headline;
        if (headline) headlines[gameId] = headline;
      }),
    );
  });

  // Two Septembers from different years must not carry the same label, so
  // the year joins it as soon as the loaded games span more than one.
  const spansYears = new Set(games.map((g) => g.endTime.getUTCFullYear())).size > 1;
  const monthFormat: Intl.DateTimeFormatOptions = spansYears
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { month: 'long', timeZone: 'UTC' };

  const rows: BrowserRow[] = games.map((game) => {
    const side = game.whiteUsername === username ? 'w' : 'b';
    const slim = moments[game.id];
    const w = week.find((x) => x.game.id === game.id);
    const opponent = side === 'w' ? game.blackName : game.whiteName;
    const meta = `${game.eco ? `${game.eco} ` : ''}${openingFamily(game.opening) ?? 'Unnamed opening'} · ${Math.ceil(game.plies / 2)} moves · ${terminationLabel(game, username)}`;
    const month = `${game.endTime.getUTCFullYear()}-${String(game.endTime.getUTCMonth() + 1).padStart(2, '0')}`;
    const base = {
      gameId: game.id,
      href: `/g/${game.id}` as Route,
      when: whenLabel(game.endTime),
      delta: w?.ratingDelta ?? null,
      outcome: outcomeFor(game, username),
      opponent,
      opponentRating: side === 'w' ? game.blackRating : game.whiteRating,
      sub: `${(side === 'w' ? game.blackRating : game.whiteRating) ?? '—'} · ${game.timeClass} ${formatTimeControl(game.timeControl)} · as ${side === 'w' ? 'White' : 'Black'}`,
      meta,
      timeClass: game.timeClass,
      side,
      inWindow: game.endTime.getTime() >= since.getTime(),
      month,
      monthLabel: game.endTime.toLocaleDateString('en-GB', monthFormat),
      endTime: game.endTime.toISOString(),
    } as const;

    if (!slim) {
      return {
        ...base,
        read: false,
        moment: { fen: game.finalFen ?? finalFenOf(game), hot: null, classification: null, label: '', headline: 'Not read yet.' },
        accuracy: null,
        opponentAccuracy: null,
      };
    }

    const moment = momentOf.get(game.id)!;
    return {
      ...base,
      read: true,
      moment: {
        fen: moment.fen,
        hot: moment.square,
        classification: moment.classification,
        label: moment.ply && moment.classification ? `${CLASS_STYLE[moment.classification].label} · move ${moveNumber(moment.ply)}` : 'No mistakes',
        headline: headlines[game.id] ?? 'Read.',
      },
      accuracy: side === 'w' ? slim.white.accuracy : slim.black.accuracy,
      opponentAccuracy: side === 'w' ? slim.black.accuracy : slim.white.accuracy,
    };
  });

  const initials = player.displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';

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
  const ratingsAreFromGames =
    player.ratingRapid === null && player.ratingBlitz === null && player.ratingBullet === null;

  const ratings = (
    [
      ['Rapid', 'rapid', player.ratingRapid ?? fallback.get('rapid')],
      ['Blitz', 'blitz', player.ratingBlitz ?? fallback.get('blitz')],
      ['Bullet', 'bullet', player.ratingBullet ?? fallback.get('bullet')],
    ] as [string, string, number | undefined][]
  ).flatMap(([label, cls, value]) =>
    typeof value === 'number' ? [[label, value, linked ? weekRatingDelta(games, username, cls, since) : null] as [string, number, number | null]] : [],
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      {linked ? <AccountTabs tabs={tabs} current={username} /> : null}

      <header className="mb-[22px] flex flex-wrap items-center gap-5">
        <Avatar size="xl">{initials}</Avatar>
        <div className="min-w-0">
          <Eyebrow onWood>chess.com/{player.username}</Eyebrow>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-2.5 font-display text-[26px] font-semibold">
            {player.displayName}
            {player.title ? <Chip tone="brass">{player.title}</Chip> : null}
          </h1>
          <p className="mt-0.5 text-sm text-paper/55">
            {player.joinedAt ? `Member since ${player.joinedAt.getUTCFullYear()}` : 'chess.com member'}
            {player.archiveCount ? ` · ${player.archiveCount} months of games` : ''}
            {games[0] ? ` · last played ${longDay(games[0].endTime)}` : ''}
          </p>
        </div>
        {ratings.length > 0 ? (
          <div className="ml-auto flex gap-[22px]">
            {ratings.map(([label, value, delta]) => (
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
                  <small className={`ml-1.5 align-[3px] font-mono text-[11px] font-semibold ${delta === null ? 'text-paper/45' : delta >= 0 ? 'text-felt-hi' : 'text-lacquer-hi'}`}>
                    {delta === null ? ' ' : delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {failure ? <Card className="mb-4"><div className="px-5 py-4 text-[14.5px] text-lacquer">{failure}</div></Card> : null}

      {linked && summary ? (
        <WeekCard username={username} since={longDay(since)} summary={summary} />
      ) : (
        <p className="mb-4 text-[13.5px] text-paper/55">
          Not one of your accounts. Add it on the home page to have its week read for you.
        </p>
      )}

      <GamesBrowser username={username} rows={rows} linked={linked} now={since.getTime() + WEEK_MS} />
    </main>
  );
}

/** The final position for an unread game whose row has no `finalFen` (older imports). */
function finalFenOf(game: { pgn: string }): string {
  try {
    return parsePgn(game.pgn).fens.at(-1)!;
  } catch {
    return START_FEN;
  }
}

/** Runs `fn` over the items in bounded batches, in order — keeps a fan-out of DB reads and writes from opening hundreds of connections at once. */
async function mapChunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}
