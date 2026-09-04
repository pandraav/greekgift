import { describe, expect, it } from 'vitest';

import {
  gameIdFromLink,
  moveLabel,
  openingName,
  parsePgn,
  PgnError,
} from '../src/pgn.ts';

/** A real chess.com PGN, clock annotations and all. */
const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[White "erik"]
[Black "bartekbartek45455"]
[Result "1-0"]
[ECO "B24"]
[WhiteElo "1699"]
[BlackElo "1675"]
[TimeControl "60+1"]
[Termination "erik won on time"]
[Link "https://www.chess.com/game/live/97878070965"]

1. e4 {[%clk 0:01:01]} 1... c5 {[%clk 0:01:01]} 2. Nc3 {[%clk 0:01:01.3]} 2... e6 {[%clk 0:01:01.3]} 3. g3 {[%clk 0:01:02]} 1-0`;

describe('parsePgn', () => {
  const game = parsePgn(PGN);

  it('reads the headers chess.com sets', () => {
    expect(game.headers.White).toBe('erik');
    expect(game.eco).toBe('B24');
    expect(game.whiteElo).toBe(1699);
    expect(game.blackElo).toBe(1675);
    expect(game.result).toBe('1-0');
  });

  it('pulls the game id out of the Link header', () => {
    expect(game.gameId).toBe('97878070965');
  });

  it('strips clock comments and keeps the moves', () => {
    expect(game.moves.map((m) => m.san)).toEqual(['e4', 'c5', 'Nc3', 'e6', 'g3']);
  });

  it('numbers plies from 1 and alternates colour', () => {
    expect(game.moves[0]).toMatchObject({ ply: 1, color: 'w', san: 'e4' });
    expect(game.moves[1]).toMatchObject({ ply: 2, color: 'b', san: 'c5' });
  });

  it('gives UCI alongside SAN, which is what the engine speaks', () => {
    expect(game.moves[0]!.uci).toBe('e2e4');
    expect(game.moves[2]!.uci).toBe('b1c3');
  });

  it('produces one more position than moves', () => {
    expect(game.fens).toHaveLength(game.moves.length + 1);
    expect(game.fens[0]).toContain('rnbqkbnr/pppppppp');
  });

  it('chains: each move starts where the last one ended', () => {
    for (let i = 1; i < game.moves.length; i++) {
      expect(game.moves[i]!.fenBefore).toBe(game.moves[i - 1]!.fenAfter);
    }
  });

  it('refuses a PGN with no moves', () => {
    expect(() => parsePgn('[White "a"]\n[Black "b"]\n\n*')).toThrow(PgnError);
  });
});

describe('gameIdFromLink', () => {
  it('takes the trailing numeric id', () => {
    expect(gameIdFromLink('https://www.chess.com/game/live/97878070965')).toBe('97878070965');
  });
  it('tolerates a trailing slash', () => {
    expect(gameIdFromLink('https://www.chess.com/game/live/123456789/')).toBe('123456789');
  });
  it('returns undefined when there is nothing to take', () => {
    expect(gameIdFromLink(undefined)).toBeUndefined();
    expect(gameIdFromLink('https://www.chess.com/openings/Sicilian')).toBeUndefined();
  });
});

describe('moveLabel', () => {
  it('marks whose move it was', () => {
    expect(moveLabel(1)).toBe('1.');
    expect(moveLabel(2)).toBe('1…');
    expect(moveLabel(19)).toBe('10.');
    expect(moveLabel(20)).toBe('10…');
  });
});

describe('openingName', () => {
  const of = (slug: string) =>
    openingName(`https://www.chess.com/openings/${slug}`);

  it('leaves a bare name alone', () => {
    expect(of('Three-Knights-Opening')).toBe('Three Knights Opening');
    expect(of('Scandinavian-Defense-Boehnke-Gambit')).toBe(
      'Scandinavian Defense Boehnke Gambit',
    );
  });

  it('drops a move sequence after an ellipsis', () => {
    expect(of('Closed-Sicilian-Defense-Fianchetto-Variation...6.exd5-exd5-7.d4')).toBe(
      'Closed Sicilian Defense Fianchetto Variation',
    );
  });

  it('drops a move sequence introduced by a move number', () => {
    expect(of('Kings-Indian-Defense-Smyslov-Variation-4...d6')).toBe(
      'Kings Indian Defense Smyslov Variation',
    );
    expect(of('Four-Knights-Game-Glek-Variation-4...Bb4-5.Bg2')).toBe(
      'Four Knights Game Glek Variation',
    );
    expect(of('Pirc-Defense-2.d4-Nf6-3.Nd2-g6')).toBe('Pirc Defense');
  });

  it('keeps castling in a name from being mistaken for a move', () => {
    expect(of('Kings-Indian-Defense-Accelerated-Averbakh-Variation-5...O-O')).toBe(
      'Kings Indian Defense Accelerated Averbakh Variation',
    );
  });

  it('gives up quietly on anything unexpected', () => {
    expect(openingName(undefined)).toBeUndefined();
    expect(openingName('https://www.chess.com/nonsense')).toBeUndefined();
  });
});
