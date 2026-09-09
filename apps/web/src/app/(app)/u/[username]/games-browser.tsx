'use client';

import { useMemo, useState } from 'react';

import { RichGameRow, type RichRow } from '@/components/games/rich-game-row';
import { Select } from '@/components/ui';

import { openGame } from './actions';
import { ImportMore } from './import-more';

export interface BrowserRow extends RichRow {
  timeClass: string;
  side: 'w' | 'b';
  inWindow: boolean;
  /** "2026-09" */
  month: string;
  monthLabel: string;
  /** ISO end time, for the "last 30 days" filter. */
  endTime: string;
}

const TIME = ['All', 'Rapid', 'Blitz', 'Bullet'] as const;
const RESULT = ['Any', 'Won', 'Drawn', 'Lost'] as const;

/** Segmented filters over rows the server already prepared (spec §3.2). */
export function GamesBrowser({
  username,
  rows,
  linked,
  now,
}: {
  username: string;
  rows: BrowserRow[];
  linked: boolean;
  /** Request time in epoch ms, from the server: keeps this component pure. */
  now: number;
}) {
  const [time, setTime] = useState<(typeof TIME)[number]>('All');
  const [result, setResult] = useState<(typeof RESULT)[number]>('Any');
  const [colour, setColour] = useState<'both' | 'w' | 'b'>('both');
  const [period, setPeriod] = useState<string>('week');

  const months = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.month)) seen.set(r.month, r.monthLabel);
    return [...seen.entries()];
  }, [rows]);

  const shown = rows.filter((r) => {
    if (time !== 'All' && r.timeClass !== time.toLowerCase()) return false;
    if (result !== 'Any' && r.outcome !== result.toLowerCase()) return false;
    if (colour !== 'both' && r.side !== colour) return false;
    if (period === 'week') return true; // the window and the rest, separated by the rule
    if (period === '30') return now - Date.parse(r.endTime) <= 30 * 86_400_000;
    return r.month === period;
  });
  const inWindow = shown.filter((r) => r.inWindow);
  const older = shown.filter((r) => !r.inWindow);

  const seg = (label: string, options: readonly string[], value: string, set: (v: never) => void) => (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-[5px] border border-rule bg-paper max-sm:w-full">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => set(o as never)}
          className={`border-r border-rule px-3 py-[7px] text-[13px] last:border-r-0 max-sm:flex-1 ${
            value === o ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink-2 hover:bg-paper-2 hover:text-ink'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );

  const row = (r: BrowserRow) => (
    <RichGameRow key={r.gameId} {...r} action={linked ? undefined : openGame.bind(null, r.gameId, username)} />
  );

  return (
    <div className="rounded-[5px] border border-black/35 bg-paper text-ink shadow-paper">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {seg('Time control', TIME, time, setTime)}
          {seg('Result', RESULT, result, setResult)}
          <Select value={colour} onChange={(e) => setColour(e.target.value as 'both' | 'w' | 'b')} className="w-auto min-w-[132px]">
            <option value="both">Both colours</option>
            <option value="w">as White</option>
            <option value="b">as Black</option>
          </Select>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] whitespace-nowrap text-ink-3">{shown.length} games</span>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto min-w-[132px]">
            <option value="week">Last 7 days</option>
            <option value="30">Last 30 days</option>
            {months.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
          </Select>
        </div>
      </div>

      <div>
        {inWindow.map(row)}
        {older.length > 0 ? (
          <div className="flex items-baseline gap-2.5 border-b border-rule-2 bg-paper-2 px-4 pt-2.5 pb-1.5 font-mono text-[10.5px] tracking-[.13em] text-ink-3 uppercase">
            <span>Older than a week</span>
            <span className="font-sans text-[12.5px] tracking-normal normal-case">read when you ask</span>
          </div>
        ) : null}
        {older.map(row)}
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14.5px] text-ink-2">Nothing matches. Loosen a filter or load more months.</p>
        ) : null}
      </div>

      <div className="flex justify-center rounded-b-[5px] border-t border-rule bg-paper-2 px-[22px] py-3.5">
        <ImportMore username={username} />
      </div>
    </div>
  );
}
