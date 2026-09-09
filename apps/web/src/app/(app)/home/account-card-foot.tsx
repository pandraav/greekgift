'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { relativeTime } from '@/lib/relative-time';

import { useWeekReader } from '../week-reader';
import type { RefreshFailedDetail } from './auto-refresh';

/**
 * "refreshed 12 min ago", Refresh, Remove with its inline confirmation, and
 * the reader's progress when it is on this account (spec §3.1).
 */
export function AccountCardFoot({
  username,
  lastRefreshedAt,
}: {
  username: string;
  /** ISO string; null before the first refresh. */
  lastRefreshedAt: string | null;
}) {
  const router = useRouter();
  const reader = useWeekReader();
  const [state, setState] = useState<'idle' | 'refreshing' | 'confirm' | 'removing'>('idle');
  const [note, setNote] = useState<string | null>(null);
  const confirmRemoveRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  // Keep unmounts the confirmation, so the focus can only be returned once
  // the original Remove is back on the page — an effect, not the handler.
  const returning = useRef(false);

  useEffect(() => {
    if (state === 'confirm') {
      confirmRemoveRef.current?.focus();
      return;
    }
    if (returning.current) {
      returning.current = false;
      removeRef.current?.focus();
    }
  }, [state]);

  // A 429 (or any other failure) from AutoRefresh's background sweep leaves
  // the account's stamp alone and never touches this component's own
  // `refresh()`/`state`, so it is surfaced the same way the reader's cross-
  // component signals are: a window event, matched by username.
  useEffect(() => {
    const onFailed = (event: Event) => {
      const { detail } = event as CustomEvent<RefreshFailedDetail>;
      if (detail.username === username) setNote(detail.message);
    };
    window.addEventListener('greekgift:refresh-failed', onFailed);
    return () => window.removeEventListener('greekgift:refresh-failed', onFailed);
  }, [username]);

  async function refresh() {
    setState('refreshing');
    setNote(null);
    const res = await fetch(`/api/me/accounts/${username}/refresh`, { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setNote(body.message ?? 'chess.com did not answer.');
    }
    window.dispatchEvent(new Event('greekgift:week-changed'));
    setState('idle');
    router.refresh();
  }

  async function remove() {
    setState('removing');
    await fetch(`/api/me/accounts/${username}`, { method: 'DELETE' });
    window.dispatchEvent(new Event('greekgift:week-changed'));
    router.refresh();
  }

  const progress = reader.byAccount[username];
  const reading = reader.current?.account === username && progress;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-b-[5px] border-t border-rule bg-paper-2 px-5 py-3.5">
      <span className="mr-auto font-mono text-[12px] text-ink-3">
        {state === 'refreshing'
          ? 'Reading chess.com…'
          : reading
            ? `Reading ${progress.done + 1} of ${progress.total}`
            : note
              ? note
              : lastRefreshedAt
                ? `refreshed ${relativeTime(new Date(lastRefreshedAt))}`
                : 'not read yet'}
      </span>
      {reading ? (
        <span className="order-last mt-2 block h-2 w-full overflow-hidden rounded-full bg-paper-3">
          <i
            className="block h-full rounded-full bg-gradient-to-r from-brass-lo to-brass-hi transition-[width] duration-300"
            style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
          />
        </span>
      ) : null}
      {state === 'confirm' ? (
        <span role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
          Remove chess.com/{username}? Its games leave your library; anything you pasted or were sent stays.
          <Button ref={confirmRemoveRef} variant="danger" size="sm" onClick={remove}>Remove</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              returning.current = true;
              setState('idle');
            }}
          >
            Keep
          </Button>
        </span>
      ) : (
        <>
          <Button variant="ghost" size="sm" disabled={state !== 'idle'} onClick={refresh}>Refresh</Button>
          <Button ref={removeRef} variant="danger" size="sm" disabled={state !== 'idle'} onClick={() => setState('confirm')}>
            {state === 'removing' ? 'Removing…' : 'Remove'}
          </Button>
        </>
      )}
    </div>
  );
}
