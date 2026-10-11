import 'server-only';

import { schema } from '@greekgift/db';
import { createMailer } from '@greekgift/email';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { after } from 'next/server';

import { creator } from '@/lib/creator';

import { env, isAdminEmail } from '@/env';
import { db } from '@/lib/db';

const mailer = createMailer({
  apiKey: env.BREVO_API_KEY,
  // Mail arrives from a person, not from a product.
  from: { email: env.EMAIL_FROM, name: creator.sendingAs },
  appUrl: env.NEXT_PUBLIC_APP_URL,
  creator: { name: creator.name, signOff: creator.signOff },
});

/** Announced once at boot so it is obvious which transport is live. */
console.log(`[email] transport: ${mailer.transport}`);

export const auth = betterAuth({
  appName: 'greekgift',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    // Not the default. Sign-up needs an interactive transaction.
    transaction: true,
  }),

  emailAndPassword: {
    enabled: true,
    /** Unverified users cannot sign in at all. */
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    // Returned, not awaited: backgroundTasks below runs it after the response.
    sendResetPassword: ({ user, url }) =>
      mailer.sendReset(user.email, user.name, url),
  },

  emailVerification: {
    sendOnSignUp: true,
    /** Resends if an unverified user tries to sign in. */
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: ({ user, url }) =>
      mailer.sendVerify(user.email, user.name, url),
  },

  /**
   * Authorization state lives on the user row so that Better Auth's cookie
   * cache carries it — that is what lets proxy.ts gate a request without
   * touching the database. Everything else about a person is in
   * `user_profiles`.
   */
  user: {
    additionalFields: {
      role: {
        type: ['admin', 'member'],
        required: true,
        input: false,
        defaultValue: 'member',
      },
      status: {
        type: ['pending', 'approved', 'rejected'],
        required: true,
        input: false,
        defaultValue: 'pending',
      },
      approvedBy: { type: 'string', required: false, input: false },
      approvedAt: { type: 'date', required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    /**
     * 60s is the window in which a just-approved user still sees /pending
     * and, more importantly, a just-rejected user could still hold a cached
     * `approved`. Rejection therefore also deletes their sessions, and the
     * server-side guard re-checks on every page regardless.
     */
    cookieCache: { enabled: true, maxAge: 60 },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Runs inside the sign-up transaction, after defaults are applied.
         * Admins listed in ADMIN_EMAILS skip the queue entirely.
         */
        before: async (created) => {
          const admin = isAdminEmail(created.email);
          return {
            data: {
              ...created,
              role: admin ? 'admin' : 'member',
              status: admin ? 'approved' : 'pending',
            },
          };
        },

        /**
         * Runs after the transaction commits (1.7 queues create.after), so
         * the foreign key to user.id resolves even on a pooled connection.
         */
        after: async (created, ctx) => {
          const body = (ctx?.body ?? {}) as Record<string, unknown>;
          const trimmed = (v: unknown, max: number) =>
            typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

          await db
            .insert(schema.userProfiles)
            .values({
              userId: created.id,
              occupation: trimmed(body.occupation, 200),
              note: trimmed(body.note, 2000),
            })
            .onConflictDoNothing();
        },
      },
    },

    session: {
      create: {
        /**
         * Backstop for an address added to ADMIN_EMAILS after they signed
         * up. Primary promotion happens at sign-up above; this one lags by
         * up to the cookie-cache window on the first request.
         */
        before: async (created, ctx) => {
          if (!ctx) return { data: created };
          const found = await ctx.context.internalAdapter.findUserById(
            created.userId,
          );
          const u = found as
            | (typeof found & { role?: string; status?: string })
            | null;
          if (
            u &&
            isAdminEmail(u.email) &&
            (u.role !== 'admin' || u.status !== 'approved')
          ) {
            await ctx.context.internalAdapter.updateUser(u.id, {
              role: 'admin',
              status: 'approved',
            });
          }
          return { data: created };
        },
      },
    },
  },

  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    /**
     * Mail sends run after the response: awaiting one inside the request is a
     * timing-attack vector. A bare `void` is not enough on Vercel, where the
     * instance can freeze at the response and drop the send; that is how
     * reset mail went missing. `after` keeps the function alive until it is
     * done. The mailer never rejects.
     */
    backgroundTasks: { handler: (task) => after(task) },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export { mailer };
