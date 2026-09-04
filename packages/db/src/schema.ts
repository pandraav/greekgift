import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
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

    /** Drives how much the coach explains. */
    audience: text('audience', {
      enum: ['beginner', 'intermediate', 'advanced'],
    })
      .notNull()
      .default('intermediate'),

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
