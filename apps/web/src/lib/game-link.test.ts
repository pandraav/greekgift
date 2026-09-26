import { describe, expect, it } from 'vitest';

import { parseGameLink } from './game-link';

describe('parseGameLink', () => {
  it.each([
    ['https://www.chess.com/game/live/97878070965', '97878070965', 'live'],
    ['https://chess.com/game/live/97878070965/', '97878070965', 'live'],
    ['http://www.chess.com/game/daily/12345678', '12345678', 'daily'],
    ['www.chess.com/live/game/97878070965', '97878070965', 'live'],
    ['chess.com/daily/game/12345678', '12345678', 'daily'],
    ['https://www.chess.com/analysis/game/live/97878070965?tab=review&move=4', '97878070965', 'live'],
    ['https://www.chess.com/analysis/game/daily/12345678#x', '12345678', 'daily'],
    ['https://www.chess.com/game/97878070965', '97878070965', 'live'],
    ['chess.com/Game/Live/123456', '123456', 'live'],
    ['  97878070965  ', '97878070965', 'live'],
  ])('%s → %s (%s)', (input, id, kind) => {
    expect(parseGameLink(input)).toEqual({ id, kind });
  });

  it.each([
    'https://lichess.org/abc12345',
    'https://www.chess.com/member/hikaru',
    'https://www.chess.com/games/archive/hikaru',
    'https://www.chess.com/game/live/',
    '12345',
    '',
    'not a link',
  ])('rejects %s', (input) => {
    expect(parseGameLink(input)).toBeNull();
  });
});
