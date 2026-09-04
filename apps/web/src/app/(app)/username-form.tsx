'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, InputPrefix, Notice } from '@/components/ui';

const VALID = /^[a-zA-Z0-9_-]{3,25}$/;

export function UsernameForm({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = value.trim().replace(/^@/, '');
    if (!VALID.test(name)) {
      setError(
        'chess.com usernames are 3–25 characters, letters, numbers, _ or -.',
      );
      return;
    }
    setError(null);
    setBusy(true);
    router.push(`/u/${name.toLowerCase()}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <Notice tone="lacquer" icon="✕">
          {error}
        </Notice>
      ) : null}

      <Field
        label="chess.com username"
        htmlFor="username"
        help="Public games only. Nothing is posted, nothing is changed on chess.com."
      >
        <InputPrefix
          id="username"
          prefix="chess.com/"
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="brass" size="lg" disabled={busy}>
          {busy ? 'Reading…' : 'Review my games'}
        </Button>
        <span className="text-[13.5px] text-ink-3">or press Enter</span>
      </div>
    </form>
  );
}
