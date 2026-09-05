'use client';

import type { MoveAnalysis } from '@greekgift/engine';
import { useEffect, useRef } from 'react';

import { CLASS_STYLE } from '@/components/classification';

/**
 * The move list, with every move wearing its verdict.
 *
 * Reading down this column is how someone finds the moves worth looking at
 * without playing through the game, so the glyph matters more than the SAN.
 */

export interface NotationProps {
  moves: MoveAnalysis[];
  ply: number;
  onSeek: (ply: number) => void;
  /** The reader's own line, shown under the move it branched from. */
  variation?: { fromPly: number; sans: string[] } | null;
}

export function Notation({ moves, ply, onSeek, variation = null }: NotationProps) {
  const box = useRef<HTMLDivElement>(null);

  const pairs: MoveAnalysis[][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push(moves.slice(i, i + 2));

  // Jumping by graph or by arrow key has to bring the move list with it, or
  // the reader ends up looking at move 3 while playing move 40.
  useEffect(() => {
    const current = box.current?.querySelector('[aria-current="true"], [data-branch]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [ply, variation]);

  return (
    <div ref={box} className="-mx-1.5 max-h-[236px] overflow-auto px-1.5">
      {pairs.map((pair, index) => {
        const branchedHere =
          variation && Math.floor((variation.fromPly - 1) / 2) === index;

        return (
          <div key={index}>
            <div className="grid grid-cols-[26px_1fr_1fr] items-center border-t border-ink/5 font-mono text-[13px] first:border-t-0">
              <span className="text-[11px] text-ink-3">{index + 1}</span>
              {[0, 1].map((side) => {
                const move = pair[side];
                if (!move) return <span key={side} />;
                const style = CLASS_STYLE[move.classification];
                const current = !variation && ply === move.ply;

                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => onSeek(move.ply)}
                    aria-current={current ? 'true' : undefined}
                    className={`flex w-full items-center gap-1.5 rounded-[2px] px-[7px] py-[5px] text-left ${
                      current ? 'bg-ink text-paper' : 'hover:bg-brass/15'
                    }`}
                  >
                    {move.san}
                    <i
                      aria-hidden
                      className="grid h-3.5 w-3.5 flex-none place-items-center rounded-[3px] text-[8px] leading-none font-bold text-white not-italic"
                      style={{ background: style.color }}
                      dangerouslySetInnerHTML={{ __html: style.glyph }}
                    />
                  </button>
                );
              })}
            </div>

            {branchedHere ? (
              <div
                data-branch
                className="border-t border-ink/5 py-1.5 pr-[7px] pl-[33px] font-mono text-[12px] leading-normal text-lacquer"
              >
                <b className="font-semibold">your line</b> &nbsp;{variation.sans.join(' ')}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
