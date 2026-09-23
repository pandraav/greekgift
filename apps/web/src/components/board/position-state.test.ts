import { describe, expect, it } from 'vitest';

import { heldFor } from './position-state';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('heldFor', () => {
  it('returns the selection on the position it was made on', () => {
    expect(heldFor({ fen: START, value: 'e2' }, START)).toBe('e2');
  });

  it('clears the selection once the position changes', () => {
    expect(heldFor({ fen: START, value: 'e2' }, AFTER_E4)).toBeNull();
  });

  it('clears an open promotion picker once the position changes', () => {
    expect(heldFor({ fen: START, value: { from: 'e7', to: 'e8' } }, AFTER_E4)).toBeNull();
  });

  it('holds nothing when nothing was set', () => {
    expect(heldFor(null, START)).toBeNull();
  });
});
