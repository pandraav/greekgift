'use client';

import { useState } from 'react';

import { Avatar, Button, Chip, Notice } from '@/components/ui';

export interface QueueUser {
  id: string;
  name: string;
  email: string;
  occupation: string | null;
  note: string | null;
  emailVerified: boolean;
  createdAt: string;
}

const asked = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export function Queue({ initial }: { initial: QueueUser[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}/${action}`, {
      method: 'POST',
    });
    setBusy(null);
    if (!res.ok) {
      setError(
        res.status === 404
          ? 'That request was already decided — reload to see the current queue.'
          : 'That did not go through.',
      );
      return;
    }
    setRows((r) => r.filter((u) => u.id !== id));
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[5px] border border-dashed border-rule px-6 py-11 text-center">
        <h3 className="mb-1.5 text-[19px] font-semibold">Nobody waiting</h3>
        <p className="mx-auto max-w-[44ch] text-[14.5px] text-ink-2">
          New requests land here the moment someone confirms their email.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <Notice tone="lacquer" icon="✕" className="mb-4">
          {error}
        </Notice>
      ) : null}

      <ul className="list-none p-0">
        {rows.map((u) => (
          <li
            key={u.id}
            className="border-b border-rule-2 px-4 py-4 last:border-b-0 sm:px-5"
          >
            <div className="flex items-start gap-3">
              <Avatar size="md">{initials(u.name)}</Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <b className="text-[14.5px] font-semibold">{u.name}</b>
                  {!u.emailVerified ? (
                    <Chip tone="quiet">email not confirmed</Chip>
                  ) : null}
                  <span className="font-mono text-[11.5px] text-ink-3">
                    {asked(u.createdAt)}
                  </span>
                </div>
                <div className="text-[12.5px] text-ink-3">{u.email}</div>

                <p className="mt-2 mb-0 text-[13.5px] text-ink-2">
                  {u.occupation || (
                    <span className="text-ink-3">occupation not given</span>
                  )}
                </p>
                <p className="mt-1 mb-0 text-[13.5px] text-ink-2">
                  {u.note ? (
                    u.note
                  ) : (
                    <Chip tone="lacquer">no note — blank requests get declined</Chip>
                  )}
                </p>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="felt"
                    size="sm"
                    disabled={busy === u.id}
                    onClick={() => decide(u.id, 'approve')}
                  >
                    {busy === u.id ? '…' : 'Approve'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy === u.id}
                    onClick={() => decide(u.id, 'reject')}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
