'use client';

import { useEffect, useState } from 'react';

import { Button, Chip } from '@/components/ui';

/**
 * Create-or-reuse the link, copy it, say so for two seconds, and leave the
 * URL on the page for anyone whose clipboard did not cooperate.
 */
export function ShareButton({ gameId }: { gameId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  // Two states, not one: the bar's own Copy must not make the header button
  // say "Link copied" as well.
  const [copiedHeader, setCopiedHeader] = useState(false);
  const [copiedBar, setCopiedBar] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!copiedHeader) return;
    const t = setTimeout(() => setCopiedHeader(false), 2000);
    return () => clearTimeout(t);
  }, [copiedHeader]);

  useEffect(() => {
    if (!copiedBar) return;
    const t = setTimeout(() => setCopiedBar(false), 2000);
    return () => clearTimeout(t);
  }, [copiedBar]);

  async function copy(text: string, markCopied: (copied: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      markCopied(true);
    } catch {
      // The field below is selectable; that is the fallback.
    }
  }

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(`/api/games/${gameId}/share`, { method: 'POST' });
      if (!res.ok) return;
      const body = (await res.json()) as { url: string };
      setUrl(body.url);
      await copy(body.url, setCopiedHeader);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="onwood" size="sm" disabled={busy} onClick={share}>
        {copiedHeader ? 'Link copied' : 'Share'}
      </Button>
      {url ? (
        <div className="-mt-1.5 mb-4 flex w-full flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-brass-hi/30 bg-white/5 px-3.5 py-2.5">
          {copiedBar ? <Chip tone="felt">Link copied</Chip> : null}
          <label htmlFor="share-url" className="sr-only">
            Share link
          </label>
          <input
            id="share-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-paper/85 outline-none"
          />
          <Button variant="onwood" size="sm" onClick={() => copy(url, setCopiedBar)}>
            Copy
          </Button>
          <span className="text-[12.5px] text-paper/50">Anyone you send it to can ask to see this game.</span>
        </div>
      ) : null}
    </>
  );
}
