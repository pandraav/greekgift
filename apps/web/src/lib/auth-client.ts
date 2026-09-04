'use client';

import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import type { auth } from '@/lib/auth';

/** inferAdditionalFields makes session.user.role and .status typed on the client. */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
