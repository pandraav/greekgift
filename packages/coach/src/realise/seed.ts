/**
 * A small deterministic PRNG (mulberry32). The realiser draws every choice —
 * which variant, whether to ask a question, which connective — from one of
 * these seeded with hash(gameId, ply, personaId), so the same inputs always
 * render the same note and a different seed renders a different one.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded `pick` over any list; an empty list yields `undefined`. */
export function makePick(rng: Rng): <T>(variants: T[]) => T {
  return <T>(variants: T[]): T => {
    if (variants.length === 0) return undefined as T;
    return variants[Math.floor(rng() * variants.length) % variants.length]!;
  };
}
