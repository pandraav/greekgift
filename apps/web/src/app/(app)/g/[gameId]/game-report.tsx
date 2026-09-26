'use client';

import type { GameReport as Report, MoveAnalysis, Phase, PlayerSummary } from '@greekgift/engine';

import { CLASS_STYLE } from '@/components/classification';
import { Button, Card, CardBody, Chip, Eyebrow } from '@/components/ui';
import { moveLabelOf } from '@/lib/lines';

import { endingHeadline } from './ending-copy';
import { Tally } from './tally';
import { ClockCard, TimeCard } from './time-report';

/**
 * The game report: the summary before the moves (design §10.2).
 *
 * Chess.com's order — how each side played, where the game turned, and only
 * then the board. Everything here comes from `gameReport(review)`; a row
 * click takes the reader to that position on the Moves view.
 */

const PHASE_ROWS: { phase: Phase; label: string }[] = [
  { phase: 'opening', label: 'Opening' },
  { phase: 'middlegame', label: 'Middlegame' },
  { phase: 'endgame', label: 'Endgame' },
];

const moveNo = (ply: number) => Math.floor((ply - 1) / 2) + 1;
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1));

export function GameReport({
  report,
  moves,
  userSide,
  winPercents,
  momentCount,
  onStart,
  onWalk,
  onGoTo,
}: {
  report: Report;
  moves: MoveAnalysis[];
  userSide: 'w' | 'b' | null;
  /** White's win% at every position. */
  winPercents: number[];
  /** Moments the walk steps through (left_book not among them). */
  momentCount: number;
  onStart: () => void;
  onWalk: () => void;
  onGoTo: (ply: number) => void;
}) {
  const { opening } = report;
  const names = { w: report.white.username, b: report.black.username };

  return (
    <div className="grid items-start gap-[14px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-4">
      <div className="flex flex-col gap-[14px] lg:gap-4">
        <Card>
          <CardBody className="px-5 py-[18px]">
            <div
              className={`flex items-baseline justify-between gap-3 ${report.ending ? 'mb-1.5' : 'mb-3.5'}`}
            >
              <Eyebrow>Game report</Eyebrow>
              <span className="font-mono text-[12px] text-ink-3">lichess accuracy</span>
            </div>
            {report.ending ? (
              <p className="m-0 mb-4 max-w-[36ch] font-display text-[19px] leading-[1.3] font-semibold tracking-[-.01em]">
                {endingHeadline(report.ending, userSide)}
              </p>
            ) : null}

            <div className="grid grid-cols-2">
              <Player summary={report.white} side="w" you={userSide === 'w'} />
              <Player summary={report.black} side="b" you={userSide === 'b'} />
            </div>

            <div className="mt-[18px] border-t border-rule-2 pt-4">
              <Eyebrow>Opening</Eyebrow>
              <p className="mt-1.5 mb-[3px] text-[15px] font-medium">
                {opening && opening.name ? `${opening.eco ? `${opening.eco} · ` : ''}${opening.name}` : 'Not in the opening book'}
              </p>
              <p className="m-0 font-mono text-[12.5px] text-ink-3">
                {opening && opening.lastBookMove
                  ? `book through ${opening.lastBookMove} · ${opening.lastBookPly} plies`
                  : 'out of book from the first move'}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="brass" onClick={onStart}>
                Start review
              </Button>
              <Button variant="ghost" onClick={onWalk} disabled={momentCount === 0}>
                Walk the key moments
              </Button>
            </div>
          </CardBody>
        </Card>

        {report.time ? (
          <ClockCard time={report.time} plies={moves.length} ending={report.ending} names={names} />
        ) : null}

        <Card>
          <CardBody className="px-5 py-[18px]">
            <Eyebrow className="mb-3">Accuracy by phase</Eyebrow>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr>
                  {['Phase', report.white.username, report.black.username].map((h, i) => (
                    <th
                      key={i}
                      className={`border-b border-rule pb-1.5 font-mono text-[9.5px] font-normal tracking-[.13em] text-ink-3 uppercase ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PHASE_ROWS.map(({ phase, label }) => {
                  const row = report.phases.find((p) => p.phase === phase);
                  return (
                    <tr key={phase} className="border-b border-rule-2 last:border-b-0">
                      <td className="py-2 text-left text-[14px]">
                        {label}
                        <small className="block font-mono text-[11px] text-ink-3">
                          {row ? `moves ${moveNo(row.firstPly)}–${moveNo(row.lastPly)}` : 'not reached'}
                        </small>
                      </td>
                      {[row?.white, row?.black].map((v, i) => (
                        <td
                          key={i}
                          className={`py-2 text-right font-mono text-[13.5px] tabular-nums ${
                            v === null || v === undefined ? 'text-ink-3' : ''
                          }`}
                        >
                          {pct(v)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-col gap-[14px] lg:gap-4">
        <Card>
          <CardBody className="px-5 py-[18px]">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <Eyebrow>Key moments</Eyebrow>
              <span className="font-mono text-[12px] text-ink-3">
                {momentCount} moment{momentCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-col">
              {report.moments.length === 0 ? (
                <p className="m-0 text-[14px] text-ink-3">Nothing stood out: no errors, no great moves.</p>
              ) : null}
              {report.moments.map((m) => {
                const move = moves[m.ply - 1];
                if (!move) return null;
                const cls = m.kind === 'left_book' ? 'book' : m.kind;
                const style = CLASS_STYLE[cls];
                const book = m.kind === 'left_book';
                const who =
                  userSide === null
                    ? move.color === 'w'
                      ? 'White'
                      : 'Black'
                    : move.color === userSide
                      ? 'you'
                      : 'your opponent';
                const before = winPercents[m.ply - 1] ?? 50;
                const after = winPercents[m.ply] ?? 50;
                const [a, b] = userSide === 'b' ? [100 - before, 100 - after] : [before, after];
                return (
                  <button
                    key={`${m.kind}-${m.ply}`}
                    type="button"
                    onClick={() => onGoTo(m.ply)}
                    className="grid w-full grid-cols-[22px_74px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[2px] border-t border-rule-2 px-1.5 py-2 text-left first:border-t-0 hover:bg-brass/12"
                  >
                    <i
                      aria-hidden
                      className="inline-grid h-[17px] w-[17px] place-items-center rounded-[3px] font-mono text-[9px] leading-none font-bold text-white not-italic"
                      style={{ background: style.color }}
                      dangerouslySetInnerHTML={{ __html: style.glyph }}
                    />
                    <span className={`font-mono text-[13.5px] font-semibold ${book ? 'text-ink-3' : ''}`}>
                      {moveLabelOf(move)}
                    </span>
                    <span className={`truncate text-[13.5px] ${book ? 'text-ink-3' : 'text-ink-2'}`}>
                      {book ? (
                        'Left the book'
                      ) : (
                        <>
                          {style.label} <em className="text-ink-3 not-italic">· {who}</em>
                        </>
                      )}
                    </span>
                    <span className="font-mono text-[12px] whitespace-nowrap text-ink-3 tabular-nums">
                      {book ? '' : `${Math.round(a)}% → ${Math.round(b)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {report.time ? (
          <TimeCard time={report.time} moves={moves} userSide={userSide} ending={report.ending} names={names} />
        ) : null}

        <Card>
          <CardBody className="px-5 py-[18px]">
            <Eyebrow className="mb-3.5">Moves</Eyebrow>
            <Tally white={report.white} black={report.black} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Player({ summary, side, you }: { summary: PlayerSummary; side: 'w' | 'b'; you: boolean }) {
  return (
    <div className={side === 'w' ? 'pr-[18px]' : 'border-l border-rule-2 pl-[18px]'}>
      <div className="mb-1 flex items-center gap-2 text-[14.5px] font-medium">
        <i
          aria-hidden
          className={`h-2.5 w-2.5 flex-none rounded-full border-[1.5px] border-ink ${side === 'w' ? 'bg-white' : 'bg-ink'}`}
        />
        <span className="truncate">{summary.username}</span>
        {you ? (
          <Chip tone="brass" className="px-2 py-px text-[11px]">
            you
          </Chip>
        ) : null}
      </div>
      <div className="font-display text-[44px] leading-[1.05] font-semibold tracking-[-.03em] tabular-nums">
        {summary.accuracy.toFixed(1)}
        <small className="ml-1 font-sans text-[14px] font-normal text-ink-3">%</small>
      </div>
      <span className="mt-2 mb-[5px] block h-1.5 overflow-hidden rounded-full bg-paper-3">
        <i className="block h-full rounded-full bg-ink" style={{ width: `${summary.accuracy}%` }} />
      </span>
      <span className="font-mono text-[12px] text-ink-3">
        est. {summary.estimatedRating} · {Math.round(summary.acpl)} acpl
      </span>
    </div>
  );
}
