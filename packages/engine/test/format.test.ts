import { describe, expect, it } from 'vitest';

import { formatTimeControl } from '../src/format.ts';

describe('formatTimeControl', () => {
  it('turns plain seconds into minutes', () => {
    expect(formatTimeControl('180')).toBe('3 min');
    expect(formatTimeControl('600')).toBe('10 min');
    expect(formatTimeControl('60')).toBe('1 min');
  });

  it('keeps very short controls in seconds', () => {
    expect(formatTimeControl('30')).toBe('30 sec');
  });

  it('uses the spoken form when there is an increment', () => {
    expect(formatTimeControl('180+1')).toBe('3+1');
    expect(formatTimeControl('300+5')).toBe('5+5');
  });

  it('reads daily games as days', () => {
    expect(formatTimeControl('1/86400')).toBe('1 day');
    expect(formatTimeControl('1/259200')).toBe('3 days');
    expect(formatTimeControl('1/604800')).toBe('7 days');
  });

  it('handles an awkward base without lying about it', () => {
    expect(formatTimeControl('90')).toBe('1.5 min');
    expect(formatTimeControl('90+1')).toBe('1.5 min+1');
  });

  it('passes anything it cannot read straight through', () => {
    expect(formatTimeControl('weird')).toBe('weird');
  });
});
