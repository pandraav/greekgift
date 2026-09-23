/**
 * The board's grid. Rows are fixed as well as columns: with only the columns
 * set, a rank's height came from its pieces (the SVGs' own size), so a rank
 * with pieces was taller than an empty one, the ranks resized as pieces moved,
 * and a tap landed on the wrong square because `squareAt` assumes eight equal
 * ranks. `minmax(0, 1fr)` rows and `min-h-0` squares keep every square the
 * same size whatever sits on it.
 */
export const BOARD_GRID = 'grid grid-cols-8 grid-rows-8';

export const SQUARE = 'relative grid min-h-0 min-w-0 place-items-center';
