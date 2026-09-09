'use client';

import { useState } from 'react';

import { Button, Card, CardBody, CardHead, LinkButton, Notice } from '@/components/ui';

export function AskToSee({
  token,
  ownerName,
  alreadyAsked,
}: {
  /** Null when the visitor arrived without a valid share link. */
  token: string | null;
  ownerName: string | null;
  alreadyAsked: boolean;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'already' | 'error'>(
    alreadyAsked ? 'already' : 'idle',
  );

  async function ask() {
    if (!token) return;
    setState('busy');
    const res = await fetch(`/api/shares/${token}/request`, { method: 'POST' });
    if (!res.ok) return setState('error');
    const { status } = (await res.json()) as { status: 'already_visible' | 'pending' | 'created' };
    if (status === 'already_visible') return window.location.reload();
    setState(status === 'pending' ? 'already' : 'sent');
  }

  if (!token || !ownerName) {
    return (
      <Card lift>
        <CardHead>
          <h2 className="text-[17px] font-semibold">This game is not in your library</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Ask whoever sent you here for their share link, or open it from the player&rsquo;s page.
          </p>
        </CardHead>
        <CardBody>
          <LinkButton href="/" variant="ghost" size="lg">Home</LinkButton>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card lift>
      <CardHead>
        <h2 className="text-[17px] font-semibold">This game is in {ownerName}&rsquo;s library</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Ask and {ownerName} decides. Once you are in, your coach reads it in your own voice.
        </p>
      </CardHead>
      <CardBody>
        <div className="flex flex-wrap gap-3">
          <Button variant="brass" size="lg" disabled={state !== 'idle'} onClick={ask}>
            {state === 'already' ? 'Already asked' : `Ask ${ownerName} to share it`}
          </Button>
          <LinkButton href="/" variant="ghost" size="lg">Home</LinkButton>
        </div>
        {state === 'sent' ? (
          <Notice tone="felt" icon="✓" className="mt-4">Sent. You will get an email when they say yes.</Notice>
        ) : null}
        {state === 'error' ? (
          <Notice tone="lacquer" icon="✕" className="mt-4">That did not go through. Try again.</Notice>
        ) : null}
      </CardBody>
    </Card>
  );
}
