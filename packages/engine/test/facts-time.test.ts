import { describe, expect, it } from 'vitest';

import { factsFor } from '../src/facts.ts';
import { REFERENCE } from './games.ts';

/** §14.5: clock facts per move, and the ending on the last ply. */

describe('clock facts', () => {
  it('22.Nxd4: a long think ending in an error', () => {
    const f = factsFor(REFERENCE, 43);
    expect(f.san).toBe('Nxd4');
    expect(f.clock).toEqual({
      spent: 69_300,
      left: 230_300,
      leftBefore: 299_600,
      inTrouble: false,
      fast: false,
      longThink: true,
    });
  });

  it('15.Bb2: fast', () => {
    expect(factsFor(REFERENCE, 29).clock).toMatchObject({ spent: 3_800, fast: true, longThink: false });
  });

  it('the first move’s clock before is the base', () => {
    expect(factsFor(REFERENCE, 1).clock?.leftBefore).toBe(600_000);
  });

  it('a review without clocks has no clock facts', () => {
    const bare = { ...REFERENCE, moves: REFERENCE.moves.map(({ clock: _clock, ...m }) => m) };
    expect(factsFor(bare, 43).clock).toBeUndefined();
  });
});

describe('ending facts', () => {
  it('only on the last ply', () => {
    expect(factsFor(REFERENCE, 57).ending).toBeUndefined();
    const last = factsFor(REFERENCE, 58);
    expect(last.ending).toMatchObject({
      final: true,
      kind: 'timeout',
      winner: 'b',
      onBoard: false,
      finalThink: 48_100,
      clocks: { w: 0, b: 214_700 },
      verdictAtEnd: { w: 'equal', b: 'equal' },
    });
  });

  it('the move that would have held is the last evalAfter line, already a permitted token', () => {
    const last = factsFor(REFERENCE, 58);
    expect(last.playedLine[0]).toBe('Ng5');
  });
});
