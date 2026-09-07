import type { CoachText, MoveFacts } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERSONA_ID,
  findPersona,
  personaInitials,
  PERSONAS,
  personaName,
} from '../src/personas.ts';
import { inventedTokens, permittedTokens, validate } from '../src/validate.ts';

/** The spec's shared example, as a facts object. */
const FACTS: MoveFacts = {
  ply: 36,
  color: 'b',
  san: 'Nd7',
  classification: 'blunder',
  epLoss: 0.34,
  winBefore: 52,
  winAfter: 18,
  moveAccuracy: 31.7,
  forced: false,
  bestMove: 'Be6',
  bestLine: ['Be6', 'Nxe6', 'fxe6'],
  playedLine: ['Nc5', 'Qc7', 'Nxd7'],
  motifs: [
    {
      type: 'fork',
      by: { piece: 'N', square: 'c5', color: 'w' },
      targets: [
        { piece: 'N', square: 'd7', color: 'b' },
        { piece: 'B', square: 'b7', color: 'b' },
      ],
      byMover: false,
    },
    {
      type: 'hanging_piece',
      target: { piece: 'N', square: 'd7', color: 'b' },
      attackers: [{ piece: 'N', square: 'c5', color: 'w' }],
      defenders: [],
    },
  ],
  materialAfterBestLine: 0,
  materialAfterPlayedLine: -3,
  bestMoveEffect: { check: false, materialGain: 3, line: ['Be6', 'Nxe6', 'fxe6'] },
  situations: [
    { kind: 'walked_into_fork', severity: 0.85 },
    { kind: 'hung_piece', severity: 0.72 },
  ],
  phase: 'middlegame',
  leftBook: true,
  audience: 'intermediate',
};

const sagar = findPersona('sagar');

const draft = (over: Partial<CoachText> = {}): CoachText => ({
  ply: 36,
  headline: 'One square, two of your pieces',
  whatHappened: 'The knight on c5 hits d7 and b7 at once.',
  whyItMatters: 'Only one of the two can be saved.',
  betterWas: 'Be6 keeps everything defended.',
  lesson: 'Ask what a knight would attack from the squares nearby.',
  source: 'llm',
  ...over,
});

describe('personas', () => {
  it('compiles all seven from the spec', () => {
    expect(PERSONAS).toHaveLength(7);
    expect(PERSONAS.map((p) => p.id)).toEqual([
      'gotham',
      'hikaru',
      'sagar',
      'agad',
      'rosen',
      'finegold',
      'andrea',
    ]);
  });

  it('gives every persona the full set of triggers and rules', () => {
    for (const persona of PERSONAS) {
      expect(Object.keys(persona.lines).length, persona.id).toBe(14);
      expect(persona.voiceRules.length, persona.id).toBeGreaterThanOrEqual(8);
      expect(persona.allowed.length, persona.id).toBeGreaterThan(5);
      expect(persona.banned.length, persona.id).toBeGreaterThan(3);
      expect(persona.budgets.words, persona.id).toBeGreaterThan(20);
    }
  });

  it('carries the spec’s own rendering of the shared example', () => {
    expect(sagar.rendered.better_was).toContain('Be6');
    expect(findPersona('hikaru').rendered.headline).toBe('Drops a piece to a fork.');
  });

  it('makes Sagar the default and falls back to him for a bad id', () => {
    expect(DEFAULT_PERSONA_ID).toBe('sagar');
    expect(findPersona('nobody').id).toBe('sagar');
    expect(findPersona(undefined).id).toBe('sagar');
  });

  it('names and initials a persona', () => {
    expect(personaName(sagar)).toBe('Sagar Shah');
    expect(personaInitials(sagar)).toBe('SS');
  });

  it('bans Hikaru’s words from Levy and Levy’s from Hikaru', () => {
    expect(findPersona('gotham').banned).toContain('juicer');
    expect(findPersona('hikaru').banned).toContain('ladies and gentlemen');
  });
});

describe('permittedTokens', () => {
  it('allows every move and square the facts mention', () => {
    const allowed = permittedTokens(FACTS);
    for (const token of ['Nd7', 'Be6', 'Nxe6', 'fxe6', 'Nc5', 'c5', 'd7', 'b7', 'e6']) {
      expect(allowed.has(token), token).toBe(true);
    }
  });

  it('does not allow a square nobody mentioned', () => {
    expect(permittedTokens(FACTS).has('h4')).toBe(false);
  });
});

describe('inventedTokens', () => {
  it('finds a square the facts never named', () => {
    expect(inventedTokens('The rook swings to h4.', permittedTokens(FACTS))).toEqual(['h4']);
  });

  it('is quiet about ordinary prose', () => {
    expect(inventedTokens('Only one of the two can be saved.', permittedTokens(FACTS))).toEqual([]);
  });
});

describe('validate', () => {
  it('passes a clean note', () => {
    expect(validate(draft(), FACTS, sagar)).toEqual({ ok: true, violations: [] });
  });

  it('rejects an invented move — the thing this whole layer exists for', () => {
    const result = validate(
      draft({ whatHappened: 'The knight on c5 hits d7, and Rxh7 is coming.' }),
      FACTS,
      sagar,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.kind)).toContain('invented_move');
  });

  it('rejects a note that never says what to play instead', () => {
    const result = validate(draft({ betterWas: 'There was something better.' }), FACTS, sagar);
    expect(result.violations.map((v) => v.kind)).toContain('missing_best_move');
  });

  it('rejects a word that breaks the voice', () => {
    const result = validate(draft({ lesson: 'That was a disaster, bro.' }), FACTS, sagar);
    expect(result.violations.filter((v) => v.kind === 'banned_word')).toHaveLength(2);
  });

  it('does not flag a banned word buried inside a longer one', () => {
    // "just" is banned for Sagar; "adjust" is not "just".
    const result = validate(draft({ lesson: 'Adjust the plan next time.' }), FACTS, sagar);
    expect(result.violations.map((v) => v.kind)).not.toContain('banned_word');
  });

  it('enforces the word budget and the exclamation budget', () => {
    const hikaru = findPersona('hikaru');
    const long = draft({ lesson: 'word '.repeat(60).trim(), betterWas: 'Be6.' });
    const kinds = validate(long, FACTS, hikaru).violations.map((v) => v.kind);
    expect(kinds).toContain('over_budget');

    const shouty = draft({ headline: 'Wow!', lesson: 'Look at it! Really!' });
    expect(validate(shouty, FACTS, hikaru).violations.map((v) => v.kind)).toContain(
      'too_many_exclamations',
    );
  });

  it('rejects a headline that will not fit', () => {
    const result = validate(draft({ headline: 'x'.repeat(61) }), FACTS, sagar);
    expect(result.violations.map((v) => v.kind)).toContain('headline_too_long');
  });

  it('rejects the coach claiming to be the person', () => {
    const result = validate(
      draft({ whatHappened: 'When I played this line, Be6 was already known.' }),
      FACTS,
      sagar,
    );
    expect(result.violations.map((v) => v.kind)).toContain('identity_claim');
  });

  it('rejects an empty slot', () => {
    expect(validate(draft({ lesson: '  ' }), FACTS, sagar).violations.map((v) => v.kind)).toContain(
      'empty_slot',
    );
  });
});
