'use client';

import { useCallback, useState } from 'react';

import { NotificationsModal } from './notifications-modal';

/** The topbar bell with its brass count (prototype `.bell` + `.pill`). */
export function Bell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [open, setOpen] = useState(false);
  // Stable identities: a fresh closure per render would otherwise change the
  // modal's effect dependencies on every approve or decline, refetching the
  // notification list a second time for nothing.
  const close = useCallback(() => setOpen(false), []);
  const changeCount = useCallback((n: number) => setCount(Math.max(0, n)), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Notifications, ${count} new` : 'Notifications'}
        className="relative grid size-[38px] place-items-center rounded-full border border-brass-hi/35 bg-white/7 text-paper hover:bg-white/13"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9.5a6 6 0 0 1 12 0c0 5 1.5 6.5 2.5 7.5H3.5C4.5 16 6 14.5 6 9.5z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 ? (
          <span className="absolute -top-[5px] -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brass px-1.5 font-mono text-[11px] font-bold text-wood-900 shadow-[0_0_0_2px_var(--wood-800)]">
            {count}
          </span>
        ) : null}
      </button>
      <NotificationsModal open={open} onClose={close} onCountChange={changeCount} />
    </>
  );
}
