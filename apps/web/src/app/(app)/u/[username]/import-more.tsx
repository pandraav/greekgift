'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';

import { importMoreMonths } from './actions';

export function ImportMore({ username }: { username: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [months, setMonths] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  function load(more: number) {
    start(async () => {
      setMessage(null);
      const next = months + more;
      const result = await importMoreMonths(username, next);
      setMonths(next);
      setMessage(`Read ${result.months} month${result.months === 1 ? '' : 's'} — ${result.stored} games.`);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
      <Button variant="onwood" size="sm" disabled={pending} onClick={() => load(3)}>
        {pending ? 'Reading chess.com…' : 'Load 3 more months'}
      </Button>
      {message ? (
        <span className="text-[13px] text-paper/50">{message}</span>
      ) : null}
    </div>
  );
}
