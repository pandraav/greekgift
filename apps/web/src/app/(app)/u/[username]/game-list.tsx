import type { Game } from '@greekgift/db';
import { formatTimeControl } from '@greekgift/engine';
import Link from 'next/link';

import { Card } from '@/components/ui';

/** How the game ended, from the loser's or winner's `result` string. */
function outcome(game: Game, username: string) {
  const iAmWhite = game.whiteUsername === username;
  const mine = iAmWhite ? game.whiteResult : game.blackResult;
  if (mine === 'win') return { letter: 'W', tone: 'bg-felt', label: 'won' };
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(mine))
    return { letter: '½', tone: 'bg-ink-3', label: 'drawn' };
  return { letter: 'L', tone: 'bg-lacquer', label: 'lost' };
}

const when = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function GameList({
  username,
  games,
}: {
  username: string;
  games: Game[];
}) {
  if (games.length === 0) {
    return (
      <Card>
        <div className="rounded-[5px] px-6 py-12 text-center">
          <h3 className="mb-1.5 text-[19px] font-semibold">No games yet</h3>
          <p className="mx-auto max-w-[44ch] text-[14.5px] text-ink-2">
            Either this month is empty, or chess.com has nothing public for
            that username.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {games.map((game) => {
        const iAmWhite = game.whiteUsername === username;
        const opponent = iAmWhite ? game.blackName : game.whiteName;
        const oppRating = iAmWhite ? game.blackRating : game.whiteRating;
        const o = outcome(game, username);

        return (
          <Link
            key={game.id}
            href={`/g/${game.id}`}
            className="grid items-center gap-x-3 gap-y-0.5 border-b border-rule-2 px-4 py-3 text-ink no-underline last:border-b-0 hover:bg-brass/9 sm:px-5
                       [grid-template-areas:'when_acc''opp_acc''open_go'] [grid-template-columns:minmax(0,1fr)_auto]
                       md:[grid-template-areas:'when_opp_open_acc_go'] md:[grid-template-columns:74px_260px_minmax(0,1fr)_84px_92px]"
          >
            <span className="font-mono text-xs text-ink-3 [grid-area:when]">
              {when(game.endTime)}
            </span>

            <span className="flex min-w-0 items-start gap-2.5 [grid-area:opp]">
              <span
                className={`grid size-[19px] shrink-0 place-items-center rounded-[3px] font-mono text-[11px] font-bold text-white ${o.tone}`}
                title={`You ${o.label}`}
              >
                {o.letter}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold">
                  {opponent}
                </span>
                <span className="text-[12.5px] text-ink-3">
                  {oppRating ? `${oppRating} · ` : ''}
                  {game.timeClass} {formatTimeControl(game.timeControl)} · as{' '}
                  {iAmWhite ? 'White' : 'Black'}
                </span>
              </span>
            </span>

            <span className="truncate text-[13px] text-ink-2 [grid-area:open]">
              {game.eco ? `${game.eco} ` : ''}
              {game.opening ?? '—'}
            </span>

            <span className="justify-self-end font-mono text-[13.5px] [grid-area:acc]">
              {game.ccAccuracyWhite !== null && game.ccAccuracyBlack !== null ? (
                <span className="text-ink-3" title="chess.com's own accuracy">
                  {(iAmWhite ? game.ccAccuracyWhite : game.ccAccuracyBlack).toFixed(1)}
                </span>
              ) : (
                <span className="text-[12px] text-ink-3">not reviewed</span>
              )}
            </span>

            <span className="justify-self-end [grid-area:go]">
              <span className="inline-flex items-center rounded-[3px] border border-rule px-3 py-1.5 text-[13px] font-semibold">
                Review
              </span>
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
