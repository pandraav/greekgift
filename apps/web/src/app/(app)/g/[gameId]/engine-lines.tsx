'use client';

import type { EngineLine, MoveAnalysis } from '@greekgift/engine';
import { useMemo } from 'react';

import { CLASS_STYLE } from '@/components/classification';
import { Eyebrow } from '@/components/ui';
import { clockFace, spentShort } from '@/lib/clock-format';
import type { LiveLines } from '@/lib/engine/live';
import {
  formatScore,
  gameOverAt,
  linesAt,
  mateCaption,
  numberedLine,
  playedRowAt,
  pvToSan,
  scoreAt,
} from '@/lib/lines';

/**
 * What the engine would have played (design §7).
 *
 * Top to bottom: the readout for the position on the board; **The move**,
 * the move just played with its own score and the engine's best line from
 * the position before it; then **From here**, three lines for the position
 * on the board. Off the game, the same rows carry the live engine's lines
 * for the reader's own position.
 *
 * Every slot is always rendered, and a slot with nothing to say is invisible
 * rather than gone: this card sits under the board on a phone, and a card
 * that changes height at a step drags the page, and the board, with it.
 */

export interface EngineLinesProps {
  moves: MoveAnalysis[];
  /** The game ply on the board; ignored while the reader is off the game. */
  ply: number;
  /** The reader's own line, when they are off the game. */
  exploring: { fen: string; text: string } | null;
  /** The live engine on the explored position. */
  live: LiveLines;
  /** Held back while the reader is looking for a move at a key moment. */
  concealed?: boolean;
  /** The played move was made in time trouble (time report). */
  playedInTrouble?: boolean;
  /** Plays SANs from game ply `fromPly` as the reader's line. */
  onPlayLine: (sans: string[], fromPly: number) => void;
  /** Appends SANs to the reader's current line. */
  onExtendLine: (sans: string[]) => void;
}

interface Row {
  line: EngineLine;
  sans: string[];
  text: string;
}

const rowsFor = (fen: string, lines: EngineLine[]): Row[] =>
  lines
    .map((line) => {
      const sans = pvToSan(fen, line.pv);
      return { line, sans, text: numberedLine(fen, sans) };
    })
    // A line that will not replay from this position has nothing to show and
    // nothing to play, so it never becomes a row.
    .filter((row) => row.sans.length > 0);

const nodesLabel = (nodes: number) => `${Math.round(nodes / 1000).toLocaleString('en-US')}k nodes`;

export function EngineLines({
  moves,
  ply,
  exploring,
  live,
  concealed = false,
  playedInTrouble = false,
  onPlayLine,
  onExtendLine,
}: EngineLinesProps) {
  const at = useMemo(() => linesAt(moves, ply), [moves, ply]);
  const played = useMemo(() => (exploring ? null : playedRowAt(moves, ply)), [exploring, moves, ply]);

  const fen = exploring ? exploring.fen : (at?.fen ?? '');
  const over = useMemo(() => (fen ? gameOverAt(fen) : null), [fen]);

  const rows = useMemo(() => {
    if (exploring) return rowsFor(exploring.fen, live.lines);
    return at ? rowsFor(at.fen, at.lines) : [];
  }, [at, exploring, live.lines]);

  const livePending = exploring !== null && live.status === 'running' && rows.length === 0;

  // The readout: the position on the board, White's view.
  const top = exploring ? live.lines[0]?.score : scoreAt(moves, ply);
  const readout = concealed ? '?' : top ? formatScore(top) : '…';
  const caption = concealed
    ? 'hidden while you look for a move'
    : over === 'checkmate'
      ? 'Checkmate'
      : over === 'stalemate'
        ? 'Stalemate'
        : top
          ? (mateCaption(top) ?? "White's view")
          : live.status === 'error'
            ? 'the engine could not start'
            : 'thinking in your browser';

  const meta = concealed ? (
    ' '
  ) : exploring ? (
    live.status === 'running' ? (
      <span className="text-felt">live · depth {live.depth}…</span>
    ) : live.status === 'done' ? (
      `depth ${live.depth} · ${nodesLabel(live.nodes)}`
    ) : (
      ' '
    )
  ) : at && at.lines.length > 0 ? (
    `depth ${at.depth} · ${nodesLabel(at.nodes)}`
  ) : (
    ' '
  );

  const message = concealed
    ? 'The lines come back once you have tried a move or asked for the answer.'
    : over === 'checkmate'
      ? 'Game over: checkmate.'
      : over === 'stalemate'
        ? 'Game over: stalemate.'
        : exploring
          ? live.status === 'error'
            ? 'The engine could not run in this browser.'
            : null
          : rows.length === 0
            ? 'No engine lines stored for this position.'
            : null;

  const showRows = !concealed && over === null;

  return (
    <div className="mt-4 w-full border-t border-rule pt-3.5 text-ink">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Engine</Eyebrow>
        <span className="font-mono text-[12px] text-ink-3 tabular-nums">{meta}</span>
      </div>

      <div className="mt-2.5 mb-1.5 flex items-baseline gap-2.5">
        <b className="font-mono text-[22px] font-semibold tabular-nums">{readout}</b>
        <span className="truncate text-[12px] text-ink-3">{caption}</span>
      </div>

      {/* The move: always two rows tall, whatever it holds. */}
      <p className={LABEL}>{exploring ? 'Your line' : 'The move'}</p>
      <div className={concealed ? 'invisible' : ''}>
        {exploring ? (
          <>
            <div className={PLAYED}>
              <span />
              <span className="truncate font-mono text-[13.5px] font-semibold" title={exploring.text}>
                {exploring.text}
              </span>
            </div>
            <Placeholder />
          </>
        ) : played ? (
          <>
            <div className={PLAYED}>
              <span className="text-right font-mono text-[12.5px] font-semibold tabular-nums">
                {formatScore(played.score)}
              </span>
              <span className="flex min-w-0 items-center gap-2 font-mono text-[13.5px] font-semibold">
                <span className="truncate">{played.moveLabel}</span>
                <i
                  aria-hidden
                  className="inline-grid h-[17px] w-[17px] flex-none place-items-center rounded-[3px] text-[9px] leading-none font-bold text-white not-italic"
                  style={{ background: CLASS_STYLE[played.classification].color }}
                  dangerouslySetInnerHTML={{ __html: CLASS_STYLE[played.classification].glyph }}
                />
                <span className="truncate font-sans text-[12.5px] font-medium text-ink-3">
                  {CLASS_STYLE[played.classification].label}
                  {played.clock ? (
                    <span className="font-mono text-[12px] font-normal">
                      {` · ${spentShort(played.clock.spent)} · ${clockFace(played.clock.left)} left`}
                      {playedInTrouble ? (
                        <>
                          {' · '}
                          <span className="text-lacquer">in time trouble</span>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </span>
            </div>
            {played.isBest || !played.best ? (
              <div className={PLAYED}>
                <span />
                <span className="truncate font-mono text-[13.5px] font-medium text-felt">
                  {played.isBest ? `${played.san} was the engine's choice` : 'No engine line stored before this move.'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                title={numberedLine(played.best.fen, played.best.sans)}
                aria-label={`Play the best line for ${played.best.side}: ${played.best.sans.join(' ')}`}
                onClick={() => onPlayLine(played.best!.sans, ply - 1)}
                className={`${ROW} hover:bg-brass/15`}
              >
                <span className="text-right font-mono text-[12.5px] font-semibold text-felt tabular-nums">
                  {formatScore(played.best.score)}
                </span>
                <span className="truncate font-mono text-[13px] leading-normal">
                  <b className="mr-2 font-sans text-[12px] font-semibold tracking-[.01em] text-felt">
                    Best for {played.best.side}
                  </b>
                  {numberedLine(played.best.fen, played.best.sans)}
                </span>
              </button>
            )}
          </>
        ) : (
          <>
            <div className={PLAYED}>
              <span />
              <span className="truncate text-[13.5px] text-ink-3">The start: no move played yet.</span>
            </div>
            <Placeholder />
          </>
        )}
      </div>

      <p className={LABEL}>From here</p>
      <div className="relative">
        {Array.from({ length: ROWS }, (_, index) => {
          const row = showRows ? rows[index] : undefined;
          if (row) {
            return (
              <button
                key={index}
                type="button"
                title={row.text}
                aria-label={`Play line ${index + 1}: ${row.sans.join(' ')}`}
                onClick={() => (exploring ? onExtendLine(row.sans) : onPlayLine(row.sans, ply))}
                className={`${ROW} hover:bg-brass/15`}
              >
                <span className="text-right font-mono text-[12.5px] text-ink-2 tabular-nums">
                  {formatScore(row.line.score)}
                </span>
                <span className="truncate font-mono text-[13px] leading-normal">{row.text}</span>
              </button>
            );
          }
          if (showRows && livePending) {
            return (
              <div key={index} aria-hidden className={ROW}>
                <span className="text-right font-mono text-[12.5px] text-ink-3">…</span>
                <span className="animate-pulse truncate rounded-[2px] bg-paper-3 font-mono text-[13px] leading-normal text-transparent">
                  0000 0000 0000 0000
                </span>
              </div>
            );
          }
          return <Placeholder key={index} />;
        })}
        {message ? (
          <p className="absolute inset-x-0 top-0 m-0 pt-0.5 text-[14.5px] text-ink-3">{message}</p>
        ) : null}
      </div>
    </div>
  );
}

/** A row's height, holding its place. */
function Placeholder() {
  return (
    <div aria-hidden className={`${ROW} invisible`}>
      <span className="font-mono text-[12.5px]">{' '}</span>
      <span className="font-mono text-[13px] leading-normal">{' '}</span>
    </div>
  );
}

const ROWS = 3;

const LABEL = 'mt-3 mb-0.5 font-mono text-[9.5px] tracking-[.14em] text-ink-3 uppercase';

// A fixed height, not padding alone: a played row, a best row, a line and a
// placeholder carry different fonts, and their natural heights differ by a
// fraction of a pixel — enough to nudge everything under them at a step.
const ROW =
  'grid h-[33px] w-full grid-cols-[62px_minmax(0,1fr)] items-baseline gap-x-2.5 overflow-hidden rounded-[2px] border-t border-ink/5 px-[7px] py-[6px] text-left first:border-t-0';

/** The played row: the same box as a line, so the two stack to one height. */
const PLAYED =
  'grid h-[33px] w-full grid-cols-[62px_minmax(0,1fr)] items-baseline gap-x-2.5 overflow-hidden border-t border-ink/5 px-[7px] py-[6px] leading-normal first:border-t-0';
