import { Chess } from 'chess.js';
import type { EngineLine, MoveAnalysis, Score } from '@greekgift/engine';

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

/** The engine's move and the played move, on the board they belong to. */
export function arrowsFor(played: MoveAnalysis | null, showBest: boolean): LineArrow[] {
  if (!played || !showBest || !played.bestMove || played.bestMove === played.uci) return [];
  return [
    { from: played.bestMove.slice(0, 2), to: played.bestMove.slice(2, 4), color: 'var(--felt)' },
    { from: played.uci.slice(0, 2), to: played.uci.slice(2, 4), color: 'var(--lacquer)' },
  ];
}
