import 'server-only';

import { Chess } from 'chess.js';

import type { ChesscomGame, ChesscomResult } from '@/lib/chesscom';
import type { GameLink } from '@/lib/game-link';
import { START_FEN } from '@/lib/slim-review';

/**
 * chess.com's game callback, the endpoint its own pages use.
 *
 * It returns no PGN — just headers and a two-character-per-move list — so the
 * game is replayed here with chess.js and a PGN is written from scratch. Every
 * check in `normaliseCallback` exists because the archive API gives us a PGN
 * we trust and this endpoint gives us bytes we have to prove. Anything odd
 * returns null and the caller falls back to the archive walk.
 */

/** Verified against live responses, 2026-09-07 (spec §2). */
const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';

const FILES = 'abcdefgh';

export class PromotionUnsupportedError extends Error {
  constructor() {
    super('Promotion moves in the callback move list are not decoded yet');
    this.name = 'PromotionUnsupportedError';
  }
}

const squareOf = (index: number): string =>
  `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;

/**
 * Two characters per move: origin square, destination square. Indices at or
 * above 64 encode a promotion (piece and direction, not a square); those are
 * unverified and throw so the caller falls back, until a recorded fixture
 * proves the mapping.
 */
export function decodeMoveList(moveList: string): { from: string; to: string }[] {
  if (moveList.length % 2 !== 0) throw new Error('Odd move list');
  const moves: { from: string; to: string }[] = [];
  for (let i = 0; i < moveList.length; i += 2) {
    const from = ALPHABET.indexOf(moveList[i]!);
    const to = ALPHABET.indexOf(moveList[i + 1]!);
    if (from < 0 || to < 0) throw new Error(`Unknown move character at ${i}`);
    if (from >= 64) throw new Error(`Bad origin index ${from}`);
    if (to >= 64) throw new PromotionUnsupportedError();
    moves.push({ from: squareOf(from), to: squareOf(to) });
  }
  return moves;
}

interface CallbackGame {
  id?: number;
  uuid?: string;
  type?: string;
  moveList?: string;
  plyCount?: number;
  endTime?: number;
  baseTime1?: number;
  timeIncrement1?: number;
  isRated?: boolean;
  resultMessage?: string;
  pgnHeaders?: Record<string, string | number | undefined>;
}

interface Callback {
  game?: CallbackGame;
  players?: unknown;
}

const HEADER_ORDER = [
  'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'ECO', 'ECOUrl',
  'WhiteElo', 'BlackElo', 'TimeControl', 'Termination', 'UTCDate', 'UTCTime',
  'StartTime', 'EndDate', 'EndTime', 'CurrentPosition',
];

/** chess.com's own bands: bullet under 3 min, blitz to 10, rapid above. */
function classOf(baseSeconds: number, incrementSeconds: number): ChesscomGame['time_class'] {
  const total = baseSeconds + 40 * incrementSeconds;
  if (total < 180) return 'bullet';
  if (total < 600) return 'blitz';
  return 'rapid';
}

/** "Hikaru won by resignation" → the loser's `result` code. */
function loserResult(message: string | undefined): ChesscomResult {
  const m = (message ?? '').toLowerCase();
  if (m.includes('checkmate')) return 'checkmated';
  if (m.includes('time')) return 'timeout';
  if (m.includes('abandon')) return 'abandoned';
  return 'resigned';
}

function drawResult(message: string | undefined): ChesscomResult {
  const m = (message ?? '').toLowerCase();
  if (m.includes('repetition')) return 'repetition';
  if (m.includes('stalemate')) return 'stalemate';
  if (m.includes('insufficient')) return 'insufficient';
  if (m.includes('50')) return '50move';
  return 'agreed';
}

/** Tries one decoded pair against the board; true and applied on success, false and untouched on failure. */
function applyMove(chess: Chess, from: string, to: string): boolean {
  try {
    chess.move({ from, to });
    return true;
  } catch {
    return false;
  }
}

// `ChesscomGame.pgn` is optional because the archive API can, in principle,
// hand back a game without one; this function always writes a fresh PGN, so
// its return type says so — a strict subtype the callers below still accept.
export function normaliseCallback(
  json: unknown,
  link: GameLink,
): (ChesscomGame & { pgn: string }) | null {
  const game = (json as Callback | null)?.game;
  if (!game || typeof game !== 'object') return null;
  if (game.type !== 'chess') return null;
  if (typeof game.moveList !== 'string' || game.moveList.length % 2 !== 0) return null;
  const headers = game.pgnHeaders ?? {};
  if (headers.Variant) return null;
  // chess.com stamps every callback response with `SetUp: "1"` and a `FEN`
  // header even for an ordinary game starting from the normal array — the FEN
  // given is just the standard start position. Only a FEN that actually
  // differs from this means a genuine custom setup (e.g. a variant or a
  // handicap game) that we cannot safely replay from `new Chess()`.
  if (typeof headers.FEN === 'string' && headers.FEN !== START_FEN) return null;
  if (typeof game.plyCount === 'number' && game.plyCount !== game.moveList.length / 2) return null;

  // Past the shape checks everything below is a replay of bytes chess.com
  // sent us: an unknown move character, a piece that is not where the list
  // says, a header chess.js will not take. None of that is exceptional here —
  // the caller wants a null so it can fall back to the archive walk.
  try {
    const pairs = decodeMoveList(game.moveList);
    if (pairs.length === 0) return null;

    const chess = new Chess();
    for (const { from, to } of pairs) {
      if (applyMove(chess, from, to)) continue;
      // Castling is sometimes encoded king-captures-rook (e1→h1, e1→a1) instead
      // of the king's actual landing square (g1/c1) that a plain move needs —
      // recorded fixtures show both forms in the wild, live games using one and
      // daily games the other. Retry as castling only once the literal square
      // move has failed, and only for the one shape castling can have: a king
      // standing on its own e-file home square, moving onto the literal rook
      // home square of that same rank. Anything else — a blocked rook or queen
      // move, or a king that wandered to d1 and is asked to reach a1 — falls
      // through to null rather than being silently retried at a wrong square.
      const rank = from === 'e1' ? '1' : from === 'e8' ? '8' : null;
      const isKing = chess.get(from as Parameters<typeof chess.get>[0])?.type === 'k';
      if (!rank || !isKing) return null;
      const rookFile = to === `h${rank}` ? 'g' : to === `a${rank}` ? 'c' : null;
      if (!rookFile || !applyMove(chess, from, `${rookFile}${rank}`)) return null;
    }

    const url = `https://www.chess.com/game/${link.kind}/${link.id}`;
    for (const key of HEADER_ORDER) {
      const value = headers[key];
      if (value !== undefined && value !== null && value !== '') chess.setHeader(key, String(value));
    }
    chess.setHeader('Link', url);
    const pgn = chess.pgn();

    const result = String(headers.Result ?? '*');
    let white: ChesscomResult;
    let black: ChesscomResult;
    if (result === '1-0') {
      white = 'win';
      black = loserResult(game.resultMessage);
    } else if (result === '0-1') {
      black = 'win';
      white = loserResult(game.resultMessage);
    } else if (result === '1/2-1/2') {
      white = black = drawResult(game.resultMessage);
    } else {
      return null; // unfinished
    }

    // baseTime1 and timeIncrement1 are in tenths of a second on the callback
    // (verified: live fixture's baseTime1=1800 against its PGN TimeControl="180").
    const base = typeof game.baseTime1 === 'number' ? game.baseTime1 / 10 : undefined;
    const increment = typeof game.timeIncrement1 === 'number' ? game.timeIncrement1 / 10 : 0;
    const timeControl =
      typeof headers.TimeControl === 'string' && headers.TimeControl
        ? headers.TimeControl
        : base !== undefined
          ? increment ? `${base}+${increment}` : `${base}`
          : link.kind === 'daily' ? '1/86400' : '600';
    const timeClass: ChesscomGame['time_class'] =
      link.kind === 'daily' ? 'daily' : classOf(base ?? 600, increment);

    const endTime =
      typeof game.endTime === 'number'
        ? game.endTime > 1e12 ? Math.floor(game.endTime / 1000) : game.endTime
        : Math.floor(Date.now() / 1000);

    const elo = (v: unknown) => (typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10) || 0);

    return {
      url,
      pgn,
      time_control: timeControl,
      time_class: timeClass,
      end_time: endTime,
      rated: game.isRated ?? true,
      rules: 'chess',
      uuid: typeof game.uuid === 'string' && game.uuid ? game.uuid : `callback-${link.kind}-${link.id}`,
      fen: chess.fen(),
      ...(typeof headers.ECO === 'string' ? { eco: headers.ECO } : {}),
      white: { username: String(headers.White ?? 'white'), rating: elo(headers.WhiteElo), result: white, uuid: '', '@id': '' },
      black: { username: String(headers.Black ?? 'black'), rating: elo(headers.BlackElo), result: black, uuid: '', '@id': '' },
    };
  } catch {
    return null;
  }
}

const UA = 'greekgift/0.1 (hobby chess game review; one user)';

/** The raw callback JSON, or null on any failure. Never throws. */
export async function fetchCallbackGame(link: GameLink): Promise<unknown | null> {
  try {
    const response = await fetch(`https://www.chess.com/callback/${link.kind}/game/${link.id}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}
