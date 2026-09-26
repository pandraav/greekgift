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
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => load(3)}>
        {pending ? 'Reading chess.com…' : 'Show older games'}
      </Button>
      {message ? (
        <span className="text-[13px] text-ink-3">{message}</span>
      ) : null}
    </div>
  );
}
