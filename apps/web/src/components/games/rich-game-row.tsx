import type { Classification } from '@greekgift/engine';
import type { Route } from 'next';
import Link from 'next/link';

import { MiniBoard } from './mini-board';
import { ResultBadge } from './result-badge';
import type { Outcome } from '@/lib/game-labels';

export interface RichMoment {
  fen: string;
  hot: string | null;
  classification: Classification | null;
  /** "Blunder · move 10" or "No mistakes". Empty when unread. */
  label: string;
  /** The coach headline, or "Not read yet." */
  headline: string;
}

export interface RichRow {
  gameId: string;
  href: Route;
  when: string;
  delta: number | null;
  outcome: Outcome;
  opponent: string;
  opponentRating: number | null;
  /** "1330 · rapid 10+0 · as White" */
  sub: string;
  read: boolean;
  moment: RichMoment;
  /** "D02 London System · 48 moves · resigned" */
  meta: string;
  accuracy: number | null;
  opponentAccuracy: number | null;
  /**
   * When present, the row opens by submitting a server action instead of
   * navigating — a stranger's page, where opening a game must first check
   * (and record) access. The row renders as a `<form>` around a `<button>`
   * rather than a `<Link>`; never nest an anchor inside a button.
   */
  action?: () => Promise<void>;
}

// The prototype collapses at `@media (max-width:960px)` (docs/design/app.html
// ~line 822); Tailwind v4's built-in `lg` is 1024px and this project defines
// no override, so the desktop grid below is gated on the exact `min-[961px]`
// breakpoint instead, matching the prototype to the pixel.
const ROW_BOX = `grid items-start gap-x-4 gap-y-1.5 px-4 py-3 text-ink no-underline hover:bg-brass/9
  [grid-template-areas:'mini_opp_go''mini_moment_moment'] [grid-template-columns:58px_minmax(0,1fr)_auto]
  min-[961px]:items-center min-[961px]:[grid-template-areas:'mini_when_opp_moment_accs_go'] min-[961px]:[grid-template-columns:58px_66px_214px_minmax(0,1fr)_118px_100px]`;

// The hairline lives on whatever is the list's direct child — the link, or
// the form wrapping the button — so `last:` counts rows and not grid cells.
const ROW_RULE = 'border-b border-rule-2 last:border-b-0';

function RichRowContent(row: RichRow) {
  const { moment } = row;
  return (
    <>
      <span className="[grid-area:mini]">
        <MiniBoard fen={moment.fen} hot={moment.hot} classification={moment.classification} dim={!row.read} />
      </span>

      <span className="hidden flex-col gap-[3px] font-mono text-[12px] text-ink-3 min-[961px]:flex min-[961px]:[grid-area:when]">
        {row.when}
        {row.delta !== null ? (
          <span className={`text-[11.5px] font-semibold ${row.delta >= 0 ? 'text-felt' : 'text-lacquer'}`}>
            {row.delta >= 0 ? `+${row.delta}` : `−${Math.abs(row.delta)}`}
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 items-center gap-[9px] [grid-area:opp]">
        <ResultBadge outcome={row.outcome} />
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-semibold">{row.opponent}</span>
          <span className="block text-[12.5px] text-ink-3">{row.sub}</span>
        </span>
      </span>

      <span className="flex min-w-0 flex-col gap-1 [grid-area:moment]">
        <span
          className={`font-display text-[14.5px] leading-[1.25] min-[961px]:truncate min-[961px]:text-[15.5px] ${row.read ? '' : 'text-ink-3 italic'}`}
          style={{ fontVariationSettings: '"SOFT" 20, "WONK" 1' }}
        >
          {moment.headline}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3 min-[961px]:flex-nowrap min-[961px]:overflow-hidden min-[961px]:whitespace-nowrap">
          {moment.label ? (
            <span
              className="inline-flex items-center rounded-full border px-[7px] py-px text-[11px] font-semibold"
              style={{
                color: `var(--c-${moment.classification ?? 'best'})`,
                borderColor: `color-mix(in srgb, var(--c-${moment.classification ?? 'best'}) 45%, transparent)`,
                background: `color-mix(in srgb, var(--c-${moment.classification ?? 'best'}) 10%, transparent)`,
              }}
            >
              {moment.label}
            </span>
          ) : null}
          {row.meta}
        </span>
      </span>

      <span className="hidden min-[961px]:grid min-[961px]:[grid-area:accs] min-[961px]:grid-cols-[auto_auto] min-[961px]:items-baseline min-[961px]:gap-x-2 font-mono text-[13.5px]">
        {row.accuracy !== null ? (
          <>
            <span className="text-[15px] font-semibold">{row.accuracy.toFixed(1)}</span>
            <span className="text-ink-3">{row.opponentAccuracy !== null ? row.opponentAccuracy.toFixed(1) : ''}</span>
            <i className="col-span-2 mt-1 block h-1 w-full overflow-hidden rounded-full bg-paper-3">
              <b className="block h-full rounded-full bg-felt" style={{ width: `${row.accuracy}%` }} />
            </i>
          </>
        ) : (
          <span className="col-span-2 text-[12.5px] text-ink-3">not read</span>
        )}
      </span>

      <span className="justify-self-end [grid-area:go]">
        <span
          className={`inline-flex items-center rounded-[3px] border px-3 py-1.5 text-[13px] font-semibold ${
            row.read
              ? 'border-rule bg-transparent text-ink'
              : 'border-brass-lo bg-gradient-to-b from-brass-hi to-brass text-wood-900'
          }`}
        >
          {row.read ? 'See review' : 'Run review'}
        </span>
      </span>
    </>
  );
}

/**
 * `.gamerow.gamerow--rich`: 58px · 66px · 214px · 1fr · 118px · 100px at
 * desktop; at ≤960px the prototype collapses to mini · content · go with the
 * date and accuracies hidden.
 *
 * Renders as a `<Link>` by default. When `action` is given (a stranger's
 * page, where opening a game runs a server action first) it renders as a
 * `<form>` around a submit `<button>` instead — never an anchor nested in a
 * button, or vice versa. The form is a plain block carrying the rule, and the
 * button is the grid box: `display:contents` on the form would drop the row
 * out of the list for `:last-child`, and putting it on the button would
 * remove an interactive element from the accessibility tree in some browsers.
 */
export function RichGameRow(row: RichRow) {
  if (row.action) {
    return (
      <form action={row.action} className={`block ${ROW_RULE}`}>
        <button type="submit" className={`${ROW_BOX} w-full text-left`}>
          <RichRowContent {...row} />
        </button>
      </form>
    );
  }

  return (
    <Link href={row.href} className={`${ROW_BOX} ${ROW_RULE}`}>
      <RichRowContent {...row} />
    </Link>
  );
}
