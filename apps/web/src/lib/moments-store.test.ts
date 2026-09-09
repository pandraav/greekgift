import { readFileSync } from 'node:fs';
import path from 'node:path';

import { schema, type Db } from '@greekgift/db';
import type { Review } from '@greekgift/engine';
import { beforeAll, describe, expect, it } from 'vitest';

import { makeGame, testDb } from '../../test/db';
import { getMoments } from './moments-store';

const KEY = { nodes: 20_000, engineBuild: 'stockfish-18-lite-single' };
const OTHER_KEY = { nodes: 300_000, engineBuild: 'stockfish-18-lite-single' };

const review = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../../../packages/engine/test/fixtures/reviews/opera-game.json',
    ),
    'utf8',
  ),
) as Review;

let db: Db;
beforeAll(async () => {
  db = await testDb();
  await makeGame(db, { id: 'opera-game' });
  await makeGame(db, { id: 'unread-game' });
  await db.insert(schema.reviews).values({
    gameId: 'opera-game',
    nodes: KEY.nodes,
    engineBuild: KEY.engineBuild,
    data: review,
    whiteAccuracy: review.white.accuracy,
    blackAccuracy: review.black.accuracy,
  });
});

describe('getMoments', () => {
  it('projects the key moments, the five move fields and both accuracies — and no evals', async () => {
    const moments = await getMoments(db, ['opera-game', 'unread-game'], KEY);

    expect(Object.keys(moments)).toEqual(['opera-game']);
    const slim = moments['opera-game']!;

    expect(slim.keyMoments).toEqual(review.keyMoments);
    expect(slim.moves).toHaveLength(review.moves.length);
    expect(slim.white.accuracy).toBeCloseTo(review.white.accuracy, 3);
    expect(slim.black.accuracy).toBeCloseTo(review.black.accuracy, 3);

    for (const [i, move] of slim.moves.entries()) {
      const full = review.moves[i]!;
      // Ordered by ply, five fields, and nothing heavy came back with them.
      expect(Object.keys(move).sort()).toEqual([
        'classification',
        'color',
        'fenAfter',
        'ply',
        'uci',
      ]);
      expect(move).toEqual({
        ply: full.ply,
        color: full.color,
        uci: full.uci,
        fenAfter: full.fenAfter,
        classification: full.classification,
      });
      expect(move).not.toHaveProperty('evalBefore');
      expect(move).not.toHaveProperty('evalAfter');
    }
  });

  it('is keyed by the engine settings, and empty for no ids', async () => {
    expect(await getMoments(db, ['opera-game'], OTHER_KEY)).toEqual({});
    expect(await getMoments(db, [], KEY)).toEqual({});
  });
});
