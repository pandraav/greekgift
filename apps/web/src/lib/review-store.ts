import 'server-only';

import { schema } from '@greekgift/db';
import {
  buildReview,
  parsePgn,
  type PositionEval,
  type Review,
} from '@greekgift/engine';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';

/**
 * Reading and writing the analysis cache.
 *
 * Analysis happens in the reader's browser, so this is where the result stops
 * being one person's work and becomes everyone's: the second viewer of a game
 * waits for a database round-trip, not for Stockfish.
 */

export interface CacheKey {
  nodes: number;
  engineBuild: string;
}

/** The stored review for a game at these settings, or null. */
export async function getReview(
  gameId: string,
  key: CacheKey,
): Promise<Review | null> {
  const [row] = await db
    .select({ data: schema.reviews.data })
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.gameId, gameId),
        eq(schema.reviews.nodes, key.nodes),
        eq(schema.reviews.engineBuild, key.engineBuild),
      ),
    )
    .limit(1);

  return row ? (row.data as Review) : null;
}

/**
 * Evaluations we already hold for these positions, keyed by FEN.
 *
 * Openings repeat: by the tenth game reviewed, the first dozen positions of
 * every one of them are already here, and so is every position of any game a
 * friend has already looked at.
 */
export async function getCachedEvals(
  fens: string[],
  key: CacheKey,
): Promise<Record<string, PositionEval>> {
  const unique = [...new Set(fens)];
  const found: Record<string, PositionEval> = {};

  // Postgres takes a bind parameter per element, so the IN list is chunked
  // rather than handed the whole game at once.
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await db
      .select({
        fen: schema.positionEvals.fen,
        lines: schema.positionEvals.lines,
      })
      .from(schema.positionEvals)
      .where(
        and(
          inArray(schema.positionEvals.fen, unique.slice(i, i + CHUNK)),
          eq(schema.positionEvals.nodes, key.nodes),
          eq(schema.positionEvals.engineBuild, key.engineBuild),
        ),
      );

    for (const row of rows) {
      found[row.fen] = {
        fen: row.fen,
        nodes: key.nodes,
        engineBuild: key.engineBuild,
        lines: row.lines as PositionEval['lines'],
      };
    }
  }

  return found;
}

export class ReviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewInputError';
  }
}

/**
 * Builds the review for a game from submitted evaluations, and stores both.
 *
 * The client sends engine output, never a finished review: the numbers a
 * player sees are computed here, from the PGN we imported ourselves, so a
 * mangled or hand-edited payload cannot put a wrong accuracy on someone's
 * game. Every position is checked to be the one it claims to be.
 */
export async function saveReview(
  game: typeof schema.games.$inferSelect,
  evals: PositionEval[],
  key: CacheKey,
): Promise<Review> {
  const parsed = parsePgn(game.pgn);

  if (evals.length !== parsed.fens.length) {
    throw new ReviewInputError(
      `Expected ${parsed.fens.length} evaluations, got ${evals.length}`,
    );
  }
  for (const [i, fen] of parsed.fens.entries()) {
    if (evals[i]!.fen !== fen) {
      throw new ReviewInputError(`Evaluation ${i} is for a different position`);
    }
  }

  const review = buildReview({
    gameId: game.id,
    game: parsed,
    evals,
    whiteUsername: game.whiteUsername,
    blackUsername: game.blackUsername,
    ...(game.whiteRating !== null ? { whiteRating: game.whiteRating } : {}),
    ...(game.blackRating !== null ? { blackRating: game.blackRating } : {}),
    ...(game.eco && game.opening
      ? { opening: { eco: game.eco, name: game.opening } }
      : {}),
    nodes: key.nodes,
    engineBuild: key.engineBuild,
  });

  // Positions first: if the review write fails, the expensive part survives
  // and the retry is a database round-trip rather than another 30 seconds of
  // Stockfish.
  const rows = [...new Map(evals.map((e) => [e.fen, e])).values()].map((e) => ({
    fen: e.fen,
    nodes: key.nodes,
    engineBuild: key.engineBuild,
    lines: e.lines,
  }));

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(schema.positionEvals)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  await db
    .insert(schema.reviews)
    .values({
      gameId: game.id,
      nodes: key.nodes,
      engineBuild: key.engineBuild,
      data: review,
      whiteAccuracy: review.white.accuracy,
      blackAccuracy: review.black.accuracy,
    })
    .onConflictDoUpdate({
      target: [schema.reviews.gameId, schema.reviews.nodes, schema.reviews.engineBuild],
      set: {
        data: review,
        whiteAccuracy: review.white.accuracy,
        blackAccuracy: review.black.accuracy,
      },
    });

  return review;
}

/**
 * Our own accuracies for a batch of games, keyed by game id.
 *
 * Denormalised onto the review row precisely so a list of sixty games costs
 * one small query rather than sixty JSON blobs.
 */
export async function getAccuracies(
  gameIds: string[],
  key: CacheKey,
): Promise<Record<string, { white: number; black: number }>> {
  if (gameIds.length === 0) return {};

  const rows = await db
    .select({
      gameId: schema.reviews.gameId,
      white: schema.reviews.whiteAccuracy,
      black: schema.reviews.blackAccuracy,
    })
    .from(schema.reviews)
    .where(
      and(
        inArray(schema.reviews.gameId, gameIds),
        eq(schema.reviews.nodes, key.nodes),
        eq(schema.reviews.engineBuild, key.engineBuild),
      ),
    );

  return Object.fromEntries(
    rows.map((r) => [r.gameId, { white: r.white, black: r.black }]),
  );
}
