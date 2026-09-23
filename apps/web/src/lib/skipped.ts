/**
 * Games chess.com lists that the mirror leaves out, and how the home card
 * says so. Pure and client-safe: the refresh route computes the summary and
 * the card renders it.
 *
 * Nothing here is stored. The count exists only in the refresh response (the
 * schema has no column for it), so the card shows it after a refresh in this
 * visit — manual or the automatic one on load — and not on a later page load
 * that did not refresh.
 */

/** Why a game chess.com lists is not in our mirror. */
export type SkipReason = 'variant' | 'no_moves' | 'unparseable';

export interface SkippedSummary {
  /** Games in the week window chess.com listed but that cannot be reviewed. */
  count: number;
  reasons: Partial<Record<SkipReason, number>>;
}

const WORD: Record<SkipReason, string> = {
  variant: 'variant',
  no_moves: 'aborted',
  unparseable: 'unreadable',
};

/** `2 games not reviewable: variant/aborted`, or null when nothing was skipped. */
export function skippedLabel(s: SkippedSummary | null | undefined): string | null {
  if (!s || s.count <= 0) return null;
  const reasons = (Object.keys(WORD) as SkipReason[]).filter((r) => (s.reasons[r] ?? 0) > 0).map((r) => WORD[r]);
  const noun = s.count === 1 ? 'game' : 'games';
  return `${s.count} ${noun} not reviewable${reasons.length ? `: ${reasons.join('/')}` : ''}`;
}
