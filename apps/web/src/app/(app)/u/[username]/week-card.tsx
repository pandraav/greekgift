'use client';

import { Eyebrow } from '@/components/ui';
import type { WeekSummary } from '@/lib/week';

import { useWeekReader } from '../../week-reader';

export function WeekCard({ username, since, summary }: { username: string; since: string; summary: WeekSummary }) {
  const reader = useWeekReader();
  const progress = reader.byAccount[username];
  const reading = progress && progress.done < progress.total;
  const { record } = summary;
  const total = Math.max(1, record.w + record.d + record.l);

  return (
    <div className="mb-4 rounded-[5px] border border-black/35 bg-paper text-ink shadow-paper">
      <div className="grid items-end gap-[18px_22px] px-[22px] pt-[18px] pb-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.3fr_1.3fr] lg:gap-[26px]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Eyebrow className="mb-[9px]">Last 7 days · since {since}</Eyebrow>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-label={`${record.w} wins, ${record.d} draws, ${record.l} losses`}>
            <i className="block bg-felt" style={{ flex: record.w / total }} />
            <i className="block bg-ink-3" style={{ flex: record.d / total }} />
            <i className="block bg-lacquer" style={{ flex: record.l / total }} />
          </div>
          <p className="mt-2 mb-0 flex flex-wrap gap-x-3.5 gap-y-2 text-[13px]">
            <Rec tone="text-felt">{record.w} won</Rec>
            <Rec tone="text-ink-3">{record.d} drawn</Rec>
            <Rec tone="text-lacquer">{record.l} lost</Rec>
            <span className="text-ink-3">{summary.played} played · {summary.read} read</span>
          </p>
        </div>
        <Stat k="Accuracy">
          {summary.accuracy !== null ? (
            <>{summary.accuracy.toFixed(1)}<small className="ml-1 font-sans text-[14px] font-normal text-ink-3">avg</small></>
          ) : (
            <span className="text-[19px] text-ink-3">—</span>
          )}
        </Stat>
        <Stat k="Most played" text>
          {summary.mostPlayed ? (
            <>{summary.mostPlayed.name}<small>{summary.mostPlayed.count} games · {summary.mostPlayed.record.w}–{summary.mostPlayed.record.d}–{summary.mostPlayed.record.l}</small></>
          ) : (
            <>No games yet<small>&nbsp;</small></>
          )}
        </Stat>
        <Stat k="Costliest habit" text>
          {summary.habit.label}<small>{summary.habit.sub || ' '}</small>
        </Stat>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-rule bg-paper-2 px-[22px] py-[11px] text-[13.5px]">
        {reading ? (
          <>
            <span><b className="font-semibold">Reading the last 7 days</b> — {progress.done} of {progress.total} games</span>
            <span className="block h-2 max-w-[360px] flex-1 overflow-hidden rounded-full bg-paper-3">
              <i className="block h-full rounded-full bg-gradient-to-r from-brass-lo to-brass-hi transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </span>
          </>
        ) : (
          <span><b className="font-semibold">The last 7 days are read</b> — {summary.read} of {summary.played} games</span>
        )}
        <span className="text-[12.5px] text-ink-3">Older games are read when you ask.</span>
      </div>
    </div>
  );
}

function Rec({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <b className={`inline-flex items-center gap-1.5 font-semibold before:size-2 before:rounded-[2px] before:bg-current before:content-[''] ${tone}`}>{children}</b>
  );
}

function Stat({ k, text = false, children }: { k: string; text?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10.5px] tracking-[.13em] text-ink-3 uppercase">{k}</span>
      <span
        className={`type-stat font-display font-semibold tracking-[-.03em] ${
          text ? 'pt-[5px] text-[19px] leading-[1.2] tracking-[-.01em] [&>small]:mt-0.5 [&>small]:block [&>small]:font-sans [&>small]:text-[12.5px] [&>small]:font-normal [&>small]:text-ink-3' : 'text-[30px] leading-[1.05]'
        }`}
      >
        {children}
      </span>
    </div>
  );
}
