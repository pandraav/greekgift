import { useCallback, useState } from 'react';

/**
 * Board state that belongs to one position.
 *
 * A tap highlight, its legal-move dots, a half-dragged piece and an open
 * promotion picker only mean something on the position they were made on.
 * Each is stored with the FEN it was set against and reads as nothing once
 * the board shows another one, so stepping never leaves a stale selection.
 */

export interface Held<T> {
  fen: string;
  value: T;
}

/** The held value if it was set on `fen`, else nothing. */
export function heldFor<T>(held: Held<T> | null, fen: string): T | null {
  return held !== null && held.fen === fen ? held.value : null;
}

/** `useState` for a value that is dropped whenever `fen` changes. */
export function usePositionState<T>(fen: string): [T | null, (value: T | null) => void] {
  const [held, setHeld] = useState<Held<T> | null>(null);
  const value = heldFor(held, fen);

  // Dropped for good rather than just hidden, so going back to the earlier
  // position does not bring its old selection back with it.
  if (held !== null && value === null) setHeld(null);

  const set = useCallback(
    (next: T | null) => setHeld(next === null ? null : { fen, value: next }),
    [fen],
  );
  return [value, set];
}
