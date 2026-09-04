import { Chess } from 'chess.js';

import type { Color } from './types.ts';

/**
 * PGN in, positions out.
 *
 * Pure: no network, no DOM, no database. Everything downstream — the engine
 * queue, classification, the coach's facts — is built from what this returns,
 * so it is the one place that decides what a "move" is.
 */

export interface PgnHeaders {
  White?: string;
  Black?: string;
  WhiteElo?: string;
  BlackElo?: string;
  Result?: string;
  ECO?: string;
  ECOUrl?: string;
  TimeControl?: string;
  Termination?: string;
  UTCDate?: string;
  UTCTime?: string;
  Link?: string;
  [key: string]: string | undefined;
}

export interface ParsedMove {
  /** 1-based half-move index, matching MoveAnalysis.ply. */
  ply: number;
  color: Color;
  san: string;
  /** Long algebraic, which is the UCI string the engine speaks. */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  captured?: string;
  promotion?: string;
}

export interface ParsedGame {
  headers: PgnHeaders;
  moves: ParsedMove[];
  /** One more than `moves`: the position before each move, plus the final one. */
  fens: string[];
  result?: string;
  eco?: string;
  /** chess.com's numeric game id, from the Link header. */
  gameId?: string;
  whiteElo?: number;
  blackElo?: number;
}

export class PgnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgnError';
  }
}

/** `https://www.chess.com/game/live/97878070965` → `97878070965`. */
export function gameIdFromLink(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const m = /\/(\d{6,})\/?$/.exec(link.trim());
  return m?.[1];
}

const toInt = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();

  try {
    // chess.js strips the {[%clk …]} annotations chess.com embeds.
    chess.loadPgn(pgn);
  } catch (cause) {
    throw new PgnError(
      `Could not read that PGN: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const headers = chess.getHeaders() as PgnHeaders;
  const history = chess.history({ verbose: true });

  const moves: ParsedMove[] = history.map((m, i) => ({
    ply: i + 1,
    color: m.color as Color,
    san: m.san,
    uci: m.lan,
    fenBefore: m.before,
    fenAfter: m.after,
    ...(m.captured ? { captured: m.captured } : {}),
    ...(m.promotion ? { promotion: m.promotion } : {}),
  }));

  if (moves.length === 0) {
    throw new PgnError('That PGN has no moves in it');
  }

  const fens = [moves[0]!.fenBefore, ...moves.map((m) => m.fenAfter)];

  return {
    headers,
    moves,
    fens,
    result: headers.Result,
    eco: headers.ECO,
    gameId: gameIdFromLink(headers.Link),
    whiteElo: toInt(headers.WhiteElo),
    blackElo: toInt(headers.BlackElo),
  };
}

/** Half-move index → the move number a human would say. */
export const moveNumber = (ply: number): number => Math.floor((ply - 1) / 2) + 1;

/** "10." for White's tenth, "10…" for Black's. */
export function moveLabel(ply: number): string {
  return `${moveNumber(ply)}${ply % 2 === 1 ? '.' : '…'}`;
}

/**
 * A readable opening name from chess.com's ECOUrl slug.
 *
 * The slug is the opening name followed, sometimes, by the moves that reach
 * it — appended after an ellipsis, or after a hyphen and a move number:
 *
 *   Three-Knights-Opening                              → Three Knights Opening
 *   Closed-Sicilian-Defense-Fianchetto...6.exd5-exd5   → Closed Sicilian Defense Fianchetto
 *   Kings-Indian-Defense-Smyslov-Variation-4...d6      → Kings Indian Defense Smyslov Variation
 *   Pirc-Defense-2.d4-Nf6-3.Nd2-g6                     → Pirc Defense
 */
export function openingName(ecoUrl: string | undefined): string | undefined {
  if (!ecoUrl) return undefined;
  const slug = ecoUrl.split('/openings/')[1];
  if (!slug) return undefined;

  const name = slug
    .split('...')[0]! // drop a trailing move sequence
    .split(/-(?=\d)/)[0]! // …and one introduced by a move number
    .replace(/-/g, ' ')
    .trim();

  return name || undefined;
}
