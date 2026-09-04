import 'server-only';

/**
 * chess.com's public read-only API.
 *
 * No key, no auth, no rate-limit header — the documented rule is simply to
 * identify yourself and not hammer it in parallel. Requests are serial and
 * every response is cached, because the archive for a finished month never
 * changes.
 *
 * https://www.chess.com/news/view/published-data-api
 */

const BASE = 'https://api.chess.com/pub';

/** Sending a default agent gets you a Cloudflare block, not a 200. */
const UA = 'greekgift/0.1 (hobby chess game review; one user)';

export class ChesscomError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly username?: string,
  ) {
    super(message);
    this.name = 'ChesscomError';
  }
}

interface FetchOptions {
  /** Seconds. A finished month is immutable; the current one is not. */
  revalidate: number;
}

async function get<T>(path: string, { revalidate }: FetchOptions): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    next: { revalidate },
  });

  if (response.status === 404) {
    throw new ChesscomError('No such player on chess.com', 404);
  }
  if (response.status === 429) {
    throw new ChesscomError('chess.com is rate-limiting us — try again shortly', 429);
  }
  if (!response.ok) {
    throw new ChesscomError(
      `chess.com returned ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/* ── shapes, as the API actually returns them ─────────────────────────── */

export interface ChesscomProfile {
  username: string;
  player_id: number;
  name?: string;
  title?: string;
  country?: string;
  avatar?: string;
  joined?: number;
  last_online?: number;
  followers?: number;
}

interface RatingBucket {
  last?: { rating: number; date: number };
  best?: { rating: number };
  record?: { win: number; loss: number; draw: number };
}

export interface ChesscomStats {
  chess_rapid?: RatingBucket;
  chess_blitz?: RatingBucket;
  chess_bullet?: RatingBucket;
  chess_daily?: RatingBucket;
}

export type ChesscomResult =
  | 'win'
  | 'checkmated'
  | 'agreed'
  | 'repetition'
  | 'timeout'
  | 'resigned'
  | 'stalemate'
  | 'lose'
  | 'insufficient'
  | '50move'
  | 'abandoned'
  | 'kingofthehill'
  | 'threecheck'
  | 'timevsinsufficient'
  | 'bughousepartnerlose';

export interface ChesscomSide {
  rating: number;
  result: ChesscomResult;
  username: string;
  uuid: string;
  '@id': string;
}

export interface ChesscomGame {
  url: string;
  pgn?: string;
  time_control: string;
  time_class: 'bullet' | 'blitz' | 'rapid' | 'daily';
  end_time: number;
  rated: boolean;
  /** 'chess' for standard. Anything else is a variant and is skipped. */
  rules: string;
  uuid: string;
  initial_setup?: string;
  fen?: string;
  eco?: string;
  white: ChesscomSide;
  black: ChesscomSide;
  /** Only present where chess.com has run its own review — about a third. */
  accuracies?: { white: number; black: number };
}

/* ── endpoints ────────────────────────────────────────────────────────── */

const DAY = 60 * 60 * 24;

export function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export const USERNAME_RE = /^[a-z0-9_-]{3,25}$/;

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normaliseUsername(raw));
}

export function profile(username: string): Promise<ChesscomProfile> {
  return get(`/player/${normaliseUsername(username)}`, { revalidate: DAY });
}

export function stats(username: string): Promise<ChesscomStats> {
  return get(`/player/${normaliseUsername(username)}/stats`, {
    revalidate: 60 * 60,
  });
}

/** Newest last. Each entry is a full URL ending `/YYYY/MM`. */
export async function archives(username: string): Promise<string[]> {
  const data = await get<{ archives: string[] }>(
    `/player/${normaliseUsername(username)}/games/archives`,
    { revalidate: 60 * 60 },
  );
  return data.archives;
}

export interface ArchiveMonth {
  year: number;
  month: number;
}

export function monthOf(archiveUrl: string): ArchiveMonth {
  const m = /\/(\d{4})\/(\d{2})$/.exec(archiveUrl);
  if (!m) throw new ChesscomError(`Unparseable archive URL: ${archiveUrl}`, 500);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/**
 * One month of games.
 *
 * A month that has ended is frozen, so it is cached for a week. The current
 * month is still accruing games and gets five minutes.
 */
export async function monthGames(
  username: string,
  { year, month }: ArchiveMonth,
): Promise<ChesscomGame[]> {
  const now = new Date();
  const isCurrent =
    year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;

  const data = await get<{ games: ChesscomGame[] }>(
    `/player/${normaliseUsername(username)}/games/${year}/${String(month).padStart(2, '0')}`,
    { revalidate: isCurrent ? 300 : DAY * 7 },
  );

  // Variants share the endpoint. Only standard chess can be reviewed, and a
  // game without a PGN cannot be replayed at all.
  return data.games.filter((g) => g.rules === 'chess' && Boolean(g.pgn));
}

export function bestRating(s: ChesscomStats): {
  rapid?: number;
  blitz?: number;
  bullet?: number;
} {
  return {
    rapid: s.chess_rapid?.last?.rating,
    blitz: s.chess_blitz?.last?.rating,
    bullet: s.chess_bullet?.last?.rating,
  };
}
