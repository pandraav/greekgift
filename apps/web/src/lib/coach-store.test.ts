import { readFileSync } from 'node:fs';
import path from 'node:path';

import { schema, type Db } from '@greekgift/db';
import type { Review } from '@greekgift/engine';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Coach notes are keyed by the reader's side and the review they describe
 * (review-overhaul design §6.5). The store runs on an in-memory PGlite with
 * the real migrations, 0006 included; nothing here touches DATABASE_URL.
 */

const handle = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock('@/lib/db', () => ({
  get db() {
    return handle.db;
  },
}));

const { makeGame, testDb } = await import('../../test/db');
const { ensureCoachTexts, getCoachTexts, reviewKeyOf } = await import('./coach-store');
const { COACH_VERSION } = await import('@greekgift/coach');

const REVIEW: Review = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../packages/engine/test/fixtures/reviews/opera-game.json'),
    'utf8',
  ),
);
const PERSONA = 'gotham';
const KEY = reviewKeyOf(REVIEW);

beforeAll(async () => {
  handle.db = await testDb();
  await makeGame(handle.db, { id: REVIEW.gameId });
  // A legacy row from before 0006: kept, never read.
  await handle.db.insert(schema.coachTexts).values({
    gameId: REVIEW.gameId,
    ply: REVIEW.moves[0]!.ply,
    personaId: PERSONA,
    audience: 'intermediate',
    data: { ply: REVIEW.moves[0]!.ply, headline: 'Legacy.' },
    source: 'rules',
  });
});

const rowsFor = (perspective: 'w' | 'b' | 'n' | '') =>
  handle.db
    .select()
    .from(schema.coachTexts)
    .where(and(eq(schema.coachTexts.gameId, REVIEW.gameId), eq(schema.coachTexts.perspective, perspective)));

describe('coach notes by perspective', () => {
  it('reviewKeyOf is nodes, build and the coach prose version', () => {
    expect(KEY).toBe(`${REVIEW.nodes}:${REVIEW.engineBuild}:c${COACH_VERSION}`);
  });

  it('writes one row set per side, with the review key, and leaves the legacy row alone', async () => {
    const white = await ensureCoachTexts(REVIEW, PERSONA, { audience: 'intermediate', perspective: 'w' });
    const black = await ensureCoachTexts(REVIEW, PERSONA, { audience: 'intermediate', perspective: 'b' });
    const neutral = await ensureCoachTexts(REVIEW, PERSONA, { audience: 'intermediate', perspective: null });

    const n = REVIEW.moves.length;
    expect(Object.keys(white)).toHaveLength(n);
    expect(await rowsFor('w')).toHaveLength(n);
    expect(await rowsFor('b')).toHaveLength(n);
    expect(await rowsFor('n')).toHaveLength(n);
    expect((await rowsFor('w')).every((r) => r.reviewKey === KEY)).toBe(true);

    const legacy = await rowsFor('');
    expect(legacy).toHaveLength(1);
    expect(legacy[0]!.reviewKey).toBe('');

    // The legacy headline is never served for the first ply.
    const first = REVIEW.moves[0]!.ply;
    expect(white[first]!.headline).not.toBe('Legacy.');

    // White's first move is the member's own under 'w' and the opponent's under 'b'.
    const all = (t: Record<number, { whyItMatters: string; betterWas: string }>) =>
      Object.values(t).map((x) => `${x.whyItMatters} ${x.betterWas}`).join(' ');
    expect(all(neutral)).not.toMatch(/\byou\b|\byour\b/i);
    expect(all(black)).not.toMatch(/\byour (winning )?chances (fell|dropped|sank)\b/i);
  });

  it('reads back what it wrote, keyed by side', async () => {
    const back = await getCoachTexts(REVIEW.gameId, PERSONA, 'intermediate', 'b', KEY);
    const again = await ensureCoachTexts(REVIEW, PERSONA, { audience: 'intermediate', perspective: 'b' });
    expect(again).toEqual(back);
    expect(await getCoachTexts(REVIEW.gameId, PERSONA, 'intermediate', 'b', 'other:key')).toEqual({});
  });
});
