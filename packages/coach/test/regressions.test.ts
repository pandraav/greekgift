import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CoachText, MoveFacts, Review } from '@greekgift/engine';
import { factsFor, rankSituations } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { plan } from '../src/plan.ts';
import { PERSONAS, findPersona } from '../src/personas.ts';
import { renderCoachText, seedFor } from '../src/render.ts';
import { falseCaptures, validate } from '../src/validate.ts';

/**
 * Wording regressions from chess.com game 184263578210 (kafka_f0 as Black):
 * 1.Nf3 Nc6 2.d4 d5 3.g3 Bf5 4.Bg2 e6 5.O-O Nf6 6.c4 Be7 7.Qa4 O-O 8.Nc3 Re8
 * 9.Ne5 Nxe5 10.dxe5 Ng4 11.cxd5 Nxe5 12.Rd1 Qc8 13.e4 …
 *
 * The facts are rebuilt by hand at the two plies, with the shape the engine
 * produced (the review itself needs Stockfish, which a unit test does not run).
 */

const facts = (f: Omit<MoveFacts, 'situations'>): MoveFacts => ({ ...f, situations: rankSituations(f) });

/** Ply 15, 8.Nc3: a good move; the best move was 8.cxd5, which captures on d5. */
const NC3 = facts({
  ply: 15,
  color: 'w',
  san: 'Nc3',
  classification: 'good',
  epLoss: 0.03,
  winBefore: 54,
  winAfter: 52,
  moveAccuracy: 88,
  forced: false,
  bestMove: 'cxd5',
  bestLine: ['cxd5', 'exd5'],
  playedLine: ['Re8'],
  motifs: [],
  materialAfterBestLine: 0,
  materialAfterPlayedLine: 0,
  bestMoveEffect: {
    captures: { piece: 'P', square: 'd5', color: 'b' },
    check: false,
    materialGain: 0,
    line: ['cxd5', 'exd5'],
  },
  phase: 'opening',
  leftBook: false,
  audience: 'intermediate',
  perspective: 'b',
});

/**
 * Ply 25, 13.e4: White's mistake, yet the played line ends three pawns up on
 * the best line within the horizon (materialGain = best − played = −3).
 */
const E4 = facts({
  ply: 25,
  color: 'w',
  san: 'e4',
  classification: 'mistake',
  epLoss: 0.14,
  winBefore: 61,
  winAfter: 47,
  moveAccuracy: 45,
  forced: false,
  bestMove: 'dxe6',
  bestLine: ['dxe6', 'Bxe6'],
  playedLine: ['Bg4'],
  motifs: [],
  materialAfterBestLine: 0,
  materialAfterPlayedLine: 3,
  bestMoveEffect: {
    captures: { piece: 'P', square: 'e6', color: 'b' },
    check: false,
    materialGain: -3,
    line: ['dxe6', 'Bxe6'],
  },
  phase: 'middlegame',
  leftBook: false,
  audience: 'intermediate',
  perspective: 'b',
});

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
const PERSPECTIVES = ['w', 'b', null] as const;
const all = (t: CoachText) => [t.headline, t.whatHappened, t.whyItMatters, t.betterWas, t.lesson].join(' ');

function everyNote(f: MoveFacts): { text: CoachText; facts: MoveFacts; persona: string }[] {
  const out: { text: CoachText; facts: MoveFacts; persona: string }[] = [];
  for (const perspective of PERSPECTIVES) {
    const withSide = { ...f, perspective };
    for (const persona of PERSONAS) {
      for (const seed of SEEDS) {
        out.push({ text: renderCoachText(withSide, persona, 'intermediate', seed), facts: withSide, persona: persona.id });
      }
    }
  }
  return out;
}

describe('8.Nc3 (ply 15): a quiet move never takes', () => {
  it('flags the old note', () => {
    const old: CoachText = {
      ply: 15,
      headline: 'Nc3.',
      whatHappened: 'Nc3 just takes the pawn on d5. Come on.',
      whyItMatters: 'Nothing changes for you.',
      betterWas: 'Their best was cxd5.',
      lesson: 'Look.',
      source: 'rules',
    };
    expect(falseCaptures(old, NC3)).toEqual(['Nc3 just takes']);
    expect(validate(old, NC3, findPersona('gotham')).violations.map((v) => v.kind)).toContain('false_capture');
  });

  it('does not hand the best move’s capture to the played move', () => {
    const lead = plan(NC3, 'intermediate').props.find((p) => p.kind === 'best_does' && p.args.played === true);
    expect(lead).toBeDefined();
    expect(lead!.args.captures).toBe(false);
  });

  it('renders no "Nc3 takes" in any voice, seed or perspective', () => {
    for (const n of everyNote(NC3)) {
      expect(all(n.text), n.persona).not.toMatch(/\bNc3,? (just )?(takes|captures)\b/i);
      expect(validate(n.text, n.facts, findPersona(n.persona)).violations).toEqual([]);
    }
  });
});

describe('13.e4 (ply 25): a mistake is never "came out better in material"', () => {
  it('plans no material sentence when the played line ends with more material', () => {
    for (const perspective of PERSPECTIVES) {
      expect(plan({ ...E4, perspective }, 'intermediate').props.map((p) => p.kind)).not.toContain('material_delta');
    }
  });

  it('renders no contradiction in any voice, seed or perspective', () => {
    for (const n of everyNote(E4)) {
      expect(all(n.text), n.persona).not.toMatch(/better in material|pawns? ahead in material|material won/i);
      expect(validate(n.text, n.facts, findPersona(n.persona)).violations).toEqual([]);
    }
  });

  it('still frames it as a chance for the member playing Black', () => {
    const note = renderCoachText(E4, findPersona('gotham'), 'intermediate', 1);
    expect(note.whyItMatters).toMatch(/you/);
    expect(note.whyItMatters).toContain('about 53%');
  });

  it('keeps the material sentence when the move really gave material away', () => {
    const gave = facts({ ...E4, bestMoveEffect: { ...E4.bestMoveEffect, materialGain: 3 } });
    expect(plan(gave, 'intermediate').props.map((p) => p.kind)).toContain('material_delta');
  });
});

/**
 * 23…Rxd5?? (ply 46), from the lines stored at 2M nodes (engine fixture
 * positions/184263578210-rxd5.json): 24.Qc4 pinned the rook on d5 to the king
 * on g8 and 25.exd5 won it; 23…c6 would have kept the game level (+0.7).
 * The rook was never "hanging": 24.exd5 at once dropped the queen to Bg6.
 */
describe('23…Rxd5 (ply 46): the note explains the pin', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const review = JSON.parse(
    readFileSync(join(here, '../../engine/test/fixtures/positions/184263578210-rxd5.json'), 'utf8'),
  ) as Review;

  for (const perspective of ['b', 'w', null] as const) {
    it(`names Qc4, the pin d5 to g8, exd5 and c6 for perspective ${perspective ?? 'n'}`, () => {
      const facts = factsFor(review, 46, { audience: 'intermediate', perspective });
      for (const persona of PERSONAS) {
        const text = renderCoachText(facts, persona, 'intermediate', seedFor(review.gameId, 46, persona.id, perspective ?? 'n'));
        const note = all(text);
        const at = `${persona.id}/${perspective ?? 'n'}: ${note}`;
        expect(note, at).toContain('24.Qc4');
        expect(note, at).toMatch(/pinn(?:ing|ed) [^.;]*rook on d5 to [^.;]*king on g8/);
        expect(note, at).toContain('25.exd5');
        expect(text.betterWas, at).toContain('23…c6');
        expect(text.betterWas, at).toContain('(+0.7)');
        expect(note, at).not.toMatch(/hanging|nobody defends|nothing defends|nothing defended/i);
        expect(validate(text, facts, persona).violations, at).toEqual([]);
      }
    });
  }

  it('speaks to the member playing Black in the past tense', () => {
    const facts = factsFor(review, 46, { audience: 'intermediate', perspective: 'b' });
    const text = renderCoachText(facts, findPersona('sagar'), 'intermediate', 1);
    expect(text.whatHappened).toMatch(
      /White had 24\.Qc4(, pinning your rook on d5 to your king on g8; after 24…Kh8 25\.exd5 you were a rook for a pawn down\.| It pinned your rook on d5 to your king on g8\. After 24…Kh8 25\.exd5 you were a rook for a pawn down\.)/,
    );
    expect(text.whatHappened).toContain('White played 24.f4 instead.');
    expect(text.betterWas).toMatch(/23…c6[^.]*would have kept the game level \(\+0\.7\)/);
  });
});

describe('final polish (COACH_VERSION 4)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const review = JSON.parse(
    readFileSync(join(here, '../../engine/test/fixtures/positions/184263578210-rxd5.json'), 'utf8'),
  ) as Review;
  const facts = factsFor(review, 46, { audience: 'intermediate', perspective: 'b' });
  const notes = PERSONAS.flatMap((persona) =>
    SEEDS.slice(0, 10).map((seed) => ({ persona: persona.id, text: renderCoachText(facts, persona, 'intermediate', seed) })),
  );

  it('plans the pin lesson when the refutation is a pin', () => {
    expect(plan(facts, 'intermediate').props.find((p) => p.kind === 'lesson')?.args.concept).toBe('watch_pins');
  });

  it('says the pin lesson in every voice', () => {
    for (const n of notes) expect(n.text.lesson, n.persona).toMatch(/pin|line/i);
  });

  it('gives win percentages a unit and a subject', () => {
    for (const n of notes) {
      expect(n.text.whyItMatters, n.persona).not.toMatch(/\b\d{1,3} (?:up |down )?to \d{1,3}\b(?!%| percent)/);
    }
    const gotham = renderCoachText(facts, findPersona('gotham'), 'intermediate', 3);
    expect(gotham.whyItMatters).toMatch(/Your winning chances[^.]*44%[^.]*22%/);
  });

  it('never repeats the card label or leaves a "Would have" fragment', () => {
    for (const n of notes) {
      expect(n.text.betterWas, n.persona).not.toMatch(/^Better was\b/i);
      expect(all(n.text), n.persona).not.toMatch(/(?:^|[.!?] )Would have\b/);
    }
  });

  it('the validator catches all three', () => {
    const bad: CoachText = {
      ply: 46,
      headline: 'Rxd5.',
      whatHappened: 'Rxd5 was a blunder.',
      whyItMatters: '44 to 22. That was the game.',
      betterWas: 'Better was c6. Would have kept it level.',
      lesson: 'Next time, look.',
      source: 'rules',
    };
    const kinds = validate(bad, facts, findPersona('gotham')).violations.map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(['bare_numbers', 'fragment', 'repeats_label']));
  });
});
