import type { Route } from 'next';
import Link from 'next/link';

import { ResultBadge } from './result-badge';
import type { Outcome } from '@/lib/game-labels';

interface CompactRowBase {
  href: Route;
  when: string;
  opponent: string;
  opponentRating: number | null;
  /** "London System · rapid 10+0" (home card) or "… · as Black" (library). */
  sub: string;
  accuracy: number | null;
  /**
   * Both seats, for a game the member did not play: "94.1 · 88.0", or `null`
   * for an unread one. When given it replaces `accuracy`.
   */
  accuracies?: [number, number] | null;
  reviewed: boolean;
  /** Button text override: "Open" on the library. Defaults to "See review"/"Review". */
  go?: string;
  /** "shared by Ravi", rendered as a brass chip after `sub`. */
  chip?: string;
}

/**
 * A row carries the member's own W/L badge, or — for a game no linked account
 * played — the PGN `result` as a quiet chip. One of the two, never both, and
 * neither for an unfinished game whose result is `*`.
 */
export type CompactRow = CompactRowBase &
  ({ outcome: Outcome; result?: never } | { outcome?: never; result?: string });

/** `.gamerow.gamerow--compact`: 52px · 1fr · auto, 11px 15px padding. */
export function CompactGameRow({
  href,
  when,
  outcome,
  result,
  opponent,
  opponentRating,
  sub,
  accuracy,
  accuracies,
  reviewed,
  go,
  chip,
}: CompactRow) {
  return (
    <Link
      href={href}
      // ≤860px the prototype (docs/design/app.html ~line 653) drops the date
      // under the opponent and keeps the accuracies in their own right-hand
      // column. The area names are gated on the same breakpoint: at desktop
      // the three-column template names no areas, and an unmatched
      // `grid-area` would place the cell in an implicit fourth column.
      className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-[11px] border-b border-rule-2 px-[15px] py-[11px] text-ink no-underline last:border-b-0 hover:bg-brass/9 max-[860px]:[grid-template-areas:'opp_accs''when_accs'] max-[860px]:grid-cols-[minmax(0,1fr)_auto] max-[860px]:gap-x-3 max-[860px]:gap-y-0 max-[860px]:py-[13px]"
    >
      <span className="font-mono text-[12px] text-ink-3 max-[860px]:[grid-area:when]">{when}</span>
      <span className="flex min-w-0 items-center gap-[9px] max-[860px]:[grid-area:opp] max-[860px]:items-start">
        {result !== undefined ? (
          <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-rule bg-paper-2 px-2.5 py-[3px] font-mono text-[11px] font-semibold text-ink-3">
            {result === '1/2-1/2' ? '½-½' : result}
          </span>
        ) : outcome ? (
          <ResultBadge outcome={outcome} />
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-semibold">
            {opponent}
            {opponentRating ? <span className="ml-1 text-[12px] font-normal text-ink-3">{opponentRating}</span> : null}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            {sub}
            {chip ? (
              <span className="inline-flex items-center rounded-full border border-brass/50 bg-brass/12 px-[7px] py-px text-[11px] font-semibold text-brass-lo">
                {chip}
              </span>
            ) : null}
          </span>
        </span>
      </span>
      <span className="flex items-baseline gap-2 font-mono text-[13px] max-[860px]:[grid-area:accs]">
        <Accuracies accuracy={accuracy} accuracies={accuracies} />
        <span
          className={`rounded-[3px] border px-2.5 py-[5px] text-[12.5px] font-semibold whitespace-nowrap ${
            reviewed ? 'border-felt/45 bg-felt/8 text-felt' : 'border-rule'
          }`}
        >
          {go ?? (reviewed ? 'See review' : 'Review')}
        </span>
      </span>
    </Link>
  );
}

/** The member's own accuracy, or both seats' when the row has no side. */
function Accuracies({ accuracy, accuracies }: Pick<CompactRowBase, 'accuracy' | 'accuracies'>) {
  const unread = <span className="text-[12px] text-ink-3">new</span>;
  if (accuracies !== undefined) {
    if (accuracies === null) return unread;
    return (
      <span>
        <span className="font-semibold">{accuracies[0].toFixed(1)}</span>
        <span className="text-ink-3"> · {accuracies[1].toFixed(1)}</span>
      </span>
    );
  }
  return accuracy !== null ? <span className="font-semibold">{accuracy.toFixed(1)}</span> : unread;
}
