import { Chess } from 'chess.js';

import type { ParsedGame, PgnHeaders } from './pgn.ts';
import { fromMoverView } from './scoring.ts';
import type { Color, GameEnding, Review, Score, TerminationKind, Verdict } from './types.ts';

/**
 * How a game ended, and what the board said at that moment
 * (review-overhaul design §14.3).
 */

export interface ResultCodes {
  /** chess.com's per-side result codes: win, checkmated, resigned, timeout, … */
  white: string;
  black: string;
}

/** chess.com result codes, in the order they are checked (§14.3). */
const CODES: [code: string, kind: TerminationKind][] = [
  ['checkmated', 'checkmate'],
  ['resigned', 'resignation'],
  ['timevsinsufficient', 'timeout_vs_insufficient'],
  ['timeout', 'timeout'],
  ['abandoned', 'abandoned'],
  ['agreed', 'agreement'],
  ['repetition', 'repetition'],
  ['stalemate', 'stalemate'],
  ['insufficient', 'insufficient'],
  ['50move', 'fifty_move'],
];

/** chess.com's Termination header prose, first match wins. */
const PROSE: [RegExp, TerminationKind][] = [
  [/won by checkmate/i, 'checkmate'],
  [/won by resignation/i, 'resignation'],
  [/won on time/i, 'timeout'],
  [/won - game abandoned/i, 'abandoned'],
  [/drawn by agreement/i, 'agreement'],
  [/by repetition/i, 'repetition'],
  [/by stalemate/i, 'stalemate'],
  [/by timeout vs insufficient material/i, 'timeout_vs_insufficient'],
  [/by insufficient material/i, 'insufficient'],
  [/by 50-move rule/i, 'fifty_move'],
];

const ON_BOARD = new Set<TerminationKind>([
  'checkmate',
  'stalemate',
  'insufficient',
  'fifty_move',
  'repetition',
]);

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

function winnerFromHeaders(headers: PgnHeaders): Color | null {
  const named = /^(\S+) won\b/i.exec(headers.Termination ?? '')?.[1]?.toLowerCase();
  if (named) {
    if (headers.White?.toLowerCase() === named) return 'w';
    if (headers.Black?.toLowerCase() === named) return 'b';
  }
  if (headers.Result === '1-0') return 'w';
  if (headers.Result === '0-1') return 'b';
  return null;
}

/**
 * The kind of ending and the winner: from chess.com's result codes first
 * (more reliable than the header prose), else from `Termination`, else
 * `unknown`. The board overrides both (see `endingFor`).
 */
export function terminationOf(
  headers: PgnHeaders,
  results?: ResultCodes,
): { kind: TerminationKind; winner: Color | null } {
  if (results) {
    const codes = [results.white.toLowerCase(), results.black.toLowerCase()];
    const found = CODES.find(([code]) => codes.includes(code));
    if (found) {
      const winner: Color | null = codes[0] === 'win' ? 'w' : codes[1] === 'win' ? 'b' : null;
      return { kind: found[1], winner };
    }
  }

  const prose = headers.Termination ?? '';
  const matched = PROSE.find(([re]) => re.test(prose));
  if (matched) {
    const decisive = /\bwon\b/i.test(prose);
    return { kind: matched[1], winner: decisive ? winnerFromHeaders(headers) : null };
  }

  return { kind: 'unknown', winner: winnerFromHeaders(headers) };
}

/**
 * A White-view score read from `side`: a mate for them or ≥ 300 cp is
 * winning, ≥ 100 better, > −100 equal, > −300 worse, else (or a mate
 * against) losing — the cutoffs of the coach's better-line phrases (§13.2).
 */
export function verdictOf(score: Score, side: Color): Verdict {
  const mine = fromMoverView(score, side === 'w');
  if (mine.mate !== undefined) return mine.mate > 0 ? 'winning' : 'losing';
  const cp = mine.cp ?? 0;
  if (cp >= 300) return 'winning';
  if (cp >= 100) return 'better';
  if (cp > -100) return 'equal';
  if (cp > -300) return 'worse';
  return 'losing';
}

/**
 * The ending of a built review. The final position is the truth: a board
 * that chess.js calls checkmate or stalemate overrides whatever the headers
 * say. For a timeout the flagged side reads 0 on `clocks`, and `finalThink`
 * is its last `left` — the think that ran out.
 */
export function endingFor(
  review: Omit<Review, 'ending'>,
  game: Pick<ParsedGame, 'headers' | 'fens'>,
  results?: ResultCodes,
): GameEnding {
  let { kind, winner } = terminationOf(game.headers, results);

  const lastFen = game.fens.at(-1)!;
  const board = new Chess(lastFen);
  const toMove = board.turn() as Color;
  if (board.isCheckmate()) {
    kind = 'checkmate';
    winner = other(toMove);
  } else if (board.isStalemate()) {
    kind = 'stalemate';
    winner = null;
  }

  const last = review.moves.at(-1);
  const evalAtEnd: Score =
    last?.evalAfter.lines[0]?.score ??
    (board.isCheckmate() ? { mate: toMove === 'w' ? -1 : 1 } : { cp: 0 });

  const ending: GameEnding = {
    kind,
    winner,
    onBoard: ON_BOARD.has(kind),
    atPly: review.moves.length,
    evalAtEnd,
    verdictAtEnd: { w: verdictOf(evalAtEnd, 'w'), b: verdictOf(evalAtEnd, 'b') },
  };

  const lastLeft: Partial<Record<Color, number>> = {};
  for (const m of review.moves) if (m.clock) lastLeft[m.color] = m.clock.left;
  const hasClocks = review.moves.length > 0 && review.moves.every((m) => m.clock);

  if (hasClocks) {
    const base = review.timeControl?.base ?? 0;
    const clocks: Record<Color, number> = { w: lastLeft.w ?? base, b: lastLeft.b ?? base };
    if (kind === 'timeout' || kind === 'timeout_vs_insufficient') {
      // The side that flagged: the loser when the result names one, else
      // the side to move after the last ply.
      const flagged: Color = winner ? other(winner) : toMove;
      ending.finalThink = clocks[flagged];
      clocks[flagged] = 0;
    }
    ending.clocks = clocks;
  }

  return ending;
}
