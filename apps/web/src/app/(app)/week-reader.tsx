'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { runAnalysis } from '@/lib/engine/analyse-game';

/**
 * Reads the week in the background (spec §7.2).
 *
 * Mounted once in the app layout so it survives navigation. On mount and
 * after any refresh it fetches the queue, then analyses one game at a time
 * with the same `runAnalysis` the review page uses — oldest first, 300k
 * nodes, four workers — and the review POST stores the result. It waits
 * while the tab is hidden and carries on when it is seen again. A second tab
 * runs its own queue; the POST is idempotent, so that costs CPU, not
 * correctness.
 */

interface QueueItem {
  gameId: string;
  account: string;
  fens: string[];
}

export interface ReaderState {
  current: { gameId: string; account: string } | null;
  done: number;
  total: number;
  byAccount: Record<string, { done: number; total: number }>;
}

const IDLE: ReaderState = { current: null, done: 0, total: 0, byAccount: {} };

const Context = createContext<ReaderState>(IDLE);

export const useWeekReader = () => useContext(Context);

const untilVisible = () =>
  new Promise<void>((resolve) => {
    if (!document.hidden) return resolve();
    const onChange = () => {
      if (!document.hidden) {
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onChange);
  });

export function WeekReaderProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const [state, setState] = useState<ReaderState>(IDLE);
  const queue = useRef<QueueItem[]>([]);
  const running = useRef(false);
  const generation = useRef(0);
  // The game currently mid-analysis. A ref, not `state.current`, because
  // `load` is called from an effect with a stable identity and must see the
  // latest value rather than whatever was current when it was created.
  const currentRef = useRef<{ gameId: string; account: string } | null>(null);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length > 0) {
        await untilVisible();
        const item = queue.current.shift()!;
        currentRef.current = { gameId: item.gameId, account: item.account };
        setState((s) => ({ ...s, current: currentRef.current }));
        try {
          await runAnalysis({ gameId: item.gameId, fens: item.fens, onState: () => undefined });
        } catch {
          // A failed game is skipped; the next visit queues it again.
        }
        currentRef.current = null;
        setState((s) => ({
          ...s,
          current: null,
          done: s.done + 1,
          byAccount: {
            ...s.byAccount,
            [item.account]: {
              done: (s.byAccount[item.account]?.done ?? 0) + 1,
              total: s.byAccount[item.account]?.total ?? 1,
            },
          },
        }));
        // Only the pages that show rows care; a reader mid-review is left alone.
        if (pathRef.current === '/' || pathRef.current.startsWith('/u/')) router.refresh();
      }
    } finally {
      running.current = false;
      currentRef.current = null;
      setState((s) => ({ ...s, current: null }));
    }
  }, [router]);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const res = await fetch('/api/me/week').catch(() => null);
    if (!res?.ok || gen !== generation.current) return;
    const body = (await res.json()) as { games: QueueItem[] };
    const active = currentRef.current?.gameId;
    queue.current = body.games.filter((g) => g.gameId !== active);
    const byAccount: ReaderState['byAccount'] = {};
    for (const g of body.games) {
      const a = (byAccount[g.account] ??= { done: 0, total: 0 });
      a.total += 1;
    }
    setState((s) => ({ ...s, total: body.games.length + (active ? 1 : 0), done: 0, byAccount }));
    void drain();
  }, [drain]);

  useEffect(() => {
    void load();
    const onChanged = () => void load();
    window.addEventListener('greekgift:week-changed', onChanged);
    return () => window.removeEventListener('greekgift:week-changed', onChanged);
  }, [load]);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}
