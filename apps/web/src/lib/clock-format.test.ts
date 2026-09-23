import { describe, expect, it } from 'vitest';

import { clockFace, durationWords, spentShort } from './clock-format';

describe('clockFace', () => {
  it('reads m:ss, floored', () => {
    expect(clockFace(48_100)).toBe('0:48');
    expect(clockFace(48_999)).toBe('0:48');
    expect(clockFace(596_600)).toBe('9:56');
    expect(clockFace(0)).toBe('0:00');
    expect(clockFace(-500)).toBe('0:00');
  });

  it('adds hours for daily-length clocks', () => {
    expect(clockFace(3_725_000)).toBe('1:02:05');
  });
});

describe('spentShort', () => {
  it('one decimal under ten seconds', () => {
    expect(spentShort(3_800)).toBe('3.8s');
    expect(spentShort(3_899)).toBe('3.8s');
    expect(spentShort(0)).toBe('0.0s');
    expect(spentShort(9_999)).toBe('9.9s');
  });

  it('whole seconds under a minute, then m:ss', () => {
    expect(spentShort(10_000)).toBe('10s');
    expect(spentShort(41_700)).toBe('41s');
    expect(spentShort(69_300)).toBe('1:09');
  });
});

describe('durationWords', () => {
  it('says seconds in words under a minute', () => {
    expect(durationWords(400)).toBe('no time');
    expect(durationWords(1_200)).toBe('1 second');
    expect(durationWords(48_100)).toBe('48 seconds');
    expect(durationWords(102_000)).toBe('1:42');
  });
});
