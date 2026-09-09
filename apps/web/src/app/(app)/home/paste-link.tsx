'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, Input, InputPrefix, Notice } from '@/components/ui';

/**
 * A pasted game link. chess.com's callback usually answers; when it does not,
 * the form asks for either player's name and walks their archives (spec §1).
 */
export function PasteLink() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [needUsername, setNeedUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/games/from-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, ...(needUsername ? { username } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { href?: string; error?: string; message?: string };
      if (res.ok && body.href) {
        router.push(body.href as Route);
        return;
      }
      if (body.error === 'bad_link') setError('That is not a chess.com game link.');
      else if (body.error === 'need_username') setNeedUsername(true);
      else if (body.error === 'not_found')
        setError(`Not in the last 12 months of chess.com/${username.trim().toLowerCase()}. Try the other player.`);
      else if (body.error === 'bad_username') setError('chess.com usernames are 3–25 characters, letters, numbers, _ or -.');
      else setError(body.message ?? 'chess.com did not answer. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Notice tone="lacquer" icon="✕">{error}</Notice> : null}
      <Field
        label="Paste a chess.com game link"
        htmlFor="lnk"
        help="Live or daily. The game is fetched and opened here, then kept in your library."
      >
        <div className="flex items-stretch gap-2.5">
          <Input
            id="lnk"
            className="min-w-0 flex-1"
            placeholder="https://www.chess.com/game/live/…"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" variant="brass" disabled={busy || !url.trim()}>
            {busy ? 'Fetching…' : 'Open'}
          </Button>
        </div>
      </Field>
      {needUsername ? (
        <Field
          label="chess.com could not hand that game over. Whose game is it?"
          htmlFor="lnk-user"
          help="Either player's username. Their archives are searched for the game."
        >
          <InputPrefix
            id="lnk-user"
            prefix="chess.com/"
            placeholder="yourname"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
      ) : null}
    </form>
  );
}
