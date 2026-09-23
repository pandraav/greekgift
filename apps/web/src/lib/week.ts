import type { Game } from '@greekgift/db';
import type { Classification, Color, MoveFacts, Review, SituationKind } from '@greekgift/engine';

import { openingFamily, outcomeFor, sideOf, type Outcome } from '@/lib/game-labels';
import { START_FEN, type SlimMove } from '@/lib/slim-review';

/**
 * The week, computed from rows already loaded. Pure, so it runs in tests over
 * the engine's fixture reviews and on the server over real ones. Nothing here
 * is stored: the window, the record, the deltas and the summary are all
 * cheap folds (spec §4, §7.3, §7.4).
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekWindow(now: Date = new Date()): { since: Date } {
  return { since: new Date(now.getTime() - WEEK_MS) };
}

export interface WeekGame {
  game: Game;
  side: Color;
  outcome: Outcome;
  /** Post-game rating minus the post-game rating of the previous game in the same class, or null. */
  ratingDelta: number | null;
}

const ratingOf = (g: Game, username: string): number | null =>
  g.whiteUsername === username ? g.whiteRating : g.blackUsername === username ? g.blackRating : null;

/** Delta per game id, over everything passed in, per time class by end time. */
function deltas(games: Game[], username: string): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const byClass = new Map<string, Game[]>();
  for (const g of games) {
    if (!sideOf(g, username)) continue;
    const list = byClass.get(g.timeClass) ?? [];
    list.push(g);
    byClass.set(g.timeClass, list);
  }
  for (const list of byClass.values()) {
    list.sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
    let previous: number | null = null;
    for (const g of list) {
      const now = ratingOf(g, username);
      out.set(g.id, now !== null && previous !== null ? now - previous : null);
      if (now !== null) previous = now;
    }
  }
  return out;
}

export function weekGames(games: Game[], username: string, since: Date): WeekGame[] {
  const d = deltas(games, username);
  return games
    .filter((g) => sideOf(g, username) && g.endTime.getTime() >= since.getTime())
    .sort((a, b) => b.endTime.getTime() - a.endTime.getTime())
    .map((game) => ({
      game,
      side: sideOf(game, username)!,
      outcome: outcomeFor(game, username),
      ratingDelta: d.get(game.id) ?? null,
    }));
}

/** Latest rating in the class minus the rating before the window's first game in it. */
export function weekRatingDelta(games: Game[], username: string, timeClass: string, since: Date): number | null {
  const list = games
    .filter((g) => g.timeClass === timeClass && sideOf(g, username))
    .sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
  const firstInWindow = list.findIndex((g) => g.endTime.getTime() >= since.getTime());
  if (firstInWindow < 0) return null;
  const latest = ratingOf(list.at(-1)!, username);
  const before = ratingOf(list[firstInWindow > 0 ? firstInWindow - 1 : firstInWindow]!, username);
  if (latest === null || before === null) return null;
  return latest - before;
}

export interface WeekSummary {
  record: { w: number; d: number; l: number };
  played: number;
  read: number;
  accuracy: number | null;
  mostPlayed: { name: string; count: number; record: { w: number; d: number; l: number } } | null;
  habit: { label: string; sub: string };
}

const HABIT: Partial<Record<SituationKind, string>> = {
  hung_piece: 'Hanging pieces',
  under_defended: 'Hanging pieces',
  missed_capture: 'Missing free material',
  missed_mate: 'Missing mates',
  allowed_mate: 'Letting mates in',
  back_rank: 'Letting mates in',
  walked_into_fork: 'Walking into tactics',
  walked_into_pin: 'Walking into tactics',
  walked_into_skewer: 'Walking into tactics',
  ignored_threat: 'Ignoring threats',
  trapped_piece: 'Getting pieces trapped',
  king_exposed: 'Leaving the king open',
  unsound_sacrifice: 'Trades that lose',
  traded_behind: 'Trades that lose',
};

export const habitLabel = (kind: SituationKind): string => HABIT[kind] ?? 'Losing the thread';

const QUALIFYING = new Set<Classification>(['blunder', 'mistake', 'miss']);

export function weekSummary(
  week: WeekGame[],
  reviews: Record<string, Review>,
  username: string,
  factsFor: (review: Review, ply: number) => MoveFacts,
): WeekSummary {
  const record = { w: 0, d: 0, l: 0 };
  const tally = (r: typeof record, o: Outcome) => {
    if (o === 'won') r.w += 1;
    else if (o === 'drawn') r.d += 1;
    else r.l += 1;
  };

  const families = new Map<string, { count: number; record: { w: number; d: number; l: number }; latest: number }>();
  const accuracies: number[] = [];
  const habitCounts = new Map<string, number>();
  const habitByFamily = new Map<string, number>();
  let qualifying = 0;

  for (const { game, side, outcome } of week) {
    tally(record, outcome);

    const family = openingFamily(game.opening);
    if (family) {
      const f = families.get(family) ?? { count: 0, record: { w: 0, d: 0, l: 0 }, latest: 0 };
      f.count += 1;
      tally(f.record, outcome);
      f.latest = Math.max(f.latest, game.endTime.getTime());
      families.set(family, f);
    }

    const review = reviews[game.id];
    if (!review) continue;
    accuracies.push(side === 'w' ? review.white.accuracy : review.black.accuracy);

    for (const move of review.moves) {
      if (move.color !== side || !QUALIFYING.has(move.classification)) continue;
      const lead = factsFor(review, move.ply).situations[0]?.kind ?? 'quiet_loss';
      const label = habitLabel(lead);
      habitCounts.set(label, (habitCounts.get(label) ?? 0) + 1);
      if (family) habitByFamily.set(family, (habitByFamily.get(family) ?? 0) + 1);
      qualifying += 1;
    }
  }

  const mostPlayed = [...families.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest)[0];

  let habit = { label: 'Nothing recurring yet.', sub: '' };
  if (qualifying >= 2) {
    const [label] = [...habitCounts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const [topFamily, inFamily] = [...habitByFamily.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const sub =
      inFamily >= 2
        ? inFamily === qualifying
          ? `${qualifying} blunders, all in the ${topFamily}`
          : `${qualifying} blunders, ${inFamily} in the ${topFamily}`
        : `${qualifying} blunders across ${habitByFamily.size} openings`;
    habit = { label, sub };
  }

  return {
    record,
    played: week.length,
    read: accuracies.length,
    accuracy: accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null,
    mostPlayed: mostPlayed
      ? { name: mostPlayed[0], count: mostPlayed[1].count, record: mostPlayed[1].record }
      : null,
    habit,
  };
}

export interface Moment {
  /** Null when the review has no key moment: the final position is shown. */
  ply: number | null;
  fen: string;
  square: string | null;
  classification: Classification | null;
}

/**
 * The turning point (spec §7.5). The highest-severity key moment played by
 * `side`; when the side has none, the top key moment of the game; when the
 * game has none, the final position with no hot square.
 *
 * Takes the slim projection rather than a whole `Review` — a list row needs
 * five fields per move, not an evaluation per ply — and a `Review`
 * structurally satisfies it, so callers holding one still pass it straight in.
 */
export function gameMoment(
  review: Pick<Review, 'keyMoments'> & { moves: SlimMove[] },
  side: Color,
): Moment {
  // A review with no moves at all — an aborted game, or a row written before
  // its moves were — has no last position to fall back to. The start position
  // is the honest answer and keeps every caller's board from throwing.
  if (review.moves.length === 0) {
    return { ply: null, fen: START_FEN, square: null, classification: null };
  }
  // Key moments are stored in ply order (review-overhaul §9.1), so the
  // turning point is picked by severity here, earlier first on a tie.
  const bySeverity = [...review.keyMoments].sort((a, b) => b.severity - a.severity || a.ply - b.ply);
  const moment =
    bySeverity.find((k) => review.moves[k.ply - 1]?.color === side) ?? bySeverity[0];
  if (!moment) {
    return { ply: null, fen: review.moves.at(-1)!.fenAfter, square: null, classification: null };
  }
  const move = review.moves[moment.ply - 1]!;
  return { ply: move.ply, fen: move.fenAfter, square: move.uci.slice(2, 4), classification: move.classification };
}
