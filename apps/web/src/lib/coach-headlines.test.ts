import { schema, type Db } from '@greekgift/db';
import { beforeAll, describe, expect, it } from 'vitest';

import { makeGame, testDb } from '../../test/db';
import { getCoachHeadlines } from './coach-headlines';

const PERSONA = 'the-club-captain';
const KEY = '2000000:sf18-lite';

let db: Db;
beforeAll(async () => {
  db = await testDb();
  await makeGame(db, { id: 'g1' });
  const row = (ply: number, headline: string, perspective: 'w' | 'b' | 'n' | '', reviewKey: string) => ({
    gameId: 'g1',
    ply,
    personaId: PERSONA,
    audience: 'intermediate' as const,
    perspective,
    reviewKey,
    data: { ply, headline },
    source: 'rules' as const,
  });
  await db.insert(schema.coachTexts).values([
    row(21, 'You hung the knight on f6.', 'w', KEY),
    row(21, 'Your opponent hung the knight on f6.', 'b', KEY),
    row(21, 'White hung the knight on f6.', 'n', KEY),
    row(22, 'A quiet reply.', 'w', KEY),
    // A legacy row and a row from an older review: kept, never read.
    row(23, 'Legacy voice.', '', ''),
    row(24, 'Older review.', 'w', '500000:sf18-lite'),
  ]);
});

describe('getCoachHeadlines', () => {
  it('returns the headline for the asked-for ply only, keyed by game', async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({
      g1: 'You hung the knight on f6.',
    });
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 22, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({
      g1: 'A quiet reply.',
    });
  });

  it("reads the note written from the entry's side", async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'b' }], PERSONA, 'intermediate', KEY)).toEqual({
      g1: 'Your opponent hung the knight on f6.',
    });
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'n' }], PERSONA, 'intermediate', KEY)).toEqual({
      g1: 'White hung the knight on f6.',
    });
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 22, perspective: 'b' }], PERSONA, 'intermediate', KEY)).toEqual({});
  });

  it('never reads a legacy row or a note from another review', async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 23, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 24, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'w' }], PERSONA, 'intermediate', '')).toEqual({});
  });

  it('misses the wrong ply, the wrong persona, the wrong audience and the wrong game', async () => {
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 25, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'w' }], 'someone-else', 'intermediate', KEY)).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g1', ply: 21, perspective: 'w' }], PERSONA, 'beginner', KEY)).toEqual({});
    expect(await getCoachHeadlines(db, [{ gameId: 'g2', ply: 21, perspective: 'w' }], PERSONA, 'intermediate', KEY)).toEqual({});
  });

  it('asks nothing for no entries', async () => {
    expect(await getCoachHeadlines(db, [], PERSONA, 'intermediate', KEY)).toEqual({});
  });
});
