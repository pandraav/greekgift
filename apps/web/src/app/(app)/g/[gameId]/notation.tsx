'use client';

import type { GameEnding, MoveAnalysis } from '@greekgift/engine';
import { useEffect, useRef } from 'react';

import { CLASS_STYLE } from '@/components/classification';
import { durationWords, spentShort } from '@/lib/clock-format';

import { endingShort, resultText } from './ending-copy';

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
  /** Per-ply clock flags from the time report; absent when the game has no clocks. */
  timeFlags?: ReadonlyMap<number, { inTrouble: boolean; longThink: boolean }>;
  /** How the game ended: a last row, "0–1 · White lost on time". */
  ending?: GameEnding | null;
}

export function Notation({ moves, ply, onSeek, variation = null, timeFlags, ending = null }: NotationProps) {
  const box = useRef<HTMLDivElement>(null);

  const pairs: MoveAnalysis[][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push(moves.slice(i, i + 2));

  // Jumping by graph or by arrow key has to bring the move list with it, or
  // the reader ends up looking at move 3 while playing move 40. Scroll only
  // this box: scrollIntoView would drag the whole page along on first load.
  useEffect(() => {
    const el = box.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="true"], [data-branch]');
    if (!el || !current) return;
    const top = current.offsetTop;
    const bottom = top + current.offsetHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [ply, variation]);

  // A line branched from the starting position precedes move 1, so it has no
  // pair to hang under: it goes above the list instead of inside it.
  const branch = variation ? (
    <div
      data-branch
      className="border-t border-ink/5 py-1.5 pr-[7px] pl-[33px] font-mono text-[12px] leading-normal text-lacquer first:border-t-0"
    >
      <b className="font-semibold">your line</b> &nbsp;{variation.sans.join(' ')}
    </div>
  ) : null;

  return (
    <div ref={box} className="relative -mx-1.5 max-h-[236px] overflow-auto px-1.5">
      {variation?.fromPly === 0 ? branch : null}
      {pairs.map((pair, index) => {
        const branchedHere =
          variation !== null &&
          variation.fromPly > 0 &&
          Math.floor((variation.fromPly - 1) / 2) === index;

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
                    {move.clock ? (
                      <Spent
                        spent={move.clock.spent}
                        left={move.clock.left}
                        current={current}
                        flags={timeFlags?.get(move.ply)}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {branchedHere ? branch : null}
          </div>
        );
      })}
      {ending ? (
        <div className="border-t border-[rgba(26,21,15,.055)] pt-2 pr-[7px] pb-1 pl-[33px] font-mono text-[12px] text-ink-2">
          <b className="font-semibold text-ink">{resultText(ending)}</b> · {endingShort(ending)}
        </div>
      ) : null}
    </div>
  );
}

/** Time spent on a move, right-aligned in its cell: lacquer in time trouble, brass after a long think. */
function Spent({
  spent,
  left,
  current,
  flags,
}: {
  spent: number;
  left: number;
  current: boolean;
  flags?: { inTrouble: boolean; longThink: boolean };
}) {
  const tone = current
    ? 'text-paper/70'
    : flags?.inTrouble
      ? 'text-lacquer'
      : flags?.longThink
        ? 'text-brass-lo underline decoration-brass decoration-2 underline-offset-3'
        : 'text-ink-3';
  return (
    <span
      title={`${durationWords(spent)} spent, ${durationWords(left)} left`}
      className={`ml-auto pl-1 text-[10.5px] tabular-nums ${tone}`}
    >
      {spentShort(spent)}
    </span>
  );
}
