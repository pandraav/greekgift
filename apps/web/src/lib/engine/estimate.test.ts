import { describe, expect, it } from 'vitest';

import { estimateLabel, estimateSeconds } from './estimate';
import { ANALYSIS_NODES } from './settings';

describe('estimateSeconds', () => {
  it('is about a second a position at 2M nodes on four workers', () => {
    expect(estimateSeconds(55, 4, 2_000_000)).toBeCloseTo(55, 5);
  });

  it('follows the node budget and the worker count', () => {
    expect(estimateSeconds(60, 4, 300_000)).toBeCloseTo(9, 5);
    expect(estimateSeconds(55, 2, 2_000_000)).toBeCloseTo(110, 5);
    expect(estimateSeconds(55, 0, 2_000_000)).toBeCloseTo(220, 5); // never divides by zero
  });

  it('defaults to ANALYSIS_NODES', () => {
    expect(estimateSeconds(10, 4)).toBe(estimateSeconds(10, 4, ANALYSIS_NODES));
  });
});

describe('estimateLabel', () => {
  it('rounds to a friendly phrase', () => {
    expect(estimateLabel(5, 4, 2_000_000)).toBe('a few seconds');
    expect(estimateLabel(24, 4, 2_000_000)).toBe('about 20 seconds');
    expect(estimateLabel(55, 4, 2_000_000)).toBe('about a minute');
    expect(estimateLabel(76, 4, 2_000_000)).toBe('about a minute');
    expect(estimateLabel(120, 4, 2_000_000)).toBe('about 2 minutes');
    expect(estimateLabel(76, 2, 2_000_000)).toBe('about 3 minutes');
  });
});
