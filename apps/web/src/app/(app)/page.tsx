import { schema } from '@greekgift/db';
import { formatTimeControl } from '@greekgift/engine';
import { desc, gte, inArray, or, and } from 'drizzle-orm';
import type { Route } from 'next';
import Link from 'next/link';

import { CompactGameRow } from '@/components/games/compact-game-row';
import { Avatar, Card, CardBody, Chip, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { ANALYSIS_NODES, ENGINE_BUILD } from '@/lib/engine/settings';
import { openingFamily, outcomeFor } from '@/lib/game-labels';
import { requireApproved } from '@/lib/guards';
import { ACCOUNT_LIMIT, isStale, LIBRARY_PAGE, libraryReviews, listAccounts } from '@/lib/library';
import { whenLabel } from '@/lib/relative-time';
import { getAccuracies } from '@/lib/review-store';
import { weekGames, weekWindow } from '@/lib/week';

import { AccountCardFoot } from './home/account-card-foot';
import { AddAccount } from './home/add-account';
import { AutoRefresh } from './home/auto-refresh';
import { PasteLink } from './home/paste-link';

export const dynamic = 'force-dynamic';

const KEY = { nodes: ANALYSIS_NODES, engineBuild: ENGINE_BUILD };

/** The three PGN results worth a chip; anything else (`*`) is unfinished. */
const DECISIVE = new Set(['1-0', '0-1', '1/2-1/2']);

const initialsOf = (name: string) =>
  name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';

export default async function Home() {
  const user = await requireApproved();
  const accounts = await listAccounts(db, user.id);
  const usernames = accounts.map((a) => a.username);
  const { since } = weekWindow();

  const [players, games, library] = await Promise.all([
    usernames.length
      ? db.select().from(schema.players).where(inArray(schema.players.username, usernames))
      : Promise.resolve([]),
    usernames.length
      ? db
          .select()
          .from(schema.games)
          .where(
            and(
              or(inArray(schema.games.whiteUsername, usernames), inArray(schema.games.blackUsername, usernames)),
              // Deltas are not shown on the home card, so the window alone is enough here.
              gte(schema.games.endTime, since),
            ),
          )
          .orderBy(desc(schema.games.endTime))
      : Promise.resolve([]),
    libraryReviews(db, user.id, KEY),
  ]);
  const accuracies = await getAccuracies(games.map((g) => g.id), KEY);
  const playerOf = new Map(players.map((p) => [p.username, p]));
  const stale = accounts.filter((a) => isStale(a.lastRefreshedAt)).map((a) => a.username);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <AutoRefresh usernames={stale} />
      <div className="grid gap-[22px]">
        <div>
          <Eyebrow onWood>Your games</Eyebrow>
          <h1 className="type-display mt-2.5 mb-3 font-display text-[clamp(30px,4vw,44px)] leading-none font-semibold tracking-[-0.03em]">
            Every game you have played
            <br />
            still has something in it.
          </h1>
          <p className="max-w-[56ch] text-[17px] leading-relaxed text-paper/70">
            Your linked accounts keep their latest games ready below. Paste any chess.com game link to read one that is not yours.
          </p>
        </div>

        <Card lift>
          <CardBody>
            <PasteLink />
          </CardBody>
        </Card>

        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow onWood>Linked accounts</Eyebrow>
            <span className="text-[12.5px] text-paper/50">
              {accounts.length} of {ACCOUNT_LIMIT}
            </span>
          </div>

          {accounts.length === 0 ? (
            <Card lift className="max-w-[560px] border-[1.5px] border-dashed">
              <CardBody>
                <h2 className="type-hero mb-3 font-display text-[clamp(28px,6vw,40px)] leading-none font-semibold tracking-[-0.035em]">
                  You hung a knight.
                  <br />
                  Let&rsquo;s talk about it.
                </h2>
                <p className="mb-5 max-w-[50ch] text-[15px] leading-relaxed text-ink-2">
                  Put in a chess.com username. greekgift reads the games, runs the engine in your browser, and tells you what actually went wrong.
                </p>
                <AddAccount count={0} hero />
              </CardBody>
            </Card>
          ) : (
            <div className="grid items-start gap-4 min-[861px]:grid-cols-2">
              {accounts.map((account) => {
                const player = playerOf.get(account.username);
                const week = weekGames(games, account.username, since).slice(0, 10);
                const ratings = [
                  ['rapid', player?.ratingRapid],
                  ['blitz', player?.ratingBlitz],
                  ['bullet', player?.ratingBullet],
                ].filter((r): r is [string, number] => typeof r[1] === 'number');
                return (
                  <Card key={account.username} className="overflow-hidden">
                    <div className="flex items-center gap-3 px-5 pt-4 pb-3">
                      <Avatar size="md">{initialsOf(player?.displayName ?? account.username)}</Avatar>
                      <span className="min-w-0">
                        <span className="block text-[15px] leading-[1.2] font-semibold">{player?.displayName ?? account.username}</span>
                        <Link href={`/u/${account.username}`} className="font-mono text-[11.5px] text-ink-3 no-underline hover:underline">
                          chess.com/{account.username} · all games ›
                        </Link>
                      </span>
                      <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                        {ratings.map(([label, value]) => (
                          <Chip key={label} tone="quiet">{label} {value}</Chip>
                        ))}
                      </span>
                    </div>
                    {week.length === 0 ? (
                      <div className="border-y border-rule-2 px-5 py-[22px] text-center text-[14px] text-ink-2">
                        No games this week. Refresh once they have played.
                      </div>
                    ) : (
                      <div className="border-t border-rule-2">
                        {week.map(({ game, side, outcome }) => {
                          const acc = accuracies[game.id];
                          return (
                            <CompactGameRow
                              key={game.id}
                              href={`/g/${game.id}` as Route}
                              when={whenLabel(game.endTime)}
                              outcome={outcome}
                              opponent={side === 'w' ? game.blackName : game.whiteName}
                              opponentRating={side === 'w' ? game.blackRating : game.whiteRating}
                              sub={`${openingFamily(game.opening) ?? 'Unnamed opening'} · ${game.timeClass} ${formatTimeControl(game.timeControl)}`}
                              accuracy={acc ? (side === 'w' ? acc.white : acc.black) : null}
                              reviewed={Boolean(acc)}
                            />
                          );
                        })}
                      </div>
                    )}
                    <AccountCardFoot username={account.username} lastRefreshedAt={account.lastRefreshedAt?.toISOString() ?? null} />
                  </Card>
                );
              })}
              {accounts.length < ACCOUNT_LIMIT ? (
                <Card className="border-[1.5px] border-dashed border-rule bg-paper/94 shadow-none">
                  <CardBody>
                    <AddAccount count={accounts.length} />
                  </CardBody>
                </Card>
              ) : null}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <Eyebrow onWood>My reviews</Eyebrow>
            <span className="text-[12.5px] text-paper/50">
              {/* The list is one page deep, so a full page is a floor, not a total. */}
              {library.length === LIBRARY_PAGE
                ? `${LIBRARY_PAGE}+ games`
                : `${library.length} ${library.length === 1 ? 'game' : 'games'}`}
            </span>
          </div>
          <Card className="overflow-hidden">
            {library.length === 0 ? (
              <div className="px-5 py-[22px] text-center text-[14px] text-ink-2">
                Nothing yet. Open a game, or paste a link above.
              </div>
            ) : (
              library.map((row) => {
                const g = row.game;
                const parts = [
                  openingFamily(g.opening) ?? 'Unnamed opening',
                  `${g.timeClass} ${formatTimeControl(g.timeControl)}`,
                  ...(row.side ? [`as ${row.side === 'w' ? 'White' : 'Black'}`] : []),
                  // How a pasted-or-opened game arrived; a share says so with a chip instead.
                  ...(row.source === 'link' ? [row.arrivedFrom ? `opened from chess.com/${row.arrivedFrom}` : 'pasted link'] : []),
                ];
                const common = {
                  href: `/g/${g.id}` as Route,
                  when: whenLabel(row.at),
                  sub: parts.join(' · '),
                  go: 'Open',
                  chip: row.source === 'share' && row.sharedByName ? `shared by ${row.sharedByName.split(' ')[0]}` : undefined,
                };
                // No linked account played it, so there is no seat to win or
                // lose from: the row shows the PGN result and both accuracies.
                // An unfinished game (`*`) gets no chip at all.
                if (row.side === null) {
                  const both =
                    row.whiteAccuracy !== null && row.blackAccuracy !== null
                      ? ([row.whiteAccuracy, row.blackAccuracy] as [number, number])
                      : null;
                  return (
                    <CompactGameRow
                      key={g.id}
                      {...common}
                      result={DECISIVE.has(g.result) ? g.result : undefined}
                      opponent={`${g.whiteName} vs ${g.blackName}`}
                      opponentRating={null}
                      accuracy={null}
                      accuracies={both}
                      reviewed={both !== null}
                    />
                  );
                }
                return (
                  <CompactGameRow
                    key={g.id}
                    {...common}
                    outcome={outcomeFor(g, row.side === 'w' ? g.whiteUsername : g.blackUsername)}
                    opponent={row.side === 'w' ? g.blackName : g.whiteName}
                    opponentRating={row.side === 'w' ? g.blackRating : g.whiteRating}
                    accuracy={row.accuracy}
                    reviewed={row.accuracy !== null}
                  />
                );
              })
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
