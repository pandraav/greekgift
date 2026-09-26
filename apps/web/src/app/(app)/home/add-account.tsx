'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, InputPrefix, Notice } from '@/components/ui';

const MESSAGES: Record<string, string> = {
  bad_username: 'chess.com usernames are 3–25 characters, letters, numbers, _ or -.',
  limit: 'Five accounts is the limit. Remove one to add another.',
  exists: 'That account is already linked.',
  no_such_player: 'chess.com has no player by that name.',
};

/** The dashed card. Adds, then refreshes so the card fills in before the page re-renders. */
export function AddAccount({ count, hero = false }: { count: number; hero?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'adding' | 'reading' | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy('adding');
    try {
      const res = await fetch('/api/me/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(MESSAGES[body.error ?? ''] ?? 'Something went wrong. Try again.');
        return;
      }
      const { account } = (await res.json()) as { account: { username: string } };
      setBusy('reading');
      await fetch(`/api/me/accounts/${account.username}/refresh`, { method: 'POST' }).catch(() => undefined);
      window.dispatchEvent(new Event('greekgift:week-changed'));
      setValue('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Notice tone="lacquer" icon="✕">{error}</Notice> : null}
      <Field
        label={hero ? 'chess.com username' : 'Add a chess.com account'}
        htmlFor="add"
        help="Public games only. Nothing is verified and nothing is posted to chess.com."
      >
        <div className="flex items-stretch gap-2.5">
          <div className="min-w-0 flex-1">
            <InputPrefix
              id="add"
              prefix="chess.com/"
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={count >= 5}
            />
          </div>
          <Button type="submit" variant="brass" size={hero ? 'lg' : 'md'} disabled={busy !== null || count >= 5}>
            {busy === 'adding' ? 'Adding…' : busy === 'reading' ? 'Reading…' : hero ? 'Review my games' : 'Add'}
          </Button>
        </div>
      </Field>
    </form>
  );
}
