import { readFileSync } from 'node:fs';
import path from 'node:path';

import { schema, type Db } from '@greekgift/db';
import { parsePgn, SCORING_VERSION, type PositionEval, type Review } from '@greekgift/engine';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Stored reviews are keyed by engine build + scoring version; cached evals
 * by the plain engine build (review-overhaul §4.1). In-memory PGlite with the
 * real migrations; nothing here touches DATABASE_URL.
 */

const handle = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock('@/lib/db', () => ({
  get db() {
    return handle.db;
  },
}));

const { makeGame, testDb } = await import('../../test/db');
const { ENGINE_BUILD, reviewCacheKey } = await import('./engine/settings');
const { getOrRebuildReview, getReview, getAccuracies } = await import('./review-store');

const PGN = `[White "alice"]
[Black "bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
const KEY = { nodes: 1000, engineBuild: ENGINE_BUILD };
const { fens, moves } = parsePgn(PGN);

/** Engine output for every position: the played move is always the top line. */
const evalRows = (upTo = fens.length) =>
  fens.slice(0, upTo).map((fen, i) => ({
    fen,
    nodes: KEY.nodes,
    engineBuild: ENGINE_BUILD,
    lines: (i < moves.length
      ? [{ multipv: 1, score: { cp: 30 }, pv: [moves[i]!.uci], depth: 12, nodes: 1000 }]
      : []) as PositionEval['lines'],
  }));

let game: typeof schema.games.$inferSelect;

beforeAll(async () => {
  handle.db = await testDb();
  game = await makeGame(handle.db, { id: 'g1', pgn: PGN, plies: moves.length });
  await makeGame(handle.db, { id: 'g2', pgn: PGN, plies: moves.length });
});

describe('reviewCacheKey', () => {
  it('adds the scoring version to the engine build, and only for reviews', () => {
    expect(reviewCacheKey(KEY)).toEqual({
      nodes: 1000,
      engineBuild: `${ENGINE_BUILD}+${SCORING_VERSION}`,
    });
    expect(reviewCacheKey().engineBuild).toBe(`${ENGINE_BUILD}+${SCORING_VERSION}`);
    // Idempotent: a review key passed back in is not versioned twice.
    expect(reviewCacheKey(reviewCacheKey(KEY))).toEqual(reviewCacheKey(KEY));
  });
});

describe('getOrRebuildReview', () => {
  it('returns null while a position still needs the engine', async () => {
    await handle.db.insert(schema.positionEvals).values(evalRows(fens.length - 1));
    expect(await getOrRebuildReview(game, KEY)).toBeNull();
  });

  it('ignores a review stored under the old, unversioned key', async () => {
    await handle.db.insert(schema.reviews).values({
      gameId: game.id,
      nodes: KEY.nodes,
      engineBuild: ENGINE_BUILD,
      data: { stale: true },
      whiteAccuracy: 1,
      blackAccuracy: 1,
    });
    expect(await getReview(game.id, KEY)).toBeNull();
  });

  it('rebuilds from cached evals once every position is there, and stores it', async () => {
    await handle.db.insert(schema.positionEvals).values(evalRows().slice(-1));

    const review = await getOrRebuildReview(game, KEY);
    expect(review).not.toBeNull();
    expect(review!.moves).toHaveLength(moves.length);
    expect(review!.engineBuild).toBe(`${ENGINE_BUILD}+${SCORING_VERSION}`);
    expect(review!.moves.at(-1)!.san).toBe('Qxf7#');

    const rows = await handle.db
      .select({ build: schema.reviews.engineBuild })
      .from(schema.reviews)
      .where(eq(schema.reviews.gameId, game.id));
    expect(rows.map((r) => r.build).sort()).toEqual(
      [ENGINE_BUILD, `${ENGINE_BUILD}+${SCORING_VERSION}`].sort(),
    );

    // Evals stay under the plain build: nothing new was written there.
    const evals = await handle.db.select().from(schema.positionEvals);
    expect(new Set(evals.map((e) => e.engineBuild))).toEqual(new Set([ENGINE_BUILD]));

    expect(await getReview(game.id, KEY)).toEqual(review);
    expect(await getAccuracies([game.id], KEY)).toEqual({
      [game.id]: { white: review!.white.accuracy, black: review!.black.accuracy },
    });
  });

  it('shares cached evals across games with the same positions', async () => {
    const other = (await handle.db.select().from(schema.games).where(eq(schema.games.id, 'g2')))[0]!;
    const review = await getOrRebuildReview(other, KEY);
    expect(review?.gameId).toBe('g2');
  });
});

describe('rebuild of a real clocked game (§14.7)', () => {
  const fixtures = path.resolve(import.meta.dirname, '../../../../packages/engine/test/fixtures');
  const stored: Review = JSON.parse(readFileSync(path.join(fixtures, 'clocked/184269442794.json'), 'utf8'));
  const games: { id: string; pgn: string; white: { result: string }; black: { result: string } }[] =
    JSON.parse(readFileSync(path.join(fixtures, 'chesscom-games.json'), 'utf8'));
  const g = games.find((x) => x.id === '184269442794')!;

  it('reads clocks, time control and the ending from the games row, with no engine run', async () => {
    const row = await makeGame(handle.db, {
      id: g.id,
      pgn: g.pgn,
      plies: stored.moves.length,
      whiteUsername: 'kafka_f0',
      blackUsername: 'jakeleupen',
      whiteResult: g.white.result,
      blackResult: g.black.result,
      result: '0-1',
    });
    const evals = [...stored.moves.map((m) => m.evalBefore), stored.moves.at(-1)!.evalAfter];
    await handle.db
      .insert(schema.positionEvals)
      .values(
        [...new Map(evals.map((e) => [e.fen, e])).values()].map((e) => ({
          fen: e.fen,
          nodes: 300_000,
          engineBuild: ENGINE_BUILD,
          lines: e.lines,
        })),
      )
      .onConflictDoNothing();

    const review = (await getOrRebuildReview(row, { nodes: 300_000, engineBuild: ENGINE_BUILD }))!;
    expect(review.engineBuild).toBe(`${ENGINE_BUILD}+${SCORING_VERSION}`);
    expect(review.timeControl).toEqual({ base: 600_000, increment: 0, daily: false });
    expect(review.moves.at(-2)!.clock).toEqual({ left: 48_100, spent: 40_700 });
    expect(review.ending).toMatchObject({
      kind: 'timeout',
      winner: 'b',
      onBoard: false,
      finalThink: 48_100,
      clocks: { w: 0, b: 214_700 },
      verdictAtEnd: { w: 'equal', b: 'equal' },
    });
  });
});
