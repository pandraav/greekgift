import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';

import { schema, type Db, type Game, type GameShare, type ShareRequest } from '@greekgift/db';
import { and, count, desc, eq, isNull, or } from 'drizzle-orm';

import { addToLibrary, membership, type Viewer } from '@/lib/library';

/**
 * Sharing: a link per game and owner, a request per person, a decision.
 *
 * The token is the whole secret — anyone holding it can ask, nobody holding
 * it can see. A decision is a single conditional UPDATE, so two approvals
 * racing produce one library row and one email, never two.
 */

export function newShareToken(): string {
  return randomBytes(16).toString('base64url');
}

export interface ShareView {
  share: GameShare;
  game: Game;
  owner: { id: string; name: string; email: string };
}

export async function getOrCreateShare(db: Db, gameId: string, ownerUserId: string): Promise<GameShare> {
  const find = () =>
    db
      .select()
      .from(schema.gameShares)
      .where(and(eq(schema.gameShares.gameId, gameId), eq(schema.gameShares.ownerUserId, ownerUserId)))
      .limit(1);
  const [existing] = await find();
  if (existing) return existing;
  await db
    .insert(schema.gameShares)
    .values({ token: newShareToken(), gameId, ownerUserId })
    .onConflictDoNothing();
  const [created] = await find();
  return created!;
}

export async function shareByToken(db: Db, token: string): Promise<ShareView | null> {
  const [row] = await db
    .select({ share: schema.gameShares, game: schema.games, owner: { id: schema.user.id, name: schema.user.name, email: schema.user.email } })
    .from(schema.gameShares)
    .innerJoin(schema.games, eq(schema.games.id, schema.gameShares.gameId))
    .innerJoin(schema.user, eq(schema.user.id, schema.gameShares.ownerUserId))
    .where(eq(schema.gameShares.token, token))
    .limit(1);
  return row ?? null;
}

export async function hasPendingRequest(db: Db, token: string, requesterUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.shareRequests.id })
    .from(schema.shareRequests)
    .where(
      and(
        eq(schema.shareRequests.shareToken, token),
        eq(schema.shareRequests.requesterUserId, requesterUserId),
        eq(schema.shareRequests.status, 'pending'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type RequestStatus = 'already_visible' | 'pending' | 'created';

export async function requestAccess(
  db: Db,
  token: string,
  requesterUserId: string,
): Promise<{ status: RequestStatus; share: ShareView } | null> {
  const share = await shareByToken(db, token);
  if (!share) return null;
  if (share.owner.id === requesterUserId || (await membership(db, requesterUserId, share.game.id))) {
    return { status: 'already_visible', share };
  }
  if (await hasPendingRequest(db, token, requesterUserId)) return { status: 'pending', share };
  try {
    await db.insert(schema.shareRequests).values({ id: randomUUID(), shareToken: token, requesterUserId });
  } catch (error) {
    // The partial unique index caught a race: someone asked twice at once.
    // Postgres says so in the SQLSTATE and nowhere else worth reading — a
    // message match would also swallow whatever unrelated constraint a later
    // migration adds to this table.
    const err = error as { cause?: { code?: string }; code?: string };
    if ((err.code ?? err.cause?.code) === '23505') return { status: 'pending', share };
    throw error;
  }
  return { status: 'created', share };
}

export interface Decided {
  request: ShareRequest;
  share: ShareView;
  requester: { id: string; name: string; email: string };
}

/** One conditional UPDATE. Null means there was nothing pending to decide, or the decider may not. */
export async function decideRequest(
  db: Db,
  id: string,
  decider: Viewer,
  decision: 'approved' | 'declined',
): Promise<Decided | null> {
  const [found] = await db
    .select({ request: schema.shareRequests, ownerUserId: schema.gameShares.ownerUserId })
    .from(schema.shareRequests)
    .innerJoin(schema.gameShares, eq(schema.gameShares.token, schema.shareRequests.shareToken))
    .where(eq(schema.shareRequests.id, id))
    .limit(1);
  if (!found) return null;
  if (decider.role !== 'admin' && found.ownerUserId !== decider.id) return null;

  const [request] = await db
    .update(schema.shareRequests)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(schema.shareRequests.id, id), eq(schema.shareRequests.status, 'pending')))
    .returning();
  if (!request) return null;

  const share = (await shareByToken(db, request.shareToken))!;
  if (decision === 'approved') {
    await addToLibrary(db, request.requesterUserId, share.game.id, { source: 'share', sharedBy: share.owner.id });
  }
  const [requester] = await db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, request.requesterUserId))
    .limit(1);
  return { request, share, requester: requester! };
}

export interface PendingRow {
  id: string;
  requesterName: string;
  gameId: string;
  game: Game;
  createdAt: Date;
}
export interface SharedRow {
  gameId: string;
  game: Game;
  sharedByName: string;
  addedAt: Date;
}
export interface EarlierRow {
  id: string;
  requesterName: string;
  gameId: string;
  game: Game;
  status: 'approved' | 'declined';
  decidedAt: Date | null;
}
export interface Notifications {
  pending: PendingRow[];
  shared: SharedRow[];
  earlier: EarlierRow[];
}

function requestsOnMyShares(db: Db) {
  return db
    .select({
      id: schema.shareRequests.id,
      status: schema.shareRequests.status,
      createdAt: schema.shareRequests.createdAt,
      decidedAt: schema.shareRequests.decidedAt,
      requesterName: schema.user.name,
      game: schema.games,
    })
    .from(schema.shareRequests)
    .innerJoin(schema.gameShares, eq(schema.gameShares.token, schema.shareRequests.shareToken))
    .innerJoin(schema.games, eq(schema.games.id, schema.gameShares.gameId))
    .innerJoin(schema.user, eq(schema.user.id, schema.shareRequests.requesterUserId));
}

export async function notifications(db: Db, userId: string): Promise<Notifications> {
  const pending = await requestsOnMyShares(db)
    .where(and(eq(schema.gameShares.ownerUserId, userId), eq(schema.shareRequests.status, 'pending')))
    .orderBy(desc(schema.shareRequests.createdAt));

  const earlier = await requestsOnMyShares(db)
    .where(and(eq(schema.gameShares.ownerUserId, userId), or(eq(schema.shareRequests.status, 'approved'), eq(schema.shareRequests.status, 'declined'))))
    .orderBy(desc(schema.shareRequests.decidedAt))
    .limit(10);

  const shared = await db
    .select({ game: schema.games, sharedByName: schema.user.name, addedAt: schema.userGames.addedAt })
    .from(schema.userGames)
    .innerJoin(schema.games, eq(schema.games.id, schema.userGames.gameId))
    .leftJoin(schema.user, eq(schema.user.id, schema.userGames.sharedBy))
    .where(and(eq(schema.userGames.userId, userId), eq(schema.userGames.source, 'share'), isNull(schema.userGames.openedAt)))
    .orderBy(desc(schema.userGames.addedAt));

  return {
    pending: pending.map((r) => ({ id: r.id, requesterName: r.requesterName, gameId: r.game.id, game: r.game, createdAt: r.createdAt })),
    shared: shared.map((r) => ({ gameId: r.game.id, game: r.game, sharedByName: r.sharedByName ?? 'A member', addedAt: r.addedAt })),
    earlier: earlier.map((r) => ({
      id: r.id,
      requesterName: r.requesterName,
      gameId: r.game.id,
      game: r.game,
      status: r.status as 'approved' | 'declined',
      decidedAt: r.decidedAt,
    })),
  };
}

/**
 * Pending requests on my shares + shares to me not yet opened (spec §7.6).
 *
 * The layout asks this on every render, so it is counts alone: no join to
 * `games` (whose rows carry a whole PGN each) and no row bodies at all.
 */
export async function notificationCount(db: Db, userId: string): Promise<number> {
  const [pending] = await db
    .select({ n: count() })
    .from(schema.shareRequests)
    .innerJoin(schema.gameShares, eq(schema.gameShares.token, schema.shareRequests.shareToken))
    .where(and(eq(schema.gameShares.ownerUserId, userId), eq(schema.shareRequests.status, 'pending')));

  const [shared] = await db
    .select({ n: count() })
    .from(schema.userGames)
    .where(
      and(
        eq(schema.userGames.userId, userId),
        eq(schema.userGames.source, 'share'),
        isNull(schema.userGames.openedAt),
      ),
    );

  return (pending?.n ?? 0) + (shared?.n ?? 0);
}
