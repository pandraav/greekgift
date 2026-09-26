import { describe, expect, it } from 'vitest';

import { BOARD_GRID, SQUARE } from './layout';

describe('board layout', () => {
  it('fixes both rows and columns, so ranks cannot size to their pieces', () => {
    expect(BOARD_GRID.split(' ')).toEqual(expect.arrayContaining(['grid-cols-8', 'grid-rows-8']));
  });

  it('lets a square shrink below its piece', () => {
    expect(SQUARE.split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'min-w-0']));
  });
});
