'use client';

import type { Classification, KeyMoment, MoveAnalysis } from '@greekgift/engine';

import { CLASS_STYLE } from '@/components/classification';
import { Button, Card, CardBody, Eyebrow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatScore, moveLabelOf, numberedLine, playedScore as playedScoreOf, pvToSan } from '@/lib/lines';
import type { RetryVerdict } from '@/lib/retry';

/**
 * The key moments, one at a time (design §9).
 *
 * At the member's own errors the card asks for a better move and judges the
 * attempt; at the opponent's errors, and at great or brilliant moves, it only
 * shows the moment. The walk itself — which moment, which phase — lives in
 * ReviewScreen, because it also decides what the board shows.
 */

export type WalkPhase = 'try' | 'checking' | 'result' | 'revealed' | 'view' | 'done';

export interface Walk {
  /** Into the ply-sorted moments. */
  index: number;
  phase: WalkPhase;
  attempt: {
    uci: string;
    san: string;
    /** The position after the attempt. */
    fen: string;
    verdict: RetryVerdict | null;
    depth: number;
  } | null;
}

export type WalkAction = 'next' | 'prev' | 'again' | 'reveal' | 'play' | 'exit' | 'report' | 'restart';

const ERRORS: ReadonlySet<KeyMoment['kind']> = new Set(['blunder', 'mistake', 'miss']);

/** The walk's moments: every key moment but leaving the book, in move order. */
export function walkMoments(keyMoments: KeyMoment[]): KeyMoment[] {
  return keyMoments.filter((m) => m.kind !== 'left_book').sort((a, b) => a.ply - b.ply);
}

/** Retry is offered at an error by the member, or at every error when the member played neither side. */
export function canRetry(moment: KeyMoment, moves: MoveAnalysis[], userSide: 'w' | 'b' | null): boolean {
  if (!ERRORS.has(moment.kind)) return false;
  return userSide === null || moves[moment.ply - 1]?.color === userSide;
}

const classOf = (kind: KeyMoment['kind']): Classification => (kind === 'left_book' ? 'book' : kind);

export function KeyMomentsCard({
  walk,
  moments,
  moves,
  userSide,
  winPercents,
  onAction,
}: {
  walk: Walk;
  moments: KeyMoment[];
  moves: MoveAnalysis[];
  userSide: 'w' | 'b' | null;
  /** White's win% at every position. */
  winPercents: number[];
  onAction: (action: WalkAction) => void;
}) {
  const done = walk.phase === 'done';
  const moment = moments[walk.index];
  const cls = moment ? classOf(moment.kind) : 'best';
  const style = CLASS_STYLE[cls];
  const accent = done || !moment ? 'var(--felt)' : style.color;

  const dots = (
    <span className="flex gap-[3px]" aria-hidden>
      {moments.map((m, j) => (
        <i
          key={m.ply}
          className={cn(
            'h-[7px] w-[7px] rounded-full',
            j === walk.index && !done
              ? 'shadow-[0_0_0_2px_rgba(190,143,62,.25)]'
              : j < walk.index || done
                ? 'bg-ink-3'
                : 'bg-paper-3',
          )}
          style={j === walk.index && !done ? { background: accent } : undefined}
        />
      ))}
    </span>
  );

  const head = (label: string) => (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <Eyebrow>{label}</Eyebrow>
      {dots}
    </div>
  );

  let body: React.ReactNode;
  if (done || !moment) {
    const retries = moments.filter((m) => canRetry(m, moves, userSide)).length;
    body = (
      <>
        {head('Key moments')}
        <h3 className={TITLE}>That was every key moment.</h3>
        <p className={ASK}>
          {moments.length} moment{moments.length === 1 ? '' : 's'}, {retries} of them yours to retry.
        </p>
        <div className={ACTS}>
          <Button variant="brass" onClick={() => onAction('report')}>
            Back to the report
          </Button>
          <Button variant="ghost" onClick={() => onAction('restart')}>
            Review from the start
          </Button>
        </div>
      </>
    );
  } else {
    const move = moves[moment.ply - 1]!;
    const label = moveLabelOf(move);
    const mine = userSide !== null && move.color === userSide;
    const side = move.color === 'w' ? 'White' : 'Black';
    const noun = style.label.toLowerCase();
    const praise = !ERRORS.has(moment.kind);
    const verb = praise
      ? `was ${noun}`
      : userSide !== null && !mine
        ? `was your opponent's ${noun}`
        : `was ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
    const number = `${Math.floor((move.ply - 1) / 2) + 1}${move.color === 'w' ? '.' : '…'} `;

    const best = move.evalBefore.lines[0];
    const bestSans = best ? pvToSan(move.fenBefore, best.pv) : [];

    const next = (
      <Button variant="brass" onClick={() => onAction('next')}>
        Next moment
      </Button>
    );

    let main: React.ReactNode = null;
    let acts: React.ReactNode = null;

    if (walk.phase === 'view') {
      // The member's winning chances, before and after the opponent's error.
      const before = winPercents[moment.ply - 1] ?? 50;
      const after = winPercents[moment.ply] ?? 50;
      const [a, b] = userSide === 'b' ? [100 - before, 100 - after] : [before, after];
      main = (
        <p className={ASK}>
          {label} {verb}.
          {!mine && !praise && userSide !== null
            ? ` It handed you a chance: your winning chances went from ${Math.round(a)}% to ${Math.round(b)}%.`
            : null}
        </p>
      );
      acts = (
        <>
          {next}
          <Button variant="ghost" onClick={() => onAction('prev')} disabled={walk.index === 0}>
            Previous
          </Button>
        </>
      );
    } else if (walk.phase === 'try' || walk.phase === 'checking') {
      main = (
        <>
          <p className={ASK}>
            {label} {verb}. Find a better move for {side}.
          </p>
          {walk.phase === 'try' ? (
            <p className="mt-2 mb-0 font-mono text-[12px] text-ink-3">Drag a piece on the board.</p>
          ) : (
            <Verdict tone="quiet" icon="…">
              Checking <b className="font-mono">{number + (walk.attempt?.san ?? '')}</b> · depth{' '}
              {walk.attempt?.depth ?? 0}
            </Verdict>
          )}
        </>
      );
      acts =
        walk.phase === 'try' ? (
          <>
            <Button variant="ghost" onClick={() => onAction('reveal')}>
              Show the answer
            </Button>
            <Button variant="ghost" onClick={() => onAction('next')}>
              Skip
            </Button>
          </>
        ) : null;
    } else if (walk.phase === 'result' && walk.attempt?.verdict) {
      const v = walk.attempt.verdict;
      const attempt = <b className="font-mono">{number + walk.attempt.san}</b>;
      const played = <b className="font-mono">{label}</b>;
      const playedScore = formatScore(playedScoreOf(move));
      main = (
        <>
          <p className={ASK}>
            {label} {verb}.
          </p>
          {v.isBest ? (
            <Verdict tone="felt" icon="✓">
              {attempt} is the engine&rsquo;s move.
            </Verdict>
          ) : v.versusPlayed === 'better' ? (
            <Verdict tone="brass" icon="↑">
              {attempt} is better than {played}: {formatScore(v.score)} instead of {playedScore}. The engine
              found better still.
            </Verdict>
          ) : v.versusPlayed === 'same' ? (
            <Verdict tone="quiet" icon="=">
              About the same as {played}.
            </Verdict>
          ) : (
            <Verdict tone="lacquer" icon="↓">
              {attempt} is worse than {played}: {formatScore(v.score)}.
            </Verdict>
          )}
        </>
      );
      acts = v.isBest ? (
        <>
          {next}
          <Button variant="ghost" onClick={() => onAction('reveal')}>
            See the line
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => onAction('again')}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => onAction('reveal')}>
            Show the answer
          </Button>
          {next}
        </>
      );
    } else if (walk.phase === 'revealed') {
      main = (
        <>
          <p className={ASK}>
            The engine plays <b className="font-mono">{number + (bestSans[0] ?? '—')}</b>
            {best ? ` (${formatScore(best.score)})` : ''}.
          </p>
          {bestSans.length > 0 ? (
            <p className="mt-2 mb-0 font-mono text-[13px] leading-[1.55] text-ink-2">
              {numberedLine(move.fenBefore, bestSans)}
            </p>
          ) : null}
        </>
      );
      acts = (
        <>
          <Button variant="ghost" onClick={() => onAction('play')} disabled={bestSans.length === 0}>
            Play it
          </Button>
          {next}
        </>
      );
    }

    body = (
      <>
        {head(`Key moment ${walk.index + 1} of ${moments.length}`)}
        <h3 className={TITLE}>
          <span className="font-mono text-[17px]">{label}</span>
          <i
            aria-hidden
            className="inline-grid h-[22px] w-[22px] place-items-center rounded-[4px] font-mono text-[11px] leading-none font-bold text-white not-italic"
            style={{ background: style.color }}
            dangerouslySetInnerHTML={{ __html: style.glyph }}
          />
        </h3>
        {main}
        {acts ? <div className={ACTS}>{acts}</div> : null}
      </>
    );
  }

  return (
    <Card className="border-t-[3px]" style={{ borderTopColor: accent }}>
      <CardBody className="px-5 py-[18px]">{body}</CardBody>
    </Card>
  );
}

const TONES = {
  felt: 'border-felt/40 bg-felt/10 text-[#23472F]',
  brass: 'border-brass/45 bg-brass/12 text-[#5E4415]',
  lacquer: 'border-lacquer/40 bg-lacquer/9 text-[#7A2018]',
  quiet: 'border-rule bg-paper-2 text-ink-2',
} as const;

function Verdict({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mt-3.5 flex gap-3 rounded-[3px] border px-[15px] py-[13px] text-[14px] leading-normal',
        TONES[tone],
      )}
    >
      <span className="flex-none font-mono font-bold">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

const TITLE =
  'm-0 mb-1.5 flex flex-wrap items-center gap-[9px] font-display text-[20px] leading-[1.2] font-semibold tracking-[-.01em]';
const ASK = 'm-0 text-[15px] leading-[1.55] text-ink-2';
const ACTS = 'mt-4 flex flex-wrap gap-2';
