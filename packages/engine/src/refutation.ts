import { Chess, type Move, type Square } from 'chess.js';

import { discoveredAttack } from './detect/discovered.ts';
import { skewers } from './detect/skewer.ts';
import { attackersOf, forkBy, pieceRef, pinsAgainst, VALUE } from './motifs.ts';
import type {
  BetterLine,
  Color,
  MoveAnalysis,
  PieceRef,
  Refutation,
  RefutationTactic,
  Review,
} from './types.ts';

/**
 * Why a move was an error, and what was better (review-overhaul design §13.1).
 *
 * The refutation is the engine's own reply line after the played move, cut
 * where its material outcome settles, with the tactic its first move creates
 * when a detector finds one. The better line is the engine's best line before
 * the move, with its score. Both come from stored lines only: nothing here
 * searches.
 */

const ERRORS = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);
const MAX_PLIES = 4;

const upper = (type: string) => type.toUpperCase() as PieceRef['piece'];

function play(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] } : {}),
    });
  } catch {
    return null;
  }
}

/** The move number of the ply after `ply` (plies count from 1: ply 1 is 1.White). */
const moveNumberOf = (ply: number): number => Math.ceil(ply / 2);

/**
 * How many plies of the reply line explain the loss: through the first
 * capture by the opponent, plus the mover's recapture on that square if it
 * comes next; with no capture in reach, the first two plies.
 */
export function stretchOf(moves: Move[]): number {
  const limit = Math.min(moves.length, MAX_PLIES);
  for (let i = 0; i < limit; i += 2) {
    const m = moves[i]!;
    if (!m.captured) continue;
    const next = moves[i + 1];
    if (next && next.captured && next.to === m.to && i + 2 <= MAX_PLIES) return i + 2;
    return i + 1;
  }
  return Math.min(moves.length, 2);
}

const coords = (sq: string): [number, number] => [sq.charCodeAt(0) - 97, Number(sq[1]) - 1];

/** Is `mid` strictly between `from` and `to` on one rank, file or diagonal? */
export function between(from: string, mid: string, to: string): boolean {
  const [fx, fy] = coords(from);
  const [mx, my] = coords(mid);
  const [tx, ty] = coords(to);
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  const straight = fx === tx || fy === ty || Math.abs(tx - fx) === Math.abs(ty - fy);
  if (!straight || (dx === 0 && dy === 0)) return false;
  for (let x = fx + dx, y = fy + dy; x !== tx || y !== ty; x += dx, y += dy) {
    if (x === mx && y === my) return true;
  }
  return false;
}

/** The tactic the reply's first move creates, from the position after it. */
export function tacticOf(
  fenBefore: string,
  first: Move,
  mover: Color,
  mateAgainstMover: number | undefined,
): RefutationTactic | undefined {
  if (mateAgainstMover !== undefined) return { type: 'mate', mateIn: mateAgainstMover };
  const after = first.after;
  const landed = first.to as Square;

  // The pinned piece must stand between the pinner and what it shields, on
  // one line; absolute pins first, then the most valuable piece behind.
  const pin = pinsAgainst(after, mover)
    .filter(
      (m) =>
        m.type === 'pin' &&
        m.pinner.square === landed &&
        between(m.pinner.square, m.pinned.square, m.against.square),
    )
    .sort((a, b) =>
      a.type === 'pin' && b.type === 'pin'
        ? Number(b.absolute) - Number(a.absolute) ||
          (VALUE[b.against.piece.toLowerCase()] ?? 0) - (VALUE[a.against.piece.toLowerCase()] ?? 0)
        : 0,
    )[0];
  if (pin && pin.type === 'pin') {
    return {
      type: 'pin',
      pinned: pin.pinned,
      pinner: pin.pinner,
      against: pin.against,
      absolute: pin.absolute,
    };
  }

  const skewer = skewers(after, mover).find((m) => m.type === 'skewer' && m.by.square === landed);
  if (skewer && skewer.type === 'skewer') {
    return { type: 'skewer', front: skewer.front, behind: skewer.behind, by: skewer.by };
  }

  const fork = forkBy(after, landed, false);
  if (fork && fork.type === 'fork') return { type: 'fork', by: fork.by, targets: fork.targets };

  const discovered = discoveredAttack(fenBefore, `${first.from}${first.to}${first.promotion ?? ''}`);
  if (discovered && discovered.type === 'discovered_attack') {
    return {
      type: 'discovered_attack',
      mover: discovered.mover,
      attacker: discovered.attacker,
      target: discovered.target,
      check: discovered.check,
    };
  }

  if (first.captured) {
    const target: PieceRef = { piece: upper(first.captured), square: first.to, color: mover };
    const defenders = attackersOf(new Chess(fenBefore), first.to as Square, mover);
    return { type: 'capture', target, undefended: defenders.length === 0 };
  }

  if (new Chess(after).inCheck()) return { type: 'check' };
  return undefined;
}

/** The opponent's best reply to an error, or undefined for any other move. */
export function refutationFor(review: Review, move: MoveAnalysis): Refutation | undefined {
  if (!ERRORS.has(move.classification)) return undefined;
  const reply = move.evalAfter.lines[0];
  if (!reply || reply.pv.length === 0) return undefined;

  const chess = new Chess(move.fenAfter);
  const moves: Move[] = [];
  for (const uci of reply.pv.slice(0, MAX_PLIES)) {
    const m = play(chess, uci);
    if (!m) break;
    moves.push(m);
  }
  if (moves.length === 0) return undefined;

  const n = stretchOf(moves);
  const stretch = moves.slice(0, n);

  // The played move's own capture counts: 23…Rxd5 won a pawn before the rook went.
  const gained: PieceRef['piece'][] = [];
  const lost: PieceRef['piece'][] = [];
  const own = play(new Chess(move.fenBefore), move.uci);
  if (own?.captured) gained.push(upper(own.captured));
  for (const m of stretch) {
    if (!m.captured) continue;
    (m.color === move.color ? gained : lost).push(upper(m.captured));
  }
  const worth = (ps: PieceRef['piece'][]) => ps.reduce((t, p) => t + (VALUE[p.toLowerCase()] ?? 0), 0);

  const mate = reply.score.mate;
  const mateAgainstMover =
    mate !== undefined && (move.color === 'w' ? mate < 0 : mate > 0) ? Math.abs(mate) : undefined;

  const next = review.moves.find((m) => m.ply === move.ply + 1);
  const tactic = tacticOf(move.fenAfter, moves[0]!, move.color, mateAgainstMover);

  return {
    line: stretch.map((m) => m.san),
    moveNumber: moveNumberOf(move.ply + 1),
    ...(tactic ? { tactic } : {}),
    gained,
    lost,
    net: worth(gained) - worth(lost),
    ...(next ? { actual: next.san } : {}),
  };
}

/** The best move before an error, with a short line and its score. */
export function betterLineFor(move: MoveAnalysis): BetterLine | undefined {
  if (!ERRORS.has(move.classification)) return undefined;
  const best = move.evalBefore.lines[0];
  if (!best || best.pv.length === 0) return undefined;
  const chess = new Chess(move.fenBefore);
  const line: string[] = [];
  for (const uci of best.pv.slice(0, 3)) {
    const m = play(chess, uci);
    if (!m) break;
    line.push(m.san);
  }
  if (line.length === 0) return undefined;
  return { line, moveNumber: moveNumberOf(move.ply), score: best.score };
}

/**
 * Whether the engine's reply takes the piece on `square` at once. A piece the
 * engine does not take is not "hanging", whatever a static count says
 * (23…Rxd5: 24.exd5 would have dropped the queen on c2 to the bishop on g6).
 */
export function replyTakes(move: MoveAnalysis, square: string): boolean {
  const first = move.evalAfter.lines[0]?.pv[0];
  if (!first) return true;
  return first.slice(2, 4) === square && pieceRef(new Chess(move.fenAfter), square as Square) !== null;
}
