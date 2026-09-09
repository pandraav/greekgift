/**
 * What a pasted chess.com link points at.
 *
 * Pure: no fetch, no database. Accepts the shapes chess.com actually hands
 * out — the game page, the analysis page, the older `/live/game/` form — with
 * or without a scheme or `www.`, and a bare id for people who copy just the
 * number. Anything else, including lichess and member pages, is null.
 */

export interface GameLink {
  id: string;
  kind: 'live' | 'daily';
}

const HOST = /^(?:https?:\/\/)?(?:www\.)?chess\.com(\/.*)?$/i;

// Case-insensitive: chess.com's own share menu hands out `/Game/Live/<id>`
// on some surfaces, and the host pattern already ignores case.
const PATHS: [RegExp, (m: RegExpExecArray) => GameLink][] = [
  [/^\/game\/(live|daily)\/(\d{6,})\/?$/i, (m) => ({ kind: m[1]!.toLowerCase() as GameLink['kind'], id: m[2]! })],
  [/^\/(live|daily)\/game\/(\d{6,})\/?$/i, (m) => ({ kind: m[1]!.toLowerCase() as GameLink['kind'], id: m[2]! })],
  [/^\/analysis\/game\/(live|daily)\/(\d{6,})\/?$/i, (m) => ({ kind: m[1]!.toLowerCase() as GameLink['kind'], id: m[2]! })],
  [/^\/game\/(\d{6,})\/?$/i, (m) => ({ kind: 'live', id: m[1]! })],
];

export function parseGameLink(input: string): GameLink | null {
  const text = input.trim().split(/[?#]/)[0]!;
  if (!text) return null;

  if (/^\d{6,}$/.test(text)) return { id: text, kind: 'live' };

  const host = HOST.exec(text);
  if (!host) return null;
  const path = host[1] ?? '/';

  for (const [re, build] of PATHS) {
    const m = re.exec(path);
    if (m) return build(m);
  }
  return null;
}
