import type { Outcome } from '@/lib/game-labels';

const TONE: Record<Outcome, string> = { won: 'bg-felt', drawn: 'bg-ink-3', lost: 'bg-lacquer' };
const LETTER: Record<Outcome, string> = { won: 'W', drawn: '½', lost: 'L' };

/**
 * `.res` in the prototype: 19px, mono, white on felt/ink/lacquer.
 *
 * The title is the bare outcome word: the same badge appears on a stranger's
 * page and on library rows with no side of ours, where "You won" would be a
 * lie.
 */
export function ResultBadge({ outcome }: { outcome: Outcome }) {
  return (
    <span
      className={`grid size-[19px] shrink-0 place-items-center rounded-[3px] font-mono text-[11px] font-bold text-white ${TONE[outcome]}`}
      title={outcome}
    >
      {LETTER[outcome]}
    </span>
  );
}
