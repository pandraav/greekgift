import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { factsFor } from '../src/facts.ts';
import type { Review } from '../src/types.ts';

/**
 * Review-overhaul §13.1 at chess.com game 184263578210 (FoggyDJohnson–KAFKA_F0),
 * 23…Rxd5??, from the lines stored at 2M nodes: 24.Qc4 pins the rook on d5 to
 * the king on g8, and 25.exd5 takes it. 24.exd5 at once would have dropped the
 * queen on c2 to the bishop on g6, so the rook was not "hanging".
 */
const here = dirname(fileURLToPath(import.meta.url));
const REVIEW = JSON.parse(
  readFileSync(join(here, 'fixtures/positions/184263578210-rxd5.json'), 'utf8'),
) as Review;

describe('refutation at 23…Rxd5', () => {
  const facts = factsFor(REVIEW, 46);

  it('is the stored reply line, cut where the rook is taken', () => {
    expect(facts.refutation?.line).toEqual(['Qc4', 'Kh8', 'exd5']);
    expect(facts.refutation?.moveNumber).toBe(24);
  });

  it('names the pin of the rook on d5 against the king on g8', () => {
    expect(facts.refutation?.tactic).toEqual({
      type: 'pin',
      pinned: { piece: 'R', square: 'd5', color: 'b' },
      pinner: { piece: 'Q', square: 'c4', color: 'w' },
      against: { piece: 'K', square: 'g8', color: 'b' },
      absolute: true,
    });
  });

  it('counts a rook lost for a pawn, and the reply actually played', () => {
    expect(facts.refutation?.gained).toEqual(['P']);
    expect(facts.refutation?.lost).toEqual(['R']);
    expect(facts.refutation?.net).toBe(-4);
    expect(facts.refutation?.actual).toBe('f4');
  });

  it('carries the better line with its score', () => {
    expect(facts.betterLine).toEqual({ line: ['c6', 'b4', 'Nd7'], moveNumber: 23, score: { cp: 68 } });
  });

  it('does not call the rook hanging: the engine did not take it at once', () => {
    expect(
      facts.motifs.some((m) => m.type === 'hanging_piece' && m.target.square === 'd5'),
    ).toBe(false);
  });

  it('is absent on a move that was not an error', () => {
    const quiet = { ...REVIEW, moves: REVIEW.moves.map((m) => ({ ...m, classification: 'good' as const })) };
    expect(factsFor(quiet, 46).refutation).toBeUndefined();
    expect(factsFor(quiet, 46).betterLine).toBeUndefined();
  });
});
