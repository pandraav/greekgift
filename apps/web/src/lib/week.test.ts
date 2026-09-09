import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Game } from '@greekgift/db';
import { factsFor, type Review } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { openingFamily, outcomeFor, terminationLabel } from './game-labels';
import {
  gameMoment,
  habitLabel,
  weekGames,
  weekRatingDelta,
  weekSummary,
  weekWindow,
} from './week';

const fixture = (name: string): Review =>
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../../../packages/engine/test/fixtures/reviews', `${name}.json`), 'utf8'),
  ) as Review;

const NOW = new Date('2026-09-07T12:00:00Z');
const day = (d: number, h = 12) => new Date(Date.UTC(2026, 8, d, h));

let seq = 0;
function game(over: Partial<Game> & { endTime: Date; mine: 'w' | 'b'; result: 'win' | 'lose' | 'draw'; rating: number; timeClass?: Game['timeClass']; opening?: string | null }): Game {
  seq += 1;
  const win = over.result === 'win';
  const draw = over.result === 'draw';
  const mineRes = win ? 'win' : draw ? 'agreed' : 'resigned';
  const theirRes = win ? 'resigned' : draw ? 'agreed' : 'win';
  return {
    id: String(seq),
    uuid: `u${seq}`,
    url: '',
    pgn: '',
    timeClass: over.timeClass ?? 'rapid',
    timeControl: '600',
    rated: true,
    endTime: over.endTime,
    whiteUsername: over.mine === 'w' ? 'me' : 'them',
    whiteName: over.mine === 'w' ? 'me' : 'them',
    whiteRating: over.mine === 'w' ? over.rating : 1000,
    whiteResult: over.mine === 'w' ? mineRes : theirRes,
    blackUsername: over.mine === 'b' ? 'me' : 'them',
    blackName: over.mine === 'b' ? 'me' : 'them',
    blackRating: over.mine === 'b' ? over.rating : 1000,
    blackResult: over.mine === 'b' ? mineRes : theirRes,
    result: draw ? '1/2-1/2' : win === (over.mine === 'w') ? '1-0' : '0-1',
    termination: null,
    eco: null,
    ecoUrl: null,
    opening: over.opening ?? 'London System',
    plies: 40,
    finalFen: null,
    ccAccuracyWhite: null,
    ccAccuracyBlack: null,
    importedAt: NOW,
  };
}

describe('labels', () => {
  it('outcome, family, termination', () => {
    const g = game({ endTime: day(6), mine: 'w', result: 'win', rating: 1200, opening: 'Caro-Kann Defense, Exchange Variation' });
    expect(outcomeFor(g, 'me')).toBe('won');
    expect(outcomeFor(g, 'them')).toBe('lost');
    expect(openingFamily(g.opening)).toBe('Caro-Kann Defense');
    expect(terminationLabel(g, 'me')).toBe('resigned');
    const t = game({ endTime: day(6), mine: 'b', result: 'lose', rating: 1200 });
    t.blackResult = 'timeout';
    expect(terminationLabel(t, 'me')).toBe('lost on time');
  });
});

describe('weekWindow and weekGames', () => {
  it('is now minus seven days, inclusive, newest first', () => {
    const { since } = weekWindow(NOW);
    expect(since.toISOString()).toBe('2026-08-31T12:00:00.000Z');
    const inside = game({ endTime: day(6), mine: 'w', result: 'win', rating: 1210 });
    const edge = game({ endTime: since, mine: 'w', result: 'win', rating: 1205 });
    const outside = game({ endTime: new Date(since.getTime() - 1), mine: 'w', result: 'lose', rating: 1200 });
    const week = weekGames([outside, inside, edge], 'me', since);
    expect(week.map((w) => w.game.id)).toEqual([inside.id, edge.id]);
    expect(week[0]).toMatchObject({ side: 'w', outcome: 'won' });
  });

  it('deltas come from the previous game of the same class across everything stored', () => {
    const older = game({ endTime: day(1), mine: 'w', result: 'win', rating: 1200 });
    const blitz = game({ endTime: day(2), mine: 'b', result: 'lose', rating: 900, timeClass: 'blitz' });
    const first = game({ endTime: day(3), mine: 'b', result: 'lose', rating: 1192 });
    const second = game({ endTime: day(5), mine: 'w', result: 'win', rating: 1201 });
    const week = weekGames([older, blitz, first, second], 'me', weekWindow(NOW).since);
    const byId = Object.fromEntries(week.map((w) => [w.game.id, w.ratingDelta]));
    expect(byId[second.id]).toBe(9);
    expect(byId[first.id]).toBe(-8);
    expect(byId[blitz.id]).toBeNull(); // no earlier blitz game
    expect(weekRatingDelta([older, blitz, first, second], 'me', 'rapid', weekWindow(NOW).since)).toBe(1); // 1201 − 1200
    expect(weekRatingDelta([older, blitz, first, second], 'me', 'bullet', weekWindow(NOW).since)).toBeNull();
  });
});

describe('weekSummary', () => {
  const review = fixture('review-json-game'); // usernames "white" / "black", both blunder-prone
  const facts = (r: Review, ply: number) => factsFor(r, ply);

  it('record, played, read, accuracy, most played with record', () => {
    const a = game({ endTime: day(6), mine: 'w', result: 'win', rating: 1200, opening: 'London System' });
    const b = game({ endTime: day(5), mine: 'w', result: 'lose', rating: 1190, opening: 'London System, Main Line' });
    const c = game({ endTime: day(4), mine: 'b', result: 'draw', rating: 1190, opening: 'Caro-Kann Defense' });
    a.whiteUsername = 'white';
    b.whiteUsername = 'white';
    c.blackUsername = 'white';
    const week = weekGames([a, b, c], 'white', weekWindow(NOW).since);
    const s = weekSummary(week, { [a.id]: review }, 'white', facts);
    expect(s.record).toEqual({ w: 1, d: 1, l: 1 });
    expect(s.played).toBe(3);
    expect(s.read).toBe(1);
    expect(s.accuracy).toBeCloseTo(review.white.accuracy, 5);
    expect(s.mostPlayed).toEqual({ name: 'London System', count: 2, record: { w: 1, d: 0, l: 1 } });
  });

  it('nothing read → no accuracy, and the habit floor', () => {
    const a = game({ endTime: day(6), mine: 'w', result: 'win', rating: 1200 });
    const s = weekSummary(weekGames([a], 'me', weekWindow(NOW).since), {}, 'me', facts);
    expect(s.accuracy).toBeNull();
    expect(s.habit).toEqual({ label: 'Nothing recurring yet.', sub: '' });
  });

  it('the costliest habit is the most frequent lead situation over blunders, mistakes and misses', () => {
    const a = game({ endTime: day(6), mine: 'w', result: 'lose', rating: 1200, opening: 'London System' });
    a.whiteUsername = 'white';
    const s = weekSummary(weekGames([a], 'white', weekWindow(NOW).since), { [a.id]: review }, 'white', facts);
    const qualifying = review.moves.filter((m) => m.color === 'w' && ['blunder', 'mistake', 'miss'].includes(m.classification));
    expect(qualifying.length).toBeGreaterThanOrEqual(2);
    expect(s.habit.label).not.toBe('Nothing recurring yet.');
    expect(s.habit.sub).toBe(`${qualifying.length} blunders, all in the London System`);
  });

  it('habit labels map every kind', () => {
    expect(habitLabel('hung_piece')).toBe('Hanging pieces');
    expect(habitLabel('missed_capture')).toBe('Missing free material');
    expect(habitLabel('back_rank')).toBe('Letting mates in');
    expect(habitLabel('walked_into_skewer')).toBe('Walking into tactics');
    expect(habitLabel('quiet_loss')).toBe('Losing the thread');
  });
});

describe('gameMoment', () => {
  it('uses the top key moment for the side, with the landing square', () => {
    const review = fixture('review-json-game');
    const m = gameMoment(review, 'b');
    const km = review.keyMoments.find((k) => review.moves[k.ply - 1]!.color === 'b')!;
    expect(m.ply).toBe(km.ply);
    expect(m.fen).toBe(review.moves[km.ply - 1]!.fenAfter);
    expect(m.square).toBe(review.moves[km.ply - 1]!.uci.slice(2, 4));
    expect(m.classification).toBe(review.moves[km.ply - 1]!.classification);
  });

  it('falls back to the final position with no hot square', () => {
    const review = { ...fixture('review-json-game'), keyMoments: [] };
    const m = gameMoment(review, 'w');
    expect(m.ply).toBeNull();
    expect(m.square).toBeNull();
    expect(m.classification).toBeNull();
    expect(m.fen).toBe(review.moves.at(-1)!.fenAfter);
  });

  it('a review with no moves is the start position, not a crash', () => {
    const m = gameMoment({ ...fixture('review-json-game'), keyMoments: [], moves: [] }, 'w');
    expect(m).toEqual({
      ply: null,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      square: null,
      classification: null,
    });
  });
});
