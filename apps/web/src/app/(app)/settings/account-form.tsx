'use client';

import { useState } from 'react';

import { Button, Field, Input, InputPrefix, Notice } from '@/components/ui';

export function AccountForm({
  email,
  chesscomUsername,
}: {
  email: string;
  chesscomUsername: string;
}) {
  const [username, setUsername] = useState(chesscomUsername);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    const res = await fetch('/api/me/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chesscomUsername: username }),
    });
    setBusy(false);
    if (res.ok) setSaved(true);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {saved ? <Notice tone="felt" icon="✓">Saved.</Notice> : null}

      <Field label="Email" htmlFor="email" help="Changing this is not built yet.">
        <Input id="email" value={email} readOnly disabled />
      </Field>

      <Field label="chess.com username" htmlFor="chesscom">
        <InputPrefix
          id="chesscom"
          prefix="chess.com/"
          placeholder="yourname"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>

      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
