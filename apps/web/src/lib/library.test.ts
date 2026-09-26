import { schema, type Db } from '@greekgift/db';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { makeGame, makeUser, testDb } from '../../test/db';
import { ChesscomError } from './chesscom';
import { reviewCacheKey } from './engine/settings';
import {
  AccountError,
  addAccount,
  addToLibrary,
  canSeeGame,
  getAccount,
  isStale,
  libraryReviews,
  listAccounts,
  materialiseAccount,
  membership,
  removeAccount,
  sideOf,
  STALE_AFTER_MS,
  touchOpened,
  userSideFor,
} from './library';

const KEY = { nodes: 300_000, engineBuild: 'stockfish-18-lite-single' };
const fakeEnsure = async (raw: string) => ({
  username: raw.toLowerCase(),
  displayName: raw,
  ratingRapid: null,
  ratingBlitz: null,
  ratingBullet: null,
  archiveCount: 0,
  joinedAt: null,
});

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

describe('accounts', () => {
  it('adds, lowercases, lists in order, and caps at five', async () => {
    const u = await makeUser(db);
    await addAccount(db, u.id, 'Alice', { ensurePlayer: fakeEnsure });
    await expect(addAccount(db, u.id, 'ALICE', { ensurePlayer: fakeEnsure })).rejects.toMatchObject({ code: 'exists' });
    for (const name of ['b11', 'c11', 'd11', 'e11']) await addAccount(db, u.id, name, { ensurePlayer: fakeEnsure });
    let calls = 0;
    await expect(
      addAccount(db, u.id, 'f11', { ensurePlayer: async (r) => { calls += 1; return fakeEnsure(r); } }),
    ).rejects.toMatchObject({ code: 'limit' });
    expect(calls).toBe(0); // 409 before any chess.com call
    expect((await listAccounts(db, u.id)).map((a) => a.username)).toEqual(['alice', 'b11', 'c11', 'd11', 'e11']);
  });

  it('rejects a bad username and a missing player', async () => {
    const u = await makeUser(db);
    await expect(addAccount(db, u.id, 'x', { ensurePlayer: fakeEnsure })).rejects.toBeInstanceOf(AccountError);
    await expect(
      addAccount(db, u.id, 'ghost', { ensurePlayer: () => { throw new ChesscomError('no', 404); } }),
    ).rejects.toMatchObject({ code: 'no_such_player' });
    // A plain object wearing the name is not a ChesscomError, and must not be
    // read as one: anything else out of `ensurePlayer` is a bug, not a 404.
    const impostor = Object.assign(new Error('no'), { name: 'ChesscomError', status: 404 });
    await expect(
      addAccount(db, u.id, 'ghost2', { ensurePlayer: () => { throw impostor; } }),
    ).rejects.toBe(impostor);
  });

  it('getAccount finds one linked account and nothing else', async () => {
    const u = await makeUser(db);
    const other = await makeUser(db);
    await addAccount(db, u.id, 'nell', { ensurePlayer: fakeEnsure });
    expect((await getAccount(db, u.id, 'nell'))?.username).toBe('nell');
    expect(await getAccount(db, u.id, 'nobody')).toBeNull();
    expect(await getAccount(db, other.id, 'nell')).toBeNull();
  });

  it('isStale: null or older than an hour, with the boundary itself fresh', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date('2026-09-07T10:59:00Z'), now)).toBe(true);
    expect(isStale(new Date('2026-09-07T11:01:00Z'), now)).toBe(false);
    // Exactly an hour is not yet stale; a millisecond past it is.
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS), now)).toBe(false);
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS - 1), now)).toBe(true);
  });
});

describe('visibility', () => {
  it('by linked account (live, before materialisation) and by row', async () => {
    const u = await makeUser(db);
    const g = await makeGame(db, { id: '100', whiteUsername: 'carol' });
    expect(await membership(db, u.id, g.id)).toBeNull();
    expect(await canSeeGame(db, { id: u.id, role: 'member' }, g.id)).toBe(false);

    await addAccount(db, u.id, 'carol', { ensurePlayer: fakeEnsure });
    expect(await membership(db, u.id, g.id)).toBe('account');
    expect(await canSeeGame(db, { id: u.id, role: 'member' }, g.id)).toBe(true);

    await addToLibrary(db, u.id, g.id, { source: 'link' });
    expect(await membership(db, u.id, g.id)).toBe('link');
  });

  it('admins see everything and get no rows from touchOpened', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const g = await makeGame(db, { id: '101' });
    expect(await canSeeGame(db, { id: admin.id, role: 'admin' }, g.id)).toBe(true);
    await touchOpened(db, { id: admin.id, role: 'admin' }, g.id);
    expect(await membership(db, admin.id, g.id)).toBeNull();
  });
});

describe('materialise and precedence', () => {
  it('materialise is idempotent and never downgrades link or share rows', async () => {
    const u = await makeUser(db);
    const other = await makeUser(db);
    await addAccount(db, u.id, 'dave', { ensurePlayer: fakeEnsure });
    const a = await makeGame(db, { id: '200', whiteUsername: 'dave' });
    const b = await makeGame(db, { id: '201', blackUsername: 'dave' });
    await addToLibrary(db, u.id, b.id, { source: 'share', sharedBy: other.id });

    await materialiseAccount(db, u.id, 'dave');
    await materialiseAccount(db, u.id, 'dave');
    expect(await membership(db, u.id, a.id)).toBe('account');
    expect(await membership(db, u.id, b.id)).toBe('share');

    // account → link is an upgrade; link → account is not.
    await addToLibrary(db, u.id, a.id, { source: 'link' });
    expect(await membership(db, u.id, a.id)).toBe('link');
    await addToLibrary(db, u.id, a.id, { source: 'account', accountUsername: 'dave' });
    expect(await membership(db, u.id, a.id)).toBe('link');
  });

  it('removing an account deletes only its account rows', async () => {
    const u = await makeUser(db);
    await addAccount(db, u.id, 'erin', { ensurePlayer: fakeEnsure });
    const mine = await makeGame(db, { id: '300', whiteUsername: 'erin' });
    const pasted = await makeGame(db, { id: '301', whiteUsername: 'erin' });
    await materialiseAccount(db, u.id, 'erin');
    await addToLibrary(db, u.id, pasted.id, { source: 'link' });

    await removeAccount(db, u.id, 'erin');
    expect(await listAccounts(db, u.id)).toEqual([]);
    expect(await membership(db, u.id, mine.id)).toBeNull();
    expect(await membership(db, u.id, pasted.id)).toBe('link');
  });
});

describe('touchOpened and libraryReviews', () => {
  it('inserts an account row when membership is by username only, then orders by opened-or-added', async () => {
    const u = await makeUser(db);
    const sharer = await makeUser(db, { name: 'Ravi Pandey' });
    await addAccount(db, u.id, 'fay', { ensurePlayer: fakeEnsure });
    const played = await makeGame(db, { id: '400', blackUsername: 'fay', endTime: new Date('2026-09-01T00:00:00Z') });
    const shared = await makeGame(db, { id: '401' });
    await addToLibrary(db, u.id, shared.id, { source: 'share', sharedBy: sharer.id });

    await db.insert(schema.reviews).values({
      gameId: played.id, nodes: KEY.nodes, engineBuild: reviewCacheKey(KEY).engineBuild,
      data: {}, whiteAccuracy: 70, blackAccuracy: 61.8,
    });

    await touchOpened(db, { id: u.id, role: 'member' }, played.id);
    const [row] = await db.select().from(schema.userGames)
      .where(and(eq(schema.userGames.userId, u.id), eq(schema.userGames.gameId, played.id)));
    expect(row?.source).toBe('account');
    expect(row?.accountUsername).toBe('fay');
    expect(row?.openedAt).not.toBeNull();

    const rows = await libraryReviews(db, u.id, KEY);
    expect(rows.map((r) => r.game.id)).toEqual([played.id, shared.id]);
    expect(rows[0]).toMatchObject({ side: 'b', accuracy: 61.8, source: 'account', sharedByName: null });
    expect(rows[1]).toMatchObject({ side: null, accuracy: null, source: 'share', sharedByName: 'Ravi Pandey' });
  });

  it('a linked/pasted game the member did not play has null side and null accuracy, even with a review', async () => {
    const u = await makeUser(db);
    const stranger = await makeGame(db, { id: '402', whiteUsername: 'ivan', blackUsername: 'jill' });
    await addToLibrary(db, u.id, stranger.id, { source: 'link' });
    await db.insert(schema.reviews).values({
      gameId: stranger.id, nodes: KEY.nodes, engineBuild: reviewCacheKey(KEY).engineBuild,
      data: {}, whiteAccuracy: 88, blackAccuracy: 42,
    });
    // A pasted link only surfaces in "My reviews" once opened.
    await touchOpened(db, { id: u.id, role: 'member' }, stranger.id);

    const [row] = await libraryReviews(db, u.id, KEY);
    // The row still knows both seats' accuracy — it shows "88.0 · 42.0" —
    // it just has no seat of its own to call the member's.
    expect(row).toMatchObject({
      side: null,
      accuracy: null,
      whiteAccuracy: 88,
      blackAccuracy: 42,
      source: 'link',
      arrivedFrom: null,
    });
  });

  it('a link row opened from a player page remembers the page, and unlinking that player leaves it', async () => {
    const u = await makeUser(db);
    await addAccount(db, u.id, 'dave', { ensurePlayer: fakeEnsure });
    const theirs = await makeGame(db, { id: '403', whiteUsername: 'ivan', blackUsername: 'jill' });
    await addToLibrary(db, u.id, theirs.id, { source: 'link', accountUsername: 'dave' });
    await touchOpened(db, { id: u.id, role: 'member' }, theirs.id);

    const [row] = await libraryReviews(db, u.id, KEY);
    expect(row).toMatchObject({ source: 'link', arrivedFrom: 'dave' });

    // `removeAccount` deletes `account` rows only; a game opened from dave's
    // page is the member's own, not dave's.
    await removeAccount(db, u.id, 'dave');
    expect(await membership(db, u.id, theirs.id)).toBe('link');
    expect((await libraryReviews(db, u.id, KEY))[0]).toMatchObject({ arrivedFrom: 'dave' });
  });

  it('a game played by two linked accounts appears once', async () => {
    const u = await makeUser(db);
    await addAccount(db, u.id, 'gus', { ensurePlayer: fakeEnsure });
    await addAccount(db, u.id, 'hal', { ensurePlayer: fakeEnsure });
    const g = await makeGame(db, { id: '500', whiteUsername: 'gus', blackUsername: 'hal' });
    await materialiseAccount(db, u.id, 'gus');
    await materialiseAccount(db, u.id, 'hal');
    const rows = await db.select().from(schema.userGames).where(eq(schema.userGames.gameId, g.id));
    expect(rows).toHaveLength(1);
  });
});

describe('sideOf and userSideFor', () => {
  const linked = new Set(['kafka_f0', 'alt_acc']);

  it('White, Black, or neither', () => {
    expect(sideOf(linked, 'kafka_f0', 'someone')).toBe('w');
    expect(sideOf(linked, 'someone', 'kafka_f0')).toBe('b');
    expect(sideOf(linked, 'someone', 'else')).toBeNull();
  });

  it('compares exactly, as libraryReviews does', () => {
    expect(sideOf(linked, 'KAFKA_F0', 'someone')).toBeNull();
  });

  it('both linked: the page the member came from wins, else White', () => {
    expect(sideOf(linked, 'kafka_f0', 'alt_acc')).toBe('w');
    expect(sideOf(linked, 'kafka_f0', 'alt_acc', 'alt_acc')).toBe('b');
    expect(sideOf(linked, 'kafka_f0', 'alt_acc', 'kafka_f0')).toBe('w');
    expect(sideOf(linked, 'kafka_f0', 'alt_acc', 'nobody')).toBe('w');
  });

  it('a preference never picks a side the member did not play', () => {
    expect(sideOf(linked, 'someone', 'kafka_f0', 'someone')).toBe('b');
  });

  it('userSideFor reads the linked accounts', async () => {
    const u = await makeUser(db);
    await addAccount(db, u.id, 'kim', { ensurePlayer: fakeEnsure });
    expect(await userSideFor(db, u.id, { whiteUsername: 'lou', blackUsername: 'kim' })).toBe('b');
    expect(await userSideFor(db, u.id, { whiteUsername: 'lou', blackUsername: 'max' })).toBeNull();
  });
});
