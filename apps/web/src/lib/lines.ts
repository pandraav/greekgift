import { Chess } from 'chess.js';
import { playedMoveScore, positionScore } from '@greekgift/engine';
import type { Classification, EngineLine, MoveAnalysis, MoveClock, Score } from '@greekgift/engine';

/**
 * The engine's stored lines, read for the screen.
 *
 * A review keeps three lines for every position it analysed. These helpers
 * pick the right position for a ply, put the score into words a reader can
 * scan, and turn a UCI line into the notation people actually read.
 */

export interface LinesAt {
  fen: string;
  lines: EngineLine[];
  depth: number;
  nodes: number;
}

/** The stored lines for the position shown at `ply` (0 = start). */
export function linesAt(moves: MoveAnalysis[], ply: number): LinesAt | null {
  if (moves.length === 0) return null;
  const at = Math.max(0, Math.min(moves.length, ply));
  const evaluated = at === 0 ? moves[0]!.evalBefore : moves[at - 1]!.evalAfter;
  return {
    fen: evaluated.fen,
    lines: evaluated.lines,
    depth: evaluated.lines[0]?.depth ?? 0,
    nodes: evaluated.nodes,
  };
}

const MINUS = '−';

/** "+0.06", "−1.20", "0.00", "M3", "−M2" — always White's view. */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    return score.mate < 0 ? `${MINUS}M${Math.abs(score.mate)}` : `M${score.mate}`;
  }
  const cp = score.cp ?? 0;
  if (cp === 0) return '0.00';
  const pawns = (Math.abs(cp) / 100).toFixed(2);
  return cp > 0 ? `+${pawns}` : `${MINUS}${pawns}`;
}

const MAX_PLIES = 12;

/** A UCI line replayed into SAN; stops at the first move that does not apply. */
export function pvToSan(fen: string, pv: string[], limit = MAX_PLIES): string[] {
  const board = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv.slice(0, limit)) {
    try {
      sans.push(
        board.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci.length > 4 ? { promotion: uci[4] } : {}),
        }).san,
      );
    } catch {
      break;
    }
  }
  return sans;
}

/** "14. Rfe1 Qa6 15. h4" from White to move, "14... Qa6 15. h4" from Black. */
export function numberedLine(fen: string, sans: string[]): string {
  if (sans.length === 0) return '';
  const parts = fen.split(' ');
  let white = parts[1] !== 'b';
  let number = Number(parts[5] ?? '1') || 1;
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (white) out.push(`${number}. ${san}`);
    else if (i === 0) out.push(`${number}... ${san}`);
    else out.push(san);
    if (!white) number += 1;
    white = !white;
  });
  return out.join(' ');
}

export interface LineArrow {
  from: string;
  to: string;
  color: string;
}

/**
 * The engine's move and the played move, on the board they belong to. None
 * when the played move was the engine's choice — including a second line at
 * an equal score, which the review calls Best too.
 */
export function arrowsFor(played: MoveAnalysis | null, showBest: boolean): LineArrow[] {
  if (!played || !showBest || !played.bestMove || playedIsBest(played)) return [];
  return [
    { from: played.bestMove.slice(0, 2), to: played.bestMove.slice(2, 4), color: 'var(--felt)' },
    { from: played.uci.slice(0, 2), to: played.uci.slice(2, 4), color: 'var(--lacquer)' },
  ];
}

/* ── the played move, next to the engine's (engine-lines v2) ───────────── */

const BEST_CLASSES: ReadonlySet<Classification> = new Set(['best', 'great', 'brilliant']);

/** The played move was the engine's choice: its first line, or a class that says it tied it. */
export function playedIsBest(move: Pick<MoveAnalysis, 'uci' | 'bestMove' | 'classification'>): boolean {
  return move.uci === move.bestMove || BEST_CLASSES.has(move.classification);
}

/** White-view score of the move actually played (engine review.ts, §4.3). */
export const playedScore = playedMoveScore;

/** "10. Nf3" for White's move, "10… Ne5" for Black's. */
export function moveLabelOf(move: Pick<MoveAnalysis, 'ply' | 'color' | 'san'>): string {
  return `${Math.floor((move.ply - 1) / 2) + 1}${move.color === 'w' ? '.' : '…'} ${move.san}`;
}

export interface PlayedRow {
  san: string;
  /** "10… Ne5" */
  moveLabel: string;
  classification: Classification;
  /** The played move's own score, White's view. */
  score: Score;
  isBest: boolean;
  /** The engine's first line from the position before the move; null when none was stored. */
  best: { side: 'White' | 'Black'; score: Score; sans: string[]; fen: string } | null;
  /** Time spent and clock left, when the game has clocks. */
  clock: MoveClock | null;
}

/** The move that led to the position at `ply`, with the engine's choice beside it. Null at ply 0. */
export function playedRowAt(moves: MoveAnalysis[], ply: number): PlayedRow | null {
  if (ply < 1 || ply > moves.length) return null;
  const move = moves[ply - 1]!;
  const top = move.evalBefore.lines[0];
  const sans = top ? pvToSan(move.fenBefore, top.pv) : [];
  return {
    san: move.san,
    moveLabel: moveLabelOf(move),
    classification: move.classification,
    score: playedScore(move),
    isBest: playedIsBest(move),
    best:
      top && sans.length > 0
        ? { side: move.color === 'w' ? 'White' : 'Black', score: top.score, sans, fen: move.fenBefore }
        : null,
    clock: move.clock ?? null,
  };
}

/** "White mates in 3" | "Black mates in 2" | null. White-view score. */
export function mateCaption(score: Score): string | null {
  if (score.mate === undefined || score.mate === 0) return null;
  return `${score.mate > 0 ? 'White' : 'Black'} mates in ${Math.abs(score.mate)}`;
}

/** The number on the eval bar: "3.0", "0.4", "M3", "10+". No sign — the end it sits at says whose. */
export function barLabel(score: Score): string {
  if (score.mate !== undefined) return `M${Math.abs(score.mate)}`;
  const pawns = Math.abs(score.cp ?? 0) / 100;
  return pawns >= 10 ? '10+' : pawns.toFixed(1);
}

/** The position at `ply`: its best line's score, or what the board says when nothing was searched. */
export function scoreAt(moves: MoveAnalysis[], ply: number): Score {
  if (moves.length === 0) return { cp: 0 };
  const at = Math.max(0, Math.min(moves.length, ply));
  return positionScore(at === 0 ? moves[0]!.evalBefore : moves[at - 1]!.evalAfter);
}

/** White's win% at every position of the game — the graph and the bar. Mate at the end reads 100 or 0. */
export function scoresOf(moves: MoveAnalysis[]): Score[] {
  return Array.from({ length: moves.length + 1 }, (_, i) => scoreAt(moves, i));
}

/** How a game ended on the board, when it did: nothing to search from here. */
export function gameOverAt(fen: string): 'checkmate' | 'stalemate' | null {
  try {
    const board = new Chess(fen);
    if (board.isCheckmate()) return 'checkmate';
    if (board.isStalemate()) return 'stalemate';
  } catch {
    // An unreadable FEN is not a finished game; the caller shows no lines.
  }
  return null;
}
