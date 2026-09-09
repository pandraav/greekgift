'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, Button, Chip, Eyebrow } from '@/components/ui';

interface Rows {
  pending: { id: string; requesterName: string; initials: string; title: string; sub: string; gameId: string }[];
  shared: { gameId: string; sharedByName: string; initials: string; title: string; sub: string }[];
  earlier: { id: string; requesterName: string; initials: string; title: string; sub: string; status: 'approved' | 'declined' }[];
}

/** Everything Tab should be able to reach inside the dialog panel. */
const FOCUSABLE = 'button, a[href], input, select, [tabindex]:not([tabindex="-1"])';

/** Prototype `#notes`: fetched on open; Approve and Decline act in place. */
export function NotificationsModal({
  open,
  onClose,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  onCountChange: (n: number) => void;
}) {
  const [rows, setRows] = useState<Rows | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // What had focus before the dialog opened — restored when it closes.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // The count callback is read through a ref so the fetch below depends on
  // `open` alone. Opening the list is the only thing that should fetch it;
  // a new prop identity must never be a reason to ask the server again.
  const countRef = useRef(onCountChange);
  useEffect(() => {
    countRef.current = onCountChange;
  });

  // Reset to "Looking…" the moment the modal opens, following the render-time
  // adjustment pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than an unconditional setState inside the effect below.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setRows(null);
  }

  // Move focus into the dialog on open; put it back where it was on close.
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => returnFocusTo.current?.focus();
  }, [open]);

  /** The server's view of the list. Also the recovery path when a decision races. */
  const fetchRows = useCallback(
    () => fetch('/api/me/notifications').then((r) => r.json() as Promise<Rows>),
    [],
  );
  const apply = useCallback((body: Rows) => {
    setRows(body);
  }, []);

  // The badge is derived from the list, in an effect: calling the parent's
  // setter from inside a `setRows` updater would be an update during render.
  useEffect(() => {
    if (rows) countRef.current(rows.pending.length + rows.shared.length);
  }, [rows]);

  // Bumped each time the modal opens; a fetch that resolves after a later
  // open (or a rapid close/reopen) is ignored instead of overwriting fresher
  // state.
  const fetchGen = useRef(0);

  // Fetching and key handling are separate effects: the fetch turns on `open`
  // alone, so re-rendering with a new `onClose` cannot make it run twice.
  useEffect(() => {
    if (!open) return;
    fetchGen.current += 1;
    const gen = fetchGen.current;
    fetchRows()
      .then((body) => {
        if (fetchGen.current !== gen) return;
        apply(body);
      })
      .catch(() => {
        if (fetchGen.current !== gen) return;
        setRows({ pending: [], shared: [], earlier: [] });
      });
  }, [open, fetchRows, apply]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      // Wrap Tab at the ends, and pull focus back in if it somehow left.
      if (e.shiftKey ? active === first || !dialog.contains(active) : active === last || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function decide(id: string, decision: 'approve' | 'decline') {
    const res = await fetch(`/api/shares/requests/${id}/${decision}`, { method: 'POST' });
    // 404 is `not_pending`: it was already decided elsewhere, or in another
    // tab, and the real outcome is not necessarily the one just clicked.
    // Ask the server rather than showing this click as the answer.
    if (res.status === 404) {
      await fetchRows()
        .then(apply)
        .catch(() => {});
      return;
    }
    if (!res.ok) return;
    setRows((r) => {
      if (!r) return r;
      const row = r.pending.find((p) => p.id === id);
      const pending = r.pending.filter((p) => p.id !== id);
      // Server shape: pending sub is "{subtitle} · {gameDate} · asked {relative}";
      // earlier sub is "{subtitle} · {status} {when}". Drop the last two
      // segments (the date and the "asked …" segment) to recover the subtitle.
      const earlier = row
        ? [
            {
              ...row,
              status: decision === 'approve' ? ('approved' as const) : ('declined' as const),
              sub: `${row.sub.split(' · ').slice(0, -2).join(' · ')} · ${decision === 'approve' ? 'approved' : 'declined'} just now`,
            },
            ...r.earlier,
          ].slice(0, 10)
        : r.earlier;
      return { ...r, pending, earlier };
    });
  }

  if (!open) return null;
  const empty = rows && rows.pending.length === 0 && rows.shared.length === 0 && rows.earlier.length === 0;

  return (
    <div
      className="fixed inset-0 z-80 grid place-items-center bg-[rgb(12_8_4/.72)] p-4 sm:p-[34px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
    >
      <div
        ref={dialogRef}
        className="max-h-full w-[min(600px,100%)] overflow-auto rounded-[5px] border border-black/40 bg-paper text-ink shadow-lift"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-[22px] pt-5 pb-4">
          <div>
            <h2 className="text-[22px] font-semibold">Notifications</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">Requests on games you shared, and games shared with you.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        {!rows ? (
          <p className="px-[22px] py-6 text-[14px] text-ink-3">Looking…</p>
        ) : empty ? (
          <p className="px-[22px] py-6 text-[14px] text-ink-2">Nothing waiting.</p>
        ) : (
          <>
            {rows.pending.length > 0 ? (
              <>
                <Section title="Asking to see your games" chip={<Chip tone="brass">{rows.pending.length} waiting</Chip>} />
                {rows.pending.map((r) => (
                  <Row key={r.id} initials={r.initials} text={<><b className="font-semibold">{r.requesterName}</b> asked to see <b className="font-semibold">{r.title}</b></>} sub={r.sub}>
                    <Button variant="felt" size="sm" onClick={() => decide(r.id, 'approve')}>Approve</Button>
                    <Button variant="danger" size="sm" onClick={() => decide(r.id, 'decline')}>Decline</Button>
                  </Row>
                ))}
              </>
            ) : null}
            {rows.shared.length > 0 ? (
              <>
                <Section title="Shared with you" chip={<Chip tone="quiet">{rows.shared.length} new</Chip>} />
                {rows.shared.map((r) => (
                  <Row key={r.gameId} initials={r.initials} text={<><b className="font-semibold">{r.sharedByName}</b> shared <b className="font-semibold">{r.title}</b> with you</>} sub={r.sub}>
                    <Link href={`/g/${r.gameId}`} onClick={onClose} className="inline-flex items-center rounded-[3px] border border-black bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper no-underline hover:bg-black">
                      Open
                    </Link>
                  </Row>
                ))}
              </>
            ) : null}
            {rows.earlier.length > 0 ? (
              <>
                <Section title="Earlier" />
                {rows.earlier.map((r) => (
                  <Row key={r.id} initials={r.initials} dim text={<><b className="font-semibold">{r.requesterName}</b> asked to see <b className="font-semibold">{r.title}</b></>} sub={r.sub}>
                    <Chip tone="quiet">{r.status === 'approved' ? 'Approved' : 'Declined'}</Chip>
                  </Row>
                ))}
              </>
            ) : null}
          </>
        )}

        <div className="flex items-center gap-3 rounded-b-[5px] border-t border-rule bg-paper-2 px-[22px] py-3.5">
          <p className="m-0 flex-1 text-[12.5px] text-ink-3">You also get an email for each of these.</p>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, chip }: { title: string; chip?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-rule-2 px-[22px] pt-3 pb-1">
      <Eyebrow className="m-0">{title}</Eyebrow>
      {chip}
    </div>
  );
}

function Row({ initials, text, sub, dim, children }: { initials: string; text: React.ReactNode; sub: string; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 border-b border-rule-2 px-5 py-3.5 max-[860px]:flex-wrap last:border-b-0 ${dim ? 'opacity-70' : ''}`}>
      <Avatar size="md">{initials}</Avatar>
      <span className="min-w-0 flex-1 text-[14.5px] max-[600px]:basis-[calc(100%-52px)]">
        {text}
        <span className="block text-[12.5px] text-ink-3">{sub}</span>
      </span>
      <span className="flex gap-2 max-[600px]:ml-[52px]">{children}</span>
    </div>
  );
}
