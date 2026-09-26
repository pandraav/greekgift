import 'server-only';

/**
 * chess.com's public read-only API.
 *
 * No key, no auth, no rate-limit header — the documented rule is simply to
 * identify yourself and not hammer it in parallel. Requests are serial.
 *
 * Only what cannot change is cached: a finished month's archive, a profile,
 * the stats. The archives list and any month still accruing games are fetched
 * with `cache: 'no-store'`. Next's data cache is stale-while-revalidate — the
 * first request after expiry gets the old body and refreshes in the
 * background — so a cached current month handed a refresh whatever was
 * stored last time, which could be weeks old (the "0 of 26 games" bug).
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

/** Seconds in Next's data cache, or `'no-store'` to always ask chess.com. */
type Freshness = { revalidate: number } | 'no-store';

async function get<T>(path: string, freshness: Freshness): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    ...(freshness === 'no-store' ? { cache: 'no-store' as const } : { next: { revalidate: freshness.revalidate } }),
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

/** Newest last. Each entry is a full URL ending `/YYYY/MM`. Never cached: a new month appears in it the moment a game ends. */
export async function archives(username: string): Promise<string[]> {
  const data = await get<{ archives: string[] }>(
    `/player/${normaliseUsername(username)}/games/archives`,
    'no-store',
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
 * How long after a month ends its archive is still treated as open. chess.com
 * files a game under the month it ended in, and a game ending at 23:59 UTC can
 * take a while to appear, so a month is only frozen once it is two days gone.
 */
const SETTLE_MS = 2 * DAY * 1000;

/** True while a month can still gain games: the current month, and the last one for two days. */
export function isOpenMonth({ year, month }: ArchiveMonth, now: Date = new Date()): boolean {
  const end = Date.UTC(year, month, 1); // the first instant of the next month
  return now.getTime() < end + SETTLE_MS;
}

/**
 * One month of games, exactly as chess.com lists them — variants and all.
 *
 * A settled month is frozen, so it is cached for a week. An open month is
 * never cached (see the file comment). A 404 for a month means it has no
 * games; chess.com answers an empty month with `{"games":[]}`, but a month it
 * has never heard of is not an error worth failing a refresh over.
 */
export async function monthArchive(
  username: string,
  month: ArchiveMonth,
  now: Date = new Date(),
): Promise<ChesscomGame[]> {
  try {
    const data = await get<{ games: ChesscomGame[] }>(
      `/player/${normaliseUsername(username)}/games/${month.year}/${String(month.month).padStart(2, '0')}`,
      isOpenMonth(month, now) ? 'no-store' : { revalidate: DAY * 7 },
    );
    return data.games;
  } catch (error) {
    if (error instanceof ChesscomError && error.status === 404) return [];
    throw error;
  }
}

/** A month's standard-chess games that carry a PGN: the ones a link can open. */
export async function monthGames(username: string, month: ArchiveMonth): Promise<ChesscomGame[]> {
  return (await monthArchive(username, month)).filter((g) => g.rules === 'chess' && Boolean(g.pgn));
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
