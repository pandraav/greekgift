'use client';

import { Chess } from 'chess.js';
import { findPersona, type Persona } from '@greekgift/coach';
import type { Audience } from '@greekgift/db';
import type { PlayerSummary, PositionEval, Review, Score } from '@greekgift/engine';
import { gameReport, moveTimes, winPercent } from '@greekgift/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Board, type BoardArrow, type BoardMove } from '@/components/board/board';
import { CLASS_STYLE, MARKED_ON_GRAPH } from '@/components/classification';
import { analyseLive, useLiveLines } from '@/lib/engine/live';
import { arrowsFor, barLabel, moveLabelOf, numberedLine, scoresOf } from '@/lib/lines';
import { fenAfterAttempt, judgeAttempt, needsEngine } from '@/lib/retry';
import { Button, Card, CardBody, Eyebrow } from '@/components/ui';

import { CoachCard } from './coach-card';
import { EngineLines } from './engine-lines';
import { EvalGraph } from './eval-graph';
import { GameOverCard } from './game-over';
import { GameReport } from './game-report';
import { canRetry, KeyMomentsCard, walkMoments, type Walk, type WalkAction } from './key-moments';
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
 * board. The report comes first (chess.com's order); the key-moments walk
 * borrows the board to ask the reader for a better move.
 */

interface Line {
  /** The ply the reader branched from. */
  fromPly: number;
  sans: string[];
  fen: string;
}

type View = 'report' | 'moves';

/** Position identity for the stored-lines lookup: placement, side, castling, en passant. */
const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

const isWhiteAhead = (score: Score) =>
  score.mate !== undefined ? score.mate > 0 : (score.cp ?? 0) >= 0;

export function ReviewScreen({
  review,
  initialPersonaId,
  audience,
  userSide,
  initialView,
}: {
  review: Review;
  initialPersonaId: string;
  /** The reader's saved depth, from their profile. */
  audience: Audience;
  /** The member's side, from their linked accounts; null when they played neither. */
  userSide: 'w' | 'b' | null;
  initialView: View;
}) {
  const { moves } = review;
  const lastPly = moves.length;

  const [view, setView] = useState<View>(initialView);
  const [ply, setPly] = useState(0);
  const [showBest, setShowBest] = useState(true);
  // The member looks at the board from their own side.
  const [flipped, setFlipped] = useState(() => userSide === 'b');
  const [line, setLine] = useState<Line | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [persona, setPersona] = useState<Persona>(() => findPersona(initialPersonaId));
  const [picking, setPicking] = useState(false);

  const exploring = line !== null;

  const fenAt = useCallback(
    (at: number) => (at === 0 ? moves[0]!.fenBefore : moves[at - 1]!.fenAfter),
    [moves],
  );

  /** White-view score, then White's win%, at every position: the graph and the bar. Mate at the end reads 100 or 0. */
  const scores = useMemo(() => scoresOf(moves), [moves]);
  const winPercents = useMemo(() => scores.map((s) => winPercent(s)), [scores]);

  const report = useMemo(() => gameReport(review, userSide), [review, userSide]);
  // Per-move clock flags (time trouble, long thinks); null without clocks.
  const times = useMemo(() => moveTimes(review), [review]);
  const moments = useMemo(() => walkMoments(review.keyMoments), [review.keyMoments]);

  const marks = useMemo(
    () =>
      moves
        .filter((m) => MARKED_ON_GRAPH.has(m.classification))
        .map((m) => ({ ply: m.ply, color: CLASS_STYLE[m.classification].color })),
    [moves],
  );

  // Every position the review searched, so an explored line that comes back
  // into the game shows the stored lines rather than a second, shallower search.
  const storedByPosition = useMemo(() => {
    const map = new Map<string, PositionEval>();
    for (const m of moves) map.set(positionKey(m.fenBefore), m.evalBefore);
    const last = moves.at(-1);
    if (last && last.evalAfter.lines.length > 0) map.set(positionKey(last.fenAfter), last.evalAfter);
    return map;
  }, [moves]);
  const stored = useCallback(
    (fen: string) => {
      const hit = storedByPosition.get(positionKey(fen));
      return hit && hit.lines.length > 0 ? hit : undefined;
    },
    [storedByPosition],
  );

  const live = useLiveLines(exploring ? line.fen : null, stored);

  /* ── view ─────────────────────────────────────────────────────────── */

  const changeView = useCallback((next: View) => {
    setView(next);
    // The link says which view is open, so a reload or a shared URL lands
    // where the reader was. Report is the default and needs no parameter.
    try {
      const url = new URL(window.location.href);
      if (next === 'moves') url.searchParams.set('view', 'moves');
      else url.searchParams.delete('view');
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // A URL we cannot rewrite costs the bookmark, not the view.
    }
  }, []);

  /* ── the game, and the reader's own line ──────────────────────────── */

  const goTo = useCallback(
    (at: number) => {
      setWalk(null);
      setLine(null);
      setPly(Math.max(0, Math.min(lastPly, at)));
      if (view !== 'moves') changeView('moves');
    },
    [changeView, lastPly, view],
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

  /** Seeds the reader's line with `sans` from game ply `fromPly`. */
  const playLine = useCallback(
    (sans: string[], fromPly: number) => {
      const board = new Chess(fenAt(fromPly));
      const applied: string[] = [];
      for (const san of sans) {
        try {
          board.move(san);
          applied.push(san);
        } catch {
          break;
        }
      }
      if (applied.length === 0) return;
      setWalk(null);
      setPly(fromPly);
      setLine({ fromPly, sans: applied, fen: board.fen() });
    },
    [fenAt],
  );

  /** Appends `sans` to the reader's line (a live engine row). */
  const extendLine = useCallback((sans: string[]) => {
    setLine((current) => {
      if (!current) return current;
      const board = new Chess(current.fen);
      const applied: string[] = [];
      for (const san of sans) {
        try {
          board.move(san);
          applied.push(san);
        } catch {
          break;
        }
      }
      return applied.length === 0 ? current : { ...current, sans: [...current.sans, ...applied], fen: board.fen() };
    });
  }, []);

  /* ── the key-moments walk ─────────────────────────────────────────── */

  const moment = walk && walk.phase !== 'done' ? (moments[walk.index] ?? null) : null;
  const momentMove = moment ? (moves[moment.ply - 1] ?? null) : null;

  const startWalk = useCallback(
    (index: number) => {
      changeView('moves');
      setLine(null);
      if (index >= moments.length) {
        setWalk({ index: Math.max(0, moments.length - 1), phase: 'done', attempt: null });
        setPly(0);
        return;
      }
      const m = moments[index]!;
      const retry = canRetry(m, moves, userSide);
      setWalk({ index, phase: retry ? 'try' : 'view', attempt: null });
      setPly(retry ? m.ply - 1 : m.ply);
    },
    [changeView, moments, moves, userSide],
  );

  const onWalkAction = useCallback(
    (action: WalkAction) => {
      if (!walk) return;
      const m = moments[walk.index];
      switch (action) {
        case 'next':
          return startWalk(walk.phase === 'done' ? moments.length : walk.index + 1);
        case 'prev':
          return startWalk(Math.max(0, walk.index - 1));
        case 'again':
          if (!m) return;
          setWalk({ ...walk, phase: 'try', attempt: null });
          setPly(m.ply - 1);
          return;
        case 'reveal':
          if (!m) return;
          setWalk({ ...walk, phase: 'revealed', attempt: null });
          setPly(m.ply - 1);
          return;
        case 'play': {
          const move = m ? moves[m.ply - 1] : undefined;
          const best = move?.evalBefore.lines[0];
          if (!m || !move || !best) return;
          const board = new Chess(move.fenBefore);
          const sans: string[] = [];
          for (const uci of best.pv) {
            try {
              sans.push(board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
            } catch {
              break;
            }
          }
          playLine(sans, m.ply - 1);
          return;
        }
        case 'exit':
          setWalk(null);
          setPly(walk.phase === 'done' || !m ? 0 : m.ply);
          return;
        case 'report':
          setWalk(null);
          changeView('report');
          return;
        case 'restart':
          setWalk(null);
          setPly(0);
          return;
      }
    },
    [changeView, moments, moves, playLine, startWalk, walk],
  );

  // A retry outside the stored lines asks the live engine, and a reader who
  // walks on before it answers cancels it.
  // Keyed on the attempt's strings, not the object: a depth report replaces
  // the object, and must not restart the search it reports on.
  const checkingUci = walk?.phase === 'checking' ? (walk.attempt?.uci ?? null) : null;
  const checkingFen = walk?.phase === 'checking' ? (walk.attempt?.fen ?? null) : null;
  useEffect(() => {
    if (!checkingUci || !checkingFen || !momentMove) return;
    const controller = new AbortController();
    const uci = checkingUci;
    const fen = checkingFen;
    analyseLive(fen, {
      signal: controller.signal,
      onInfo: (_lines, depth) =>
        setWalk((w) => (w?.attempt?.uci === uci && w.phase === 'checking' ? { ...w, attempt: { ...w.attempt, depth } } : w)),
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const verdict = judgeAttempt(momentMove, uci, result);
        setWalk((w) =>
          w?.attempt?.uci === uci && w.phase === 'checking'
            ? { ...w, phase: 'result', attempt: { ...w.attempt, verdict, depth: result.lines[0]?.depth ?? w.attempt.depth } }
            : w,
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // No engine: judge on what the board says, rather than hang on "checking".
        const verdict = judgeAttempt(momentMove, uci, null);
        setWalk((w) =>
          w?.attempt?.uci === uci && w.phase === 'checking' ? { ...w, phase: 'result', attempt: { ...w.attempt, verdict } } : w,
        );
      });
    return () => controller.abort();
  }, [checkingFen, checkingUci, momentMove]);

  /* ── the board ────────────────────────────────────────────────────── */

  const attemptShown =
    walk && (walk.phase === 'checking' || walk.phase === 'result') ? walk.attempt : null;
  const fen = attemptShown ? attemptShown.fen : exploring ? line.fen : fenAt(ply);
  const played = ply > 0 ? (moves[ply - 1] ?? null) : null;
  const next = moves[ply];

  const onMove = useCallback(
    (move: BoardMove) => {
      const uci = move.from + move.to + (move.promotion ?? '');

      // At a key moment, a move is an answer, not a new line.
      if (walk) {
        if (walk.phase !== 'try' || !momentMove) return;
        const after = fenAfterAttempt(momentMove.fenBefore, uci);
        if (!after) return;
        const san = new Chess(momentMove.fenBefore).move(move).san;
        if (!needsEngine(momentMove, uci)) {
          setWalk({ ...walk, phase: 'result', attempt: { uci, san, fen: after, verdict: judgeAttempt(momentMove, uci, null), depth: 0 } });
        } else {
          setWalk({ ...walk, phase: 'checking', attempt: { uci, san, fen: after, verdict: null, depth: 0 } });
        }
        return;
      }

      const board = new Chess(fen);
      let san: string;
      try {
        san = board.move(move).san;
      } catch {
        return; // Not legal here; the board keeps its position.
      }

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
    [exploring, fen, momentMove, next, ply, walk],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (view !== 'moves') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (exploring) undoLine();
        else goTo(ply - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (!exploring) goTo(ply + 1);
      } else if (event.key === 'Escape') {
        if (walk) onWalkAction('exit');
        else if (exploring) backToGame();
      } else if (event.key === 'f' || event.key === 'F') {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToGame, exploring, goTo, onWalkAction, ply, undoLine, view, walk]);

  // The engine's move and the played move, on the board the badge is on. At a
  // key moment: nothing while the reader looks, their attempt once they have
  // moved, and both arrows when they ask for the answer.
  const arrows: BoardArrow[] = useMemo(() => {
    if (walk?.phase === 'try') return [];
    if (attemptShown) {
      return [{ from: attemptShown.uci.slice(0, 2), to: attemptShown.uci.slice(2, 4), color: 'var(--brass)' }];
    }
    if (walk?.phase === 'revealed') return arrowsFor(momentMove, true);
    return exploring ? [] : arrowsFor(played, showBest);
  }, [attemptShown, exploring, momentMove, played, showBest, walk?.phase]);

  const hideVerdict = walk !== null && walk.phase !== 'view' && walk.phase !== 'done';
  const badge =
    !exploring && !hideVerdict && played
      ? {
          square: played.uci.slice(2, 4),
          glyph: CLASS_STYLE[played.classification].glyph,
          color: CLASS_STYLE[played.classification].color,
        }
      : null;
  const lastMoveTo = attemptShown
    ? attemptShown.uci.slice(2, 4)
    : !exploring && played
      ? played.uci.slice(2, 4)
      : null;

  // The bar: the game position, or the live engine's first line once it has
  // one. White's share sits on White's side of the board.
  const liveScore = exploring ? live.lines[0]?.score : undefined;
  const barScore: Score = liveScore ?? scores[exploring ? line.fromPly : ply] ?? { cp: 0 };
  const barWin = liveScore ? winPercent(liveScore) : (winPercents[exploring ? line.fromPly : ply] ?? 50);
  const barIdle = exploring && !liveScore;
  const whiteAhead = isWhiteAhead(barScore);
  const numberAtBottom = whiteAhead !== flipped;

  const concealed = walk !== null && (walk.phase === 'try' || walk.phase === 'checking' || walk.phase === 'result');

  // The coach speaks about the moment once the reader has tried, never before.
  const coachHeld = walk !== null && (walk.phase === 'try' || walk.phase === 'checking');
  const coachMove =
    walk && momentMove && (walk.phase === 'result' || walk.phase === 'revealed') ? momentMove : played;

  // The game-over card replaces "just stopping" at the last ply.
  const atEnd = ply === lastPly && !exploring && !walk;

  const lineText = line ? numberedLine(fenAt(line.fromPly), line.sans) : '';

  return (
    <div>
      <div className="mb-4" role="group" aria-label="Review view">
        <div className="inline-flex overflow-hidden rounded-[var(--r)] border border-rule bg-paper">
          {(['report', 'moves'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                if (v === 'report') setWalk(null);
                changeView(v);
              }}
              className={`border-r border-rule px-4 py-[7px] text-[13px] last:border-r-0 ${
                view === v ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink-2 hover:bg-paper-2 hover:text-ink'
              }`}
            >
              {v === 'report' ? 'Report' : 'Moves'}
            </button>
          ))}
        </div>
      </div>

      {view === 'report' ? (
        <GameReport
          report={report}
          moves={moves}
          userSide={userSide}
          winPercents={winPercents}
          momentCount={moments.length}
          onStart={() => goTo(0)}
          onWalk={() => startWalk(0)}
          onGoTo={goTo}
        />
      ) : null}

      {/* On a phone the board comes first and the summaries follow it; the
          rail only becomes a rail once there is a column spare to put it in.
          Scroll anchoring is off: with the controls under the board, Chrome
          would otherwise move the page to keep them still and the board
          would jump. */}
      <div
        // Hidden, not unmounted: the coach keeps the notes it has read, and the
        // live engine keeps its place, while the reader looks at the report.
        style={view === 'moves' ? undefined : { display: 'none' }}
        className="flex flex-col gap-4 [overflow-anchor:none] lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start xl:grid-cols-[252px_minmax(0,1fr)_360px]"
      >
        <section className="order-3 flex flex-col gap-4 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 xl:row-span-1">
          <Card>
            <CardBody>
              <Eyebrow>Accuracy</Eyebrow>
              <div className="mt-3 flex flex-col gap-4">
                <AccuracyBlock summary={review.white} you={userSide === 'w'} />
                <AccuracyBlock summary={review.black} you={userSide === 'b'} />
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
          {/* The hint, the "your line" banner and the key-moments bar share one
              grid cell, and the ones not showing are invisible rather than
              gone: the slot is always as tall as the tallest, so leaving the
              game never moves the board. */}
          <div className="mb-3 grid w-full max-w-[600px] grid-cols-[minmax(0,1fr)] items-center *:col-start-1 *:row-start-1">
            <div
              className={`flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-lacquer/45 bg-lacquer/8 px-3.5 py-2.5 text-[14px] ${
                exploring && !walk ? '' : 'invisible'
              }`}
            >
              <b className="font-semibold">Your line</b>
              <span className="font-mono text-[12.5px] text-ink-2">
                from move {Math.floor((line?.fromPly ?? 0) / 2) + 1} — {line?.sans.length ?? 0} move
                {(line?.sans.length ?? 0) > 1 ? 's' : ''} in
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={backToGame}>
                Back to the game
              </Button>
            </div>

            <div
              className={`flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-brass/50 bg-brass/12 px-[13px] py-[9px] text-[14px] ${
                walk ? '' : 'invisible'
              }`}
            >
              <b className="font-semibold">Key moments</b>
              <span className="font-mono text-[12.5px] text-ink-2">
                {walk?.phase === 'done'
                  ? `all ${moments.length} seen`
                  : `${(walk?.index ?? 0) + 1} of ${moments.length}`}
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onWalkAction('exit')}>
                Exit
              </Button>
            </div>

            <div className={`flex flex-wrap items-center gap-3 ${exploring || walk ? 'invisible' : ''}`}>
              <p className="m-0 flex-1 text-center font-mono text-[13px] tracking-[0.02em] text-ink-3">
                drag a piece to play a different line
              </p>
              <Button variant="ghost" size="sm" onClick={() => startWalk(0)} disabled={moments.length === 0}>
                Key moments
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={showBest}
                onClick={() => setShowBest((s) => !s)}
              >
                {showBest ? 'Hide best move' : 'Show best move'}
              </Button>
            </div>
          </div>

          <div className="w-full max-w-[556px]">
            <div className="flex items-stretch gap-[9px]">
              <div
                className={`relative w-[18px] shrink-0 overflow-hidden rounded-[2px] bg-frame transition-opacity [box-shadow:inset_0_0_0_1px_rgba(0,0,0,.5),0_1px_3px_rgba(0,0,0,.3)] lg:w-[22px] ${
                  barIdle ? 'opacity-30' : ''
                }`}
                // The bar is the graph's current value, stood on its end.
                aria-hidden
              >
                <i
                  className={`absolute inset-x-0 bg-[#F4EEDD] transition-[height] duration-[120ms] ease-[cubic-bezier(.4,0,.2,1)] ${
                    flipped ? 'top-0' : 'bottom-0'
                  }`}
                  style={{ height: `${barWin}%` }}
                />
                <b className="absolute inset-x-0 top-1/2 h-px bg-lacquer opacity-85" />
                <span
                  className={`pointer-events-none absolute inset-x-0 z-[2] py-[5px] text-center font-mono text-[8px] leading-none font-semibold tracking-[-.02em] tabular-nums lg:text-[9.5px] ${
                    numberAtBottom ? 'bottom-0' : 'top-0'
                  } ${whiteAhead ? 'text-ink' : 'text-paper'}`}
                >
                  {barIdle ? '' : barLabel(barScore)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <Board
                  fen={fen}
                  flipped={flipped}
                  lastMoveTo={lastMoveTo}
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
              marks={marks}
            />
          </div>

          <div className="w-full max-w-[556px]">
            <EngineLines
              moves={moves}
              ply={ply}
              exploring={exploring ? { fen: line.fen, text: lineText } : null}
              live={live}
              concealed={concealed}
              playedInTrouble={times?.get(ply)?.inTrouble ?? false}
              onPlayLine={playLine}
              onExtendLine={extendLine}
            />
          </div>
        </section>

        <aside className="order-2 flex flex-col gap-4 lg:order-none lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
          {atEnd && review.ending ? (
            <GameOverCard
              ending={review.ending}
              moves={moves}
              userSide={userSide}
              names={{ w: review.white.username, b: review.black.username }}
              momentCount={moments.length}
              onReport={() => changeView('report')}
              onWalk={() => startWalk(0)}
            />
          ) : null}

          {walk ? (
            <KeyMomentsCard
              walk={walk}
              moments={moments}
              moves={moves}
              userSide={userSide}
              winPercents={winPercents}
              onAction={onWalkAction}
            />
          ) : null}

          <Card>
            <CardBody>
              <Eyebrow>Notation</Eyebrow>
              <div className="mt-3">
                <Notation
                  moves={moves}
                  ply={ply}
                  onSeek={goTo}
                  variation={line ? { fromPly: line.fromPly, sans: line.sans } : null}
                  timeFlags={times ?? undefined}
                  ending={review.ending ?? null}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            {/* The states share one grid cell, and the ones not showing are
                invisible rather than gone: the card is always as tall as the
                tallest, so stepping never changes its height, and the coach
                stays mounted with every note it has already read. */}
            <CardBody className="grid grid-cols-[minmax(0,1fr)] *:col-start-1 *:row-start-1">
              <div className={exploring ? '' : 'invisible'}>
                <Eyebrow>Your line</Eyebrow>
                <p className="mt-3 mb-3 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">
                  You are off the game. Play both sides for as long as you like — the
                  review keeps its place and nothing here is saved.
                </p>
                <p className="m-0 max-h-[120px] overflow-y-auto font-mono text-[14px]">
                  {line?.sans.join(' ')}
                </p>
              </div>

              <div className={!exploring && coachHeld ? '' : 'invisible'}>
                <Eyebrow>Coach</Eyebrow>
                <p className="mt-3 mb-0 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">
                  The coach&rsquo;s note on this moment waits until you have tried a move.
                </p>
              </div>

              <div className={!exploring && !coachHeld && coachMove ? '' : 'invisible'}>
                <CoachCard
                  gameId={review.gameId}
                  move={coachHeld ? null : coachMove}
                  persona={persona}
                  audience={audience}
                  perspective={userSide}
                  onChangePersona={() => setPicking(true)}
                />

                {/* The engine's own numbers, under the words rather than in
                    them: the coach may not quote a figure it was not given, so
                    this is where a reader checks it. A fixed grid, so a longer
                    label never wraps the row onto a second line. */}
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-rule pt-3.5 sm:grid-cols-4 xl:grid-cols-2">
                  <Fact k="Move" v={coachMove ? moveLabelOf(coachMove) : '—'} />
                  <Fact k="Class" v={coachMove ? CLASS_STYLE[coachMove.classification].label : '—'} />
                  <Fact k="Accuracy" v={coachMove ? coachMove.moveAccuracy.toFixed(1) : '—'} />
                  <Fact
                    k="Win % lost"
                    v={coachMove ? Math.max(0, coachMove.winBefore - coachMove.winAfter).toFixed(1) : '—'}
                  />
                </dl>
              </div>

              <div className={!exploring && !coachHeld && !coachMove ? '' : 'invisible'}>
                <Eyebrow>Starting position</Eyebrow>
                <p className="mt-3 mb-0 text-[15px] leading-relaxed text-ink-2">
                  Step forward, or drag a piece to try a line of your own.
                </p>
                {review.opening ? (
                  <p className="mt-2 mb-0 font-mono text-[12.5px] text-ink-3">
                    {review.opening.name}
                    {review.opening.lastBookPly > 0
                      ? ` · book through move ${Math.ceil(review.opening.lastBookPly / 2)}`
                      : ''}
                  </p>
                ) : null}
              </div>
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
      </div>

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
      <dd className="m-0 truncate font-mono text-[16px] font-semibold">{v}</dd>
    </div>
  );
}

function AccuracyBlock({ summary, you }: { summary: PlayerSummary; you: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[14px] font-semibold">
          {summary.username}
          {you ? <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-3">you</span> : null}
        </span>
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
