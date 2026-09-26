import { randomUUID } from 'node:crypto';

import { schema, type Db } from '@greekgift/db';
import { beforeAll, describe, expect, it } from 'vitest';

import { makeGame, makeUser, testDb } from '../../test/db';
import { addToLibrary, membership } from './library';
import {
  decideRequest,
  getOrCreateShare,
  hasPendingRequest,
  newShareToken,
  notificationCount,
  notifications,
  requestAccess,
  shareByToken,
} from './shares';

let db: Db;
beforeAll(async () => {
  db = await testDb();
});

describe('tokens and links', () => {
  it('is 16 random bytes, base64url', () => {
    const t = newShareToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newShareToken()).not.toBe(t);
  });

  it('one share per game and owner, reused', async () => {
    const owner = await makeUser(db);
    const g = await makeGame(db, { id: '1000' });
    const a = await getOrCreateShare(db, g.id, owner.id);
    const b = await getOrCreateShare(db, g.id, owner.id);
    expect(b.token).toBe(a.token);
    const view = await shareByToken(db, a.token);
    expect(view?.game.id).toBe(g.id);
    expect(view?.owner.id).toBe(owner.id);
    expect(await shareByToken(db, 'nope')).toBeNull();
  });
});

describe('requests', () => {
  it('created → pending on repeat → approve adds a share row → double approve is not_pending', async () => {
    const owner = await makeUser(db, { name: 'Ravi Pandey' });
    const asker = await makeUser(db, { name: 'Priya Nair' });
    const g = await makeGame(db, { id: '1001' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);

    expect((await requestAccess(db, token, asker.id))?.status).toBe('created');
    expect(await hasPendingRequest(db, token, asker.id)).toBe(true);
    expect((await requestAccess(db, token, asker.id))?.status).toBe('pending');
    expect(await notificationCount(db, owner.id)).toBe(1);

    const [pending] = (await notifications(db, owner.id)).pending;
    expect(pending).toMatchObject({ requesterName: 'Priya Nair', gameId: g.id });

    const decided = await decideRequest(db, pending!.id, { id: owner.id, role: 'member' }, 'approved');
    expect(decided?.request.status).toBe('approved');
    expect(decided?.requester.id).toBe(asker.id);
    expect(await membership(db, asker.id, g.id)).toBe('share');
    expect(await decideRequest(db, pending!.id, { id: owner.id, role: 'member' }, 'approved')).toBeNull();
    expect(await notificationCount(db, owner.id)).toBe(0);

    // The recipient sees it under "Shared with you" until opened.
    expect(await notificationCount(db, asker.id)).toBe(1);
    const mine = await notifications(db, asker.id);
    expect(mine.shared[0]).toMatchObject({ gameId: g.id, sharedByName: 'Ravi Pandey' });
    expect((await requestAccess(db, token, asker.id))?.status).toBe('already_visible');
  });

  it('owner and members with access are already_visible; strangers cannot decide', async () => {
    const owner = await makeUser(db);
    const stranger = await makeUser(db);
    const g = await makeGame(db, { id: '1002' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);
    expect((await requestAccess(db, token, owner.id))?.status).toBe('already_visible');
    const asker = await makeUser(db);
    await addToLibrary(db, asker.id, g.id, { source: 'link' });
    expect((await requestAccess(db, token, asker.id))?.status).toBe('already_visible');

    const other = await makeUser(db);
    await requestAccess(db, token, other.id);
    const [row] = (await notifications(db, owner.id)).pending;
    expect(await decideRequest(db, row!.id, { id: stranger.id, role: 'member' }, 'declined')).toBeNull();
    const admin = await makeUser(db, { role: 'admin' });
    expect((await decideRequest(db, row!.id, { id: admin.id, role: 'admin' }, 'declined'))?.request.status).toBe('declined');
  });

  it('two requests racing produce one created and one pending, never two rows', async () => {
    const owner = await makeUser(db);
    const asker = await makeUser(db);
    const g = await makeGame(db, { id: '1004' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);

    // Both calls see no pending row before either inserts; the partial unique
    // index decides it, and the loser reads as `pending` rather than throwing.
    const both = await Promise.all([
      requestAccess(db, token, asker.id),
      requestAccess(db, token, asker.id),
    ]);
    expect(both.map((r) => r!.status).sort()).toEqual(['created', 'pending']);
    expect((await notifications(db, owner.id)).pending).toHaveLength(1);
  });

  it('the partial unique index rejects a second pending row for the same asker', async () => {
    const owner = await makeUser(db);
    const asker = await makeUser(db);
    const g = await makeGame(db, { id: '1005' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);

    const insert = () =>
      db.insert(schema.shareRequests).values({ id: randomUUID(), shareToken: token, requesterUserId: asker.id });
    await insert();
    // The index, not the code path, is what makes the race in the test above
    // safe — so assert it directly, on the SQLSTATE `requestAccess` reads.
    await expect(insert()).rejects.toMatchObject({ cause: { code: '23505' } });
    expect((await notifications(db, owner.id)).pending).toHaveLength(1);
  });

  it('a pending row inserted behind requestAccess reads back as pending', async () => {
    const owner = await makeUser(db);
    const asker = await makeUser(db);
    const g = await makeGame(db, { id: '1006' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);

    await db.insert(schema.shareRequests).values({ id: randomUUID(), shareToken: token, requesterUserId: asker.id });
    expect(await hasPendingRequest(db, token, asker.id)).toBe(true);
    expect((await requestAccess(db, token, asker.id))?.status).toBe('pending');
    expect((await notifications(db, owner.id)).pending).toHaveLength(1);
  });

  it('declined then asked again is a new pending row, and earlier lists decisions', async () => {
    const owner = await makeUser(db);
    const asker = await makeUser(db);
    const g = await makeGame(db, { id: '1003' });
    const { token } = await getOrCreateShare(db, g.id, owner.id);
    await requestAccess(db, token, asker.id);
    const [first] = (await notifications(db, owner.id)).pending;
    await decideRequest(db, first!.id, { id: owner.id, role: 'member' }, 'declined');
    expect((await requestAccess(db, token, asker.id))?.status).toBe('created');
    const n = await notifications(db, owner.id);
    expect(n.pending).toHaveLength(1);
    expect(n.earlier[0]).toMatchObject({ status: 'declined', gameId: g.id });
    expect(await requestAccess(db, 'nope', asker.id)).toBeNull();
  });
});
