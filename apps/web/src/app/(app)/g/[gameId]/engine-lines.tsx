'use client';

import type { MoveAnalysis } from '@greekgift/engine';
import { useMemo } from 'react';

import { Eyebrow } from '@/components/ui';
import { formatScore, linesAt, numberedLine, pvToSan } from '@/lib/lines';

/**
 * What the engine would have played.
 *
 * Three lines for the position on the board, best first, each with the
 * score it leads to. The first score is the number beside the bar, said
 * out loud. Clicking a line plays it: the reader leaves the game the same
 * way they would by dragging a piece.
 */

export interface EngineLinesProps {
  moves: MoveAnalysis[];
  /** The game ply on the board; ignored while the reader is off the game. */
  ply: number;
  exploring: boolean;
  onPlayLine: (sans: string[]) => void;
}

export function EngineLines({ moves, ply, exploring, onPlayLine }: EngineLinesProps) {
  const at = useMemo(() => linesAt(moves, ply), [moves, ply]);

  // A line that will not replay from this position has nothing to show and
  // nothing to play, so it never becomes a row.
  const rows = useMemo(
    () =>
      at
        ? at.lines
            .map((line) => {
              const sans = pvToSan(at.fen, line.pv);
              return { line, sans, text: numberedLine(at.fen, sans) };
            })
            .filter((row) => row.sans.length > 0)
        : [],
    [at],
  );

  // Off the game, or with nothing stored, the numbers would be last
  // position's — stale numbers read as this position's, so show none.
  const showNumbers = !exploring && rows.length > 0;
  const top = showNumbers ? rows[0]!.line : undefined;
  const caption =
    top?.score.mate !== undefined
      ? `mate in ${Math.abs(top.score.mate)}`
      : "White's view";

  return (
    <div
      className={`mt-4 w-full border-t border-rule pt-3.5 text-ink transition-opacity ${
        exploring ? 'opacity-30' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Engine</Eyebrow>
        {showNumbers && at ? (
          <span className="font-mono text-[12px] text-ink-3 tabular-nums">
            depth {at.depth} · {Math.round(at.nodes / 1000)}k nodes
          </span>
        ) : null}
      </div>

      {top ? (
        <div className="mt-2.5 mb-1.5 flex items-baseline gap-2.5">
          <b className="font-mono text-[22px] font-semibold tabular-nums">
            {formatScore(top.score)}
          </b>
          <span className="text-[12px] text-ink-3">{caption}</span>
        </div>
      ) : null}

      {exploring ? (
        <p className="mt-2 mb-0 text-[14.5px] text-ink-3">
          No engine lines for this position yet. Back to the game to see them.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 mb-0 text-[14.5px] text-ink-3">
          No engine lines stored for this position.
        </p>
      ) : (
        <div>
          {rows.map(({ line, sans, text }, index) => (
            <button
              key={line.multipv}
              type="button"
              aria-label={`Play line ${index + 1}: ${sans.join(' ')}`}
              onClick={() => onPlayLine(sans)}
              className="grid w-full grid-cols-[62px_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-[2px] border-t border-ink/5 px-[7px] py-[6px] text-left hover:bg-brass/15 first:border-t-0"
            >
              <span className="text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                {formatScore(line.score)}
              </span>
              <span className="line-clamp-2 font-mono text-[13px] leading-normal">{text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
