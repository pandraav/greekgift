import { schema, type Db } from '@greekgift/db';
import { beforeAll, describe, expect, it } from 'vitest';

import { makeGame, testDb } from '../../test/db';
import { getCoachHeadlines } from './coach-headlines';

const PERSONA = 'the-club-captain';

let db: Db;
beforeAll(async () => {
  db = await testDb();
  await makeGame(db, { id: 'g1' });
  await db.insert(schema.coachTexts).values([
    {
      gameId: 'g1',
      ply: 21,
      personaId: PERSONA,
      audience: 'intermediate',
      data: { ply: 21, headline: 'You hung the knight on f6.' },
      source: 'rules',
    },
    {
      gameId: 'g1',
      ply: 22,
      personaId: PERSONA,
      audience: 'intermediate',
      data: { ply: 22, headline: 'A quiet reply.' },
      source: 'rules',
    },
  ]);
});

describe('getCoachHeadlines', () => {
  it('returns the headline for the asked-for ply only, keyed by game', async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21 }], PERSONA, 'intermediate')).toEqual({
      g1: 'You hung the knight on f6.',
    });
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 22 }], PERSONA, 'intermediate')).toEqual({
      g1: 'A quiet reply.',
    });
  });

  it('misses the wrong ply, the wrong persona, the wrong audience and the wrong game', async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 23 }], PERSONA, 'intermediate')).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21 }], 'someone-else', 'intermediate')).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21 }], PERSONA, 'beginner')).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g2', ply: 21 }], PERSONA, 'intermediate')).toEqual({});
  });

  it('asks nothing for no entries', async () => {
    expect(await getCoachHeadlines(db, [], PERSONA, 'intermediate')).toEqual({});
  });
});
