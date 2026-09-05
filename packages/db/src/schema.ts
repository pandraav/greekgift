import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ── Better Auth core tables ──────────────────────────────────────────────
   Shapes match Better Auth 1.7.2's Drizzle adapter. Verify with
   `pnpm auth:generate` after any better-auth bump rather than editing by
   hand — 1.7 added `account.issuer` and the (issuer, accountId) unique
   index, and missing it breaks sign-up at linkAccount.

   Fields declared as `user.additionalFields` in auth.ts must appear on this
   table too, or the adapter writes to columns that do not exist.
   ------------------------------------------------------------------------ */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),

  /* ── authorization state, declared as user.additionalFields ─────────────
     These live on the user row rather than in user_profiles on purpose.
     Better Auth's cookie cache serialises the user record and nothing else
     (setCookieCache → parseUserOutput → core fields + additionalFields), so
     this is the only placement that lets proxy.ts read role and status with
     no database round-trip. The spec put them in user_profiles; that would
     cost a SELECT on every request and drag a database driver into the
     proxy bundle, which the Next docs specifically warn against.
     --------------------------------------------------------------------- */
  role: text('role', { enum: ['admin', 'member'] })
    .notNull()
    .default('member'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    /** New in Better Auth 1.7. Omitting it breaks sign-up. */
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('account_issuer_accountId_uidx').on(t.issuer, t.accountId),
    index('account_user_id_idx').on(t.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/* ── greekgift's own profile table ────────────────────────────────────────
   Everything that is *not* authorization state. Deliberately kept off the
   user row so the session cookie stays small — the sign-up note is free
   text, and the cookie gets chunked past about 4KB.

   Never read by proxy.ts.
   ------------------------------------------------------------------------ */

export const userProfiles = pgTable(
  'user_profiles',
  {
    /** 1:1 with user, so the user id is the primary key. */
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** Both asked at sign-up. */
    occupation: text('occupation'),
    note: text('note'),

    /**
     * Set later in /settings, never at sign-up: reviews are keyed by
     * chess.com username rather than by account, so this is only a
     * "my games" shortcut.
     */
    chesscomUsername: text('chesscom_username'),

    /**
     * Drives how much the coach explains. Independent of the persona on
     * purpose: the voice is the reader's to choose, the depth follows their
     * rating.
     */
    audience: text('audience', {
      enum: ['beginner', 'intermediate', 'advanced'],
    })
      .notNull()
      .default('intermediate'),

    /**
     * Which coach writes. Not an enum in the database: personas are compiled
     * from a spec that will gain and lose entries, and a migration per edit
     * would be absurd. An unknown id falls back to the default in code.
     */
    personaId: text('persona_id').notNull().default('sagar'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('user_profiles_chesscom_idx').on(t.chesscomUsername)],
);

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [user.id],
    references: [userProfiles.userId],
  }),
  sessions: many(session),
  accounts: many(account),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(user, { fields: [userProfiles.userId], references: [user.id] }),
}));

export type User = typeof user.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

export type Role = 'admin' | 'member';
export type Status = 'pending' | 'approved' | 'rejected';
export type Audience = 'beginner' | 'intermediate' | 'advanced';

/* ── chess.com mirror ─────────────────────────────────────────────────────
   Reviews are keyed by chess.com username rather than by account, so these
   tables are shared: two members looking at the same game see the same rows
   and the engine runs once. Nothing here is per-user.
   ------------------------------------------------------------------------ */

export const players = pgTable('players', {
  /** Lowercased. chess.com usernames are case-insensitive. */
  username: text('username').primaryKey(),
  /** As chess.com spells it, for display. */
  displayName: text('display_name').notNull(),

  title: text('title'),
  realName: text('real_name'),
  countryCode: text('country_code'),
  avatarUrl: text('avatar_url'),
  joinedAt: timestamp('joined_at'),
  lastOnlineAt: timestamp('last_online_at'),

  ratingRapid: integer('rating_rapid'),
  ratingBlitz: integer('rating_blitz'),
  ratingBullet: integer('rating_bullet'),

  /** When the profile and stats were last pulled. */
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
  /** Newest archive month imported, as `YYYY-MM`. */
  importedThrough: text('imported_through'),
  /** Total archives chess.com lists, so the UI can say how much is left. */
  archiveCount: integer('archive_count'),
});

export const timeClass = ['bullet', 'blitz', 'rapid', 'daily'] as const;

export const games = pgTable(
  'games',
  {
    /** chess.com's numeric live-game id, from the PGN Link header. */
    id: text('id').primaryKey(),
    uuid: text('uuid').notNull().unique(),
    url: text('url').notNull(),
    /** Kept whole. Every position we analyse is derived from this. */
    pgn: text('pgn').notNull(),

    timeClass: text('time_class', { enum: timeClass }).notNull(),
    timeControl: text('time_control').notNull(),
    rated: boolean('rated').notNull().default(true),
    endTime: timestamp('end_time').notNull(),

    /** Lowercased for lookup; the display spelling sits beside it. */
    whiteUsername: text('white_username').notNull(),
    whiteName: text('white_name').notNull(),
    whiteRating: integer('white_rating'),
    whiteResult: text('white_result').notNull(),

    blackUsername: text('black_username').notNull(),
    blackName: text('black_name').notNull(),
    blackRating: integer('black_rating'),
    blackResult: text('black_result').notNull(),

    /** PGN Result: `1-0`, `0-1` or `1/2-1/2`. */
    result: text('result').notNull(),
    /** From the PGN Termination header, e.g. "erik won on time". */
    termination: text('termination'),

    eco: text('eco'),
    ecoUrl: text('eco_url'),
    /** Readable opening name, derived from the ECO URL slug. */
    opening: text('opening'),

    plies: integer('plies').notNull(),
    finalFen: text('final_fen'),

    /**
     * chess.com's own accuracy, present on roughly a third of games. Not used
     * for anything we show — kept so our numbers can be checked against
     * theirs when the scoring lands.
     */
    ccAccuracyWhite: real('cc_accuracy_white'),
    ccAccuracyBlack: real('cc_accuracy_black'),

    importedAt: timestamp('imported_at').notNull().defaultNow(),
  },
  (t) => [
    // A player's games are found by either colour, so both are indexed and
    // Postgres bitmap-ORs them.
    index('games_white_idx').on(t.whiteUsername, t.endTime),
    index('games_black_idx').on(t.blackUsername, t.endTime),
    index('games_end_time_idx').on(t.endTime),
  ],
);

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type TimeClass = (typeof timeClass)[number];

/* ── analysis cache ───────────────────────────────────────────────────────
   Both tables are keyed by what the numbers actually depend on: the position
   (or game), the node budget, and the engine build. Change either setting and
   you get a different row rather than a silently stale one.
   ------------------------------------------------------------------------ */

export const positionEvals = pgTable(
  'position_evals',
  {
    fen: text('fen').notNull(),
    nodes: integer('nodes').notNull(),
    engineBuild: text('engine_build').notNull(),
    /** EngineLine[], multipv 1..3, best first. */
    lines: jsonb('lines').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fen, t.nodes, t.engineBuild] })],
);

export const reviews = pgTable(
  'reviews',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    nodes: integer('nodes').notNull(),
    engineBuild: text('engine_build').notNull(),
    /** The whole Review object from packages/engine. */
    data: jsonb('data').notNull(),
    /** Denormalised so the game list can show them without parsing the blob. */
    whiteAccuracy: real('white_accuracy').notNull(),
    blackAccuracy: real('black_accuracy').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.nodes, t.engineBuild] }),
    index('reviews_game_idx').on(t.gameId),
  ],
);

export const coachTexts = pgTable(
  'coach_texts',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    ply: integer('ply').notNull(),
    personaId: text('persona_id').notNull(),
    /** The CoachText object. */
    data: jsonb('data').notNull(),
    model: text('model'),
    source: text('source', { enum: ['llm', 'template'] }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.ply, t.personaId] })],
);

export type PositionEvalRow = typeof positionEvals.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type CoachTextRow = typeof coachTexts.$inferSelect;
