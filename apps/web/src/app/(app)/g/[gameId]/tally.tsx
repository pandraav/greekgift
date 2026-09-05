'use client';

import type { PlayerSummary } from '@greekgift/engine';

import { CLASS_ORDER, CLASS_STYLE } from '@/components/classification';

/**
 * Both players' moves, counted by class.
 *
 * The bar is the whole point: four blunders next to twenty best moves is a
 * different game from four blunders next to four best moves, and a column of
 * numbers hides the difference.
 */

export function Tally({ white, black }: { white: PlayerSummary; black: PlayerSummary }) {
  const totals = CLASS_ORDER.map((c) => white.counts[c] + black.counts[c]);
  const most = Math.max(...totals) || 1;

  return (
    <>
      <div className="mb-1.5 grid grid-cols-[17px_1fr_38px_20px_20px] gap-[9px] border-b border-rule pb-[5px] font-mono text-[9.5px] tracking-[0.13em] text-ink-3 uppercase">
        <span />
        <span />
        <span />
        <span className="text-right">W</span>
        <span className="text-right">B</span>
      </div>

      <div className="flex flex-col gap-px">
        {CLASS_ORDER.map((name, i) => {
          const style = CLASS_STYLE[name];
          const w = white.counts[name];
          const b = black.counts[name];
          const total = totals[i]!;

          return (
            <div
              key={name}
              className={`grid grid-cols-[17px_1fr_38px_20px_20px] items-center gap-[9px] py-[3px] text-[13.5px] ${
                total ? '' : 'opacity-40'
              }`}
            >
              <i
                aria-hidden
                className="grid h-[17px] w-[17px] place-items-center rounded-[3px] text-[9px] leading-none font-bold text-white not-italic"
                style={{ background: style.color }}
                dangerouslySetInnerHTML={{ __html: style.glyph }}
              />
              <span className="text-ink-2">{style.label}</span>
              <span className="h-[5px] overflow-hidden rounded-full bg-paper-3">
                <i
                  className="block h-full rounded-full opacity-90"
                  style={{ width: `${((total / most) * 100).toFixed(0)}%`, background: style.color }}
                />
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums">{w}</span>
              <span className="text-right font-mono text-[12px] tabular-nums text-ink-3">{b}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
