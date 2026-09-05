'use client';

import { Chess } from 'chess.js';
import { findPersona, type Persona } from '@greekgift/coach';
import type { PlayerSummary, Review } from '@greekgift/engine';
import { winPercent } from '@greekgift/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Board, type BoardArrow, type BoardMove } from '@/components/board/board';
import { CLASS_STYLE, WORTH_AN_ARROW } from '@/components/classification';
import { Button, Card, CardBody, Eyebrow } from '@/components/ui';

import { CoachCard } from './coach-card';
import { EvalGraph } from './eval-graph';
import { PersonaPicker } from './persona-picker';
import { Notation } from './notation';
import { Tally } from './tally';

/**
 * The review.
 *
 * Everything on this screen answers one of two questions: what happened, and
 * what should have happened. The board and the graph are the same story at
 * two zoom levels, and the reader can leave the game at any point by simply
 * moving a piece — which is why the position lives here rather than in the
 * board.
 */

interface Line {
  /** The ply the reader branched from. */
  fromPly: number;
  sans: string[];
  fen: string;
}

export function ReviewScreen({
  review,
  initialPersonaId,
}: {
  review: Review;
  initialPersonaId: string;
}) {
  const { moves } = review;
  const lastPly = moves.length;

  const [ply, setPly] = useState(() => review.keyMoments[0]?.ply ?? 0);
  const [flipped, setFlipped] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [persona, setPersona] = useState<Persona>(() => findPersona(initialPersonaId));
  const [picking, setPicking] = useState(false);

  const exploring = line !== null;

  const fenAt = useCallback(
    (at: number) => (at === 0 ? moves[0]!.fenBefore : moves[at - 1]!.fenAfter),
    [moves],
  );

  const fen = exploring ? line.fen : fenAt(ply);
  const played = ply > 0 ? moves[ply - 1] : null;
  const next = moves[ply];

  /** White's chances at every position — the graph, and the bar beside the board. */
  const winPercents = useMemo(() => {
    const scoreOf = (i: number) =>
      i === moves.length
        ? moves[i - 1]!.evalAfter.lines[0]?.score
        : moves[i]!.evalBefore.lines[0]?.score;
    return Array.from({ length: moves.length + 1 }, (_, i) =>
      winPercent(scoreOf(i) ?? { cp: 0 }),
    );
  }, [moves]);

  const goTo = useCallback(
    (at: number) => {
      setLine(null);
      setPly(Math.max(0, Math.min(lastPly, at)));
    },
    [lastPly],
  );

  const backToGame = useCallback(() => {
    if (line) setPly(line.fromPly);
    setLine(null);
  }, [line]);

  const undoLine = useCallback(() => {
    setLine((current) => {
      if (!current) return null;
      if (current.sans.length <= 1) return null;
      const board = new Chess(fenAt(current.fromPly));
      for (const san of current.sans.slice(0, -1)) board.move(san);
      return { ...current, sans: current.sans.slice(0, -1), fen: board.fen() };
    });
  }, [fenAt]);

  const onMove = useCallback(
    (move: BoardMove) => {
      const board = new Chess(fen);
      let san: string;
      try {
        san = board.move(move).san;
      } catch {
        return; // Not legal here; the board keeps its position.
      }

      const uci = move.from + move.to + (move.promotion ?? '');

      // Playing the move that was actually played just steps forward — the
      // reader following the game with their hands should not be told they
      // have left it.
      if (!exploring && next && next.uci === uci) {
        setPly(ply + 1);
        return;
      }

      setLine((current) =>
        current
          ? { ...current, sans: [...current.sans, san], fen: board.fen() }
          : { fromPly: ply, sans: [san], fen: board.fen() },
      );
    },
    [exploring, fen, next, ply],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (exploring) undoLine();
        else goTo(ply - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (!exploring) goTo(ply + 1);
      } else if (event.key === 'Escape' && exploring) {
        backToGame();
      } else if (event.key === 'f' || event.key === 'F') {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToGame, exploring, goTo, ply, undoLine]);

  const arrows: BoardArrow[] = useMemo(() => {
    // Arrows describe the move about to be played, not the one just made:
    // the recommendation only exists on the board it was recommended for.
    // Drawing it a ply later would point at a square the piece has left.
    if (exploring || !next || !WORTH_AN_ARROW.has(next.classification)) return [];
    if (!next.bestMove || next.bestMove === next.uci) return [];

    return [
      { from: next.bestMove.slice(0, 2), to: next.bestMove.slice(2, 4), color: 'var(--felt)' },
      { from: next.uci.slice(0, 2), to: next.uci.slice(2, 4), color: 'var(--lacquer)' },
    ];
  }, [exploring, next]);

  const badge =
    !exploring && played
      ? {
          square: played.uci.slice(2, 4),
          glyph: CLASS_STYLE[played.classification].glyph,
          color: CLASS_STYLE[played.classification].color,
        }
      : null;

  const barWin = winPercents[exploring ? line.fromPly : ply] ?? 50;

  return (
    // On a phone the board comes first and the summaries follow it; the rail
    // only becomes a rail once there is a column spare to put it in.
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start xl:grid-cols-[252px_minmax(0,1fr)_360px]">
      <section className="order-3 flex flex-col gap-4 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 xl:row-span-1">
        <Card>
          <CardBody>
            <Eyebrow>Accuracy</Eyebrow>
            <div className="mt-3 flex flex-col gap-4">
              <AccuracyBlock summary={review.white} />
              <AccuracyBlock summary={review.black} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Eyebrow>Moves</Eyebrow>
            <div className="mt-3">
              <Tally white={review.white} black={review.black} />
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="order-1 flex flex-col items-center rounded-[var(--r-lg)] border border-rule bg-paper p-3 sm:p-4 lg:order-none lg:col-start-2 lg:row-start-1">
        {exploring ? (
          <div className="mb-3 flex w-full max-w-[600px] flex-wrap items-center gap-3 rounded-[var(--r)] border border-lacquer/45 bg-lacquer/8 px-3.5 py-2.5 text-[14px]">
            <b className="font-semibold">Your line</b>
            <span className="font-mono text-[12.5px] text-ink-2">
              from move {Math.floor(line.fromPly / 2) + 1} — {line.sans.length} move
              {line.sans.length > 1 ? 's' : ''} in
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={backToGame}>
              Back to the game
            </Button>
          </div>
        ) : (
          <p className="mb-3 w-full max-w-[600px] text-center font-mono text-[13px] tracking-[0.02em] text-ink-3">
            drag a piece to play a different line
          </p>
        )}

        <div className="w-full max-w-[556px]">
          <div className="flex items-stretch gap-[9px]">
            <div
              className={`relative w-[15px] shrink-0 overflow-hidden rounded-[2px] bg-frame transition-opacity [box-shadow:inset_0_0_0_1px_rgba(0,0,0,.5),0_1px_3px_rgba(0,0,0,.3)] ${
                exploring ? 'opacity-30' : ''
              }`}
              // The bar is the graph's current value, stood on its end.
              aria-hidden
            >
              <i
                className="absolute inset-x-0 bottom-0 bg-[#F4EEDD] transition-[height] duration-[400ms] ease-[cubic-bezier(.4,0,.2,1)]"
                style={{ height: `${barWin}%` }}
              />
              <b className="absolute inset-x-0 top-1/2 h-px bg-lacquer opacity-85" />
            </div>

            <div className="min-w-0 flex-1">
              <Board
                fen={fen}
                flipped={flipped}
                lastMoveTo={!exploring && played ? played.uci.slice(2, 4) : null}
                badge={badge}
                arrows={arrows}
                onMove={onMove}
              />
            </div>
          </div>
        </div>

        <div className="w-full max-w-[556px]">
          <EvalGraph
            winPercents={winPercents}
            ply={exploring ? line.fromPly : ply}
            onSeek={goTo}
            idle={exploring}
          />
        </div>
      </section>

      <aside className="order-2 flex flex-col gap-4 lg:order-none lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
        <Card>
          <CardBody>
            <Eyebrow>Notation</Eyebrow>
            <div className="mt-3">
              <Notation
                moves={moves}
                ply={ply}
                onSeek={goTo}
                variation={line ? { fromPly: line.fromPly, sans: line.sans } : null}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            {exploring ? (
              <>
                <Eyebrow>Your line</Eyebrow>
                <p className="mt-3 mb-3 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">
                  You are off the game. Play both sides for as long as you like — the
                  review keeps its place and nothing here is saved.
                </p>
                <p className="m-0 font-mono text-[14px]">{line.sans.join(' ')}</p>
              </>
            ) : played ? (
              <>
                <CoachCard
                  gameId={review.gameId}
                  move={played}
                  persona={persona}
                  onChangePersona={() => setPicking(true)}
                />

                {/* The engine's own numbers, under the words rather than in
                    them: the coach may not quote a figure it was not given, so
                    this is where a reader checks it. */}
                <dl className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-rule pt-3.5">
                  <Fact k="Move" v={`${Math.floor((ply - 1) / 2) + 1}${played.color === 'w' ? '.' : '…'} ${played.san}`} />
                  <Fact k="Class" v={CLASS_STYLE[played.classification].label} />
                  <Fact k="Accuracy" v={played.moveAccuracy.toFixed(1)} />
                  <Fact
                    k="Win % lost"
                    v={Math.max(0, played.winBefore - played.winAfter).toFixed(1)}
                  />
                  {WORTH_AN_ARROW.has(played.classification) &&
                  played.bestMove &&
                  played.bestMove !== played.uci ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => goTo(ply - 1)}
                    >
                      Show it on the board
                    </Button>
                  ) : null}
                </dl>
              </>
            ) : (
              <>
                <Eyebrow>Starting position</Eyebrow>
                <p className="mt-3 mb-0 text-[15px] leading-relaxed text-ink-2">
                  Step forward, or drag a piece to try a line of your own.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-[13px_15px]">
            <div className="flex gap-1.5">
              <NavButton label="First move" onClick={() => goTo(0)}>
                &#9198;
              </NavButton>
              <NavButton
                label="Previous move"
                onClick={() => (exploring ? undoLine() : goTo(ply - 1))}
              >
                &#9664;
              </NavButton>
              <NavButton
                label="Next move"
                primary
                onClick={() => !exploring && goTo(ply + 1)}
              >
                &#9654;
              </NavButton>
              <NavButton label="Last move" onClick={() => goTo(lastPly)}>
                &#9197;
              </NavButton>
              <NavButton label="Flip board" onClick={() => setFlipped((f) => !f)}>
                &#8645;
              </NavButton>
            </div>
          </CardBody>
        </Card>
      </aside>

      <PersonaPicker
        open={picking}
        current={persona}
        onPick={(chosen) => {
          setPersona(chosen);
          setPicking(false);
          // Remembered for next time, but never blocking: a failed save costs
          // the preference, not the review being read right now.
          void fetch('/api/me/profile', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ personaId: chosen.id }),
          }).catch(() => undefined);
        }}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">{k}</dt>
      <dd className="m-0 font-mono text-[16px] font-semibold">{v}</dd>
    </div>
  );
}

function AccuracyBlock({ summary }: { summary: PlayerSummary }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-semibold">{summary.username}</span>
        <span className="font-display text-[22px] font-semibold tabular-nums">
          {summary.accuracy.toFixed(1)}
          <small className="text-[13px] font-normal text-ink-3">%</small>
        </span>
      </div>
      <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-paper-3">
        <i
          className="block h-full rounded-full bg-brass"
          style={{ width: `${summary.accuracy}%` }}
        />
      </span>
      <p className="mt-1.5 mb-0 font-mono text-[11.5px] text-ink-3">
        est. {summary.estimatedRating} ±{summary.estimatedRatingBand} ·{' '}
        {Math.round(summary.acpl)} acpl
      </p>
    </div>
  );
}

function NavButton({
  label,
  primary = false,
  onClick,
  children,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-[var(--r)] border py-2.5 text-[14px] ${
        primary
          ? 'flex-[1.6] border-black bg-ink text-paper hover:bg-black'
          : 'flex-1 border-rule bg-paper-2 text-ink-2 hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
