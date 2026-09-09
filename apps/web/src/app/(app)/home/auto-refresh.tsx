'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export interface RefreshFailedDetail {
  username: string;
  message: string;
}

/**
 * After first paint, refreshes every stale account one at a time and never
 * blocks the page (spec §7.1). The server decides staleness (`ifStale=1`),
 * so a fresh account costs one small request and no chess.com call. A 429 (or
 * any other non-ok response) leaves the account's `lastRefreshedAt` stamp
 * alone and is reported to the matching card via `greekgift:refresh-failed`,
 * rather than swallowed — the loop moves on to the next account regardless.
 *
 * There is no "already ran" ref: React's StrictMode double-mount would then
 * cancel the first sweep partway and refuse to start the second, so the
 * trailing dispatch never fired in development. The remounted effect simply
 * starts the sweep again — `ifStale=1` makes a repeat one cheap request per
 * account and no chess.com call.
 */
export function AutoRefresh({ usernames }: { usernames: string[] }) {
  const router = useRouter();

  // A new array each render would restart the sweep on every render, so the
  // effect depends on the names themselves and rebuilds the list inside.
  const key = usernames.join(',');

  useEffect(() => {
    const stale = key ? key.split(',') : [];
    if (stale.length === 0) return;
    let cancelled = false;
    (async () => {
      let changed = false;
      for (const username of stale) {
        if (cancelled) return;
        const res = await fetch(`/api/me/accounts/${username}/refresh?ifStale=1`, { method: 'POST' }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as
          | { refreshed?: boolean; error?: string; status?: number; message?: string }
          | null;
        if (!res?.ok) {
          window.dispatchEvent(
            new CustomEvent<RefreshFailedDetail>('greekgift:refresh-failed', {
              detail: { username, message: body?.message ?? 'chess.com did not answer.' },
            }),
          );
          continue;
        }
        if (body?.refreshed) changed = true;
      }
      if (changed && !cancelled) {
        window.dispatchEvent(new Event('greekgift:week-changed'));
        router.refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, key]);

  return null;
}
