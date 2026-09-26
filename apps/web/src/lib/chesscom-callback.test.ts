import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parsePgn } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import {
  decodeMoveList,
  normaliseCallback,
  PromotionUnsupportedError,
} from './chesscom-callback';

const fixtures = path.resolve(import.meta.dirname, '../../test/fixtures');
const load = (name: string) => JSON.parse(readFileSync(path.join(fixtures, name), 'utf8')) as unknown;
const pgnOf = (name: string) => readFileSync(path.join(fixtures, name), 'utf8');
const idOf = (json: unknown) => String((json as { game: { id: number } }).game.id);

describe('decodeMoveList', () => {
  it('decodes 1.e4 e5 2.Nf3 (chess.com pairs: from,to)', () => {
    // e2=12 → 'm', e4=28 → 'C'; e7=52 → '0', e5=36 → 'K'; g1=6 → 'g', f3=21 → 'v'
    expect(decodeMoveList('mC0Kgv')).toEqual([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
    ]);
  });

  it('throws on a promotion destination until the fixture exists', () => {
    // 'a7' index 48 → 'W'; '{' is index 64 (queen, capture left)
    expect(() => decodeMoveList('W{')).toThrow(PromotionUnsupportedError);
  });

  it('rejects an odd-length list', () => {
    expect(() => decodeMoveList('mC0')).toThrow();
  });
});

describe('normaliseCallback', () => {
  it('rebuilds the live game so its SAN equals the archive PGN', () => {
    const json = load('callback-live.json');
    const game = normaliseCallback(json, { id: idOf(json), kind: 'live' });
    expect(game).not.toBeNull();
    const ours = parsePgn(game!.pgn).moves.map((m) => m.san);
    const theirs = parsePgn(pgnOf('callback-live.pgn')).moves.map((m) => m.san);
    expect(ours).toEqual(theirs);
    expect(game!.time_class).not.toBe('daily');
    expect(game!.rules).toBe('chess');
    expect(game!.url).toBe(`https://www.chess.com/game/live/${idOf(json)}`);
    expect(parsePgn(game!.pgn).gameId).toBe(idOf(json));
  });

  it('rebuilds the daily game with time_class daily', () => {
    const json = load('callback-daily.json');
    const game = normaliseCallback(json, { id: idOf(json), kind: 'daily' });
    expect(game).not.toBeNull();
    expect(game!.time_class).toBe('daily');
    const ours = parsePgn(game!.pgn).moves.map((m) => m.san);
    const theirs = parsePgn(pgnOf('callback-daily.pgn')).moves.map((m) => m.san);
    expect(ours).toEqual(theirs);
  });

  it('decodes the daily fixture\'s king-to-rook-square castling to O-O for both sides', () => {
    // The daily fixture encodes castling as e1→h1 / e8→h8 (the rook's home
    // square), not the king's landing square g1/g8 that chess.js's object
    // move form expects — unlike the live fixture, which encodes the king's
    // real landing square directly. Ply 9 (white) and ply 10 (black) are
    // both O-O in the archive PGN; name that assertion so a regression in
    // the castling fallback shows up here, not just in the SAN-equality diff.
    const json = load('callback-daily.json');
    const game = normaliseCallback(json, { id: idOf(json), kind: 'daily' });
    expect(game).not.toBeNull();
    const sans = parsePgn(game!.pgn).moves.map((m) => m.san);
    expect(sans[8]).toBe('O-O'); // ply 9: white castles kingside
    expect(sans[9]).toBe('O-O'); // ply 10: black castles kingside
  });

  it('derives the exact pair the live fixture calls for: 1-0 by resignation', () => {
    const json = load('callback-live.json') as {
      game: { pgnHeaders: { Result: string }; resultMessage: string };
    };
    // Named, so re-recording the fixture with a different game fails here
    // rather than quietly weakening the assertion below.
    expect(json.game.pgnHeaders.Result).toBe('1-0');
    expect(json.game.resultMessage).toBe('Hikaru won by resignation');

    const game = normaliseCallback(json, { id: idOf(json), kind: 'live' })!;
    expect(game.white.result).toBe('win');
    expect(game.black.result).toBe('resigned');
  });

  const mutate = (fn: (g: Record<string, unknown>) => void) => {
    const json = structuredClone(load('callback-live.json')) as { game: Record<string, unknown> };
    fn(json.game);
    return normaliseCallback(json, { id: idOf(json), kind: 'live' });
  };

  it('reads the loser and the draw reason out of the result message', () => {
    const flipped = mutate((g) => {
      (g.pgnHeaders as Record<string, string>).Result = '0-1';
      g.resultMessage = 'Hikaru won on time';
    })!;
    expect(flipped.black.result).toBe('win');
    expect(flipped.white.result).toBe('timeout');

    const drawn = mutate((g) => {
      (g.pgnHeaders as Record<string, string>).Result = '1/2-1/2';
      g.resultMessage = 'Game drawn by repetition';
    })!;
    expect(drawn.white.result).toBe('repetition');
    expect(drawn.black.result).toBe('repetition');
  });

  it('returns null for a variant', () => {
    expect(mutate((g) => { g.type = 'chess960'; })).toBeNull();
  });
  it('returns null for a custom start position', () => {
    expect(mutate((g) => { (g.pgnHeaders as Record<string, string>).SetUp = '1'; (g.pgnHeaders as Record<string, string>).FEN = '8/8/8/8/8/8/8/K6k w - - 0 1'; })).toBeNull();
  });
  it('returns null for an odd move list', () => {
    expect(mutate((g) => { g.moveList = (g.moveList as string).slice(1); })).toBeNull();
  });
  it('returns null when plyCount disagrees', () => {
    expect(mutate((g) => { g.plyCount = (g.plyCount as number) + 1; })).toBeNull();
  });
  it('returns null for an illegal move', () => {
    expect(mutate((g) => { g.moveList = 'mm' + (g.moveList as string).slice(2); })).toBeNull();
  });
  it('returns null for a promotion (gated)', () => {
    expect(mutate((g) => { g.moveList = 'W{'; g.plyCount = 1; })).toBeNull();
  });
  it('fails closed for a non-king same-rank jump instead of retrying it as castling', () => {
    // a1 (index 0 → 'a') to c1 (index 2 → 'c'): a rook, not a king, and from
    // the start position it cannot jump the b1 knight. The castling fallback
    // must only ever fire for a king landing on a literal rook square —
    // never remap and silently accept an illegal rook/queen move instead.
    expect(mutate((g) => { g.moveList = 'ac'; g.plyCount = 1; })).toBeNull();
  });
  it('fails closed for a king that is not on its home square, even though the remap would be legal', () => {
    // 1.d4 d5 2.Qd3 Nf6 3.Bf4 Nc6 4.Kd1 e6 5.Kd1→a1. The literal move is
    // three files, so it fails; the castling remap's target c1 is empty and
    // unattacked, so a fallback keyed only on "a king, a rook square, one
    // rank" would happily play Kc1 and hand back a game that never happened.
    // Only e1/e8 may castle, so this must be a null.
    expect(mutate((g) => { g.moveList = 'lBZJdt!TcD5Qed0Sda'; g.plyCount = 9; })).toBeNull();
  });
  it('fails closed for e1→h1 once the king has left e1', () => {
    // 1.e4 e5 2.Ke2 Nf6 3.e1→h1: the right squares, no king on them. The
    // rook on h1 is not castling with an empty e1.
    expect(mutate((g) => { g.moveList = 'mC0Kem!Teh'; g.plyCount = 5; })).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(normaliseCallback(null, { id: '1', kind: 'live' })).toBeNull();
    expect(normaliseCallback({}, { id: '1', kind: 'live' })).toBeNull();
  });
});

describe.skipIf(!existsSync(path.join(fixtures, 'callback-promotion.json')))('promotion fixture', () => {
  it('decodes promotions to the same SAN as the archive', () => {
    const json = load('callback-promotion.json');
    const game = normaliseCallback(json, { id: idOf(json), kind: 'live' });
    expect(game).not.toBeNull();
    const ours = parsePgn(game!.pgn).moves.map((m) => m.san);
    const theirs = parsePgn(pgnOf('callback-promotion.pgn')).moves.map((m) => m.san);
    expect(ours).toEqual(theirs);
  });
});
