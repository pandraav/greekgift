import { describe, expect, it } from 'vitest';

import { reviewBuildKey, SCORING_VERSION } from '../src/version.ts';

describe('reviewBuildKey', () => {
  it('appends the scoring version to the engine build', () => {
    expect(SCORING_VERSION).toBe('s4');
    expect(reviewBuildKey('stockfish-18-lite-single')).toBe('stockfish-18-lite-single+s4');
  });

  it('is idempotent', () => {
    const key = reviewBuildKey('stockfish-18-lite-single');
    expect(reviewBuildKey(key)).toBe(key);
  });

  it('never equals the plain build, so pre-versioned rows are not read', () => {
    expect(reviewBuildKey('b')).not.toBe('b');
  });
});
