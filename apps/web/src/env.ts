import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Every variable greekgift reads, in one place. The app imports `env` from
 * here and never touches `process.env` directly.
 *
 * All nine are required — no `.optional()`, no `.default()` — so a missing
 * key fails the build rather than a request at 2am. Local development still
 * works with no real credentials because `.env.example` supplies placeholder
 * values that satisfy the schema: `DATABASE_URL` points at PGlite and the
 * Brevo key is recognised as unset, which selects the console mailer.
 *
 * `SKIP_ENV_VALIDATION` exists only for container builds and CI lint, where
 * secrets are deliberately absent. It is additionally gated on
 * `NODE_ENV !== 'production'`, so it is structurally impossible for `next
 * build` or `next start` to skip validation — no phase-sniffing required.
 */
export const env = createEnv({
  server: {
    /** Neon Postgres in production; `pglite://.pglite` locally. */
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    /** Comma-separated. These addresses become admins on first sign-in. */
    ADMIN_EMAILS: z.string().min(3),
    BREVO_API_KEY: z.string().min(1),
    EMAIL_FROM: z.email(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    /** Node budget per position. Part of the eval cache key. */
    NEXT_PUBLIC_ENGINE_NODES: z.coerce.number().int().positive(),
    /** Engine build id. Also part of the eval cache key. */
    NEXT_PUBLIC_ENGINE_BUILD: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ENGINE_NODES: process.env.NEXT_PUBLIC_ENGINE_NODES,
    NEXT_PUBLIC_ENGINE_BUILD: process.env.NEXT_PUBLIC_ENGINE_BUILD,
  },
  skipValidation:
    process.env.SKIP_ENV_VALIDATION === '1' &&
    process.env.NODE_ENV !== 'production',
  emptyStringAsUndefined: true,
});

/** Admin addresses, normalised once. */
export const adminEmails: readonly string[] = env.ADMIN_EMAILS.split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}
