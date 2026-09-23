import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CoachText, MoveFacts, Review } from '@greekgift/engine';
import { factsFor } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { PERSONAS, findPersona } from '../src/personas.ts';
import { clockProp, gameOverProp, plan } from '../src/plan.ts';
import { renderCoachText, seedFor } from '../src/render.ts';
import { inventedTimes, validate } from '../src/validate.ts';

/**
 * The coach knows the clock (review-overhaul design §14.5, loop criterion 20).
 * Game 184269442794, KAFKA_F0 (White) vs jakeleupen, 10 minutes, lost on time.
 * 15.Bb2 was a mistake played in 3.8 s; 22.Nxd4 a mistake after 1:09.3; White
 * flagged on move 30 after 48.1 s of thought, the position equal and 30.Ng5
 * holding.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REVIEW = JSON.parse(
  readFileSync(join(here, '../../engine/test/fixtures/clocked/184269442794.json'), 'utf8'),
) as Review;
const sagar = findPersona('sagar');
const note = (f: MoveFacts, persona = sagar) =>
  renderCoachText(f, persona, 'intermediate', seedFor(REVIEW.gameId, f.ply, persona.id, f.perspective ?? 'n'));
const all = (t: CoachText) => [t.headline, t.whatHappened, t.whyItMatters, t.betterWas, t.lesson].join(' ');
const TIME = /\b\d+:\d{2}\b|\b\d+ seconds?\b|\b\d+ minutes?\b/;

describe('15.Bb2 (ply 29): a fast error', () => {
  const facts = factsFor(REVIEW, 29, { audience: 'intermediate', perspective: 'w' });

  it('plans a fast clock proposition', () => {
    expect(clockProp(facts)?.args.kind).toBe('fast');
  });

  it('says how fast, with the clock, to the member', () => {
    const t = note(facts);
    expect(t.whatHappened).toMatch(/You played 15\.Bb2 in 3 seconds and missed 15…cxb3/);
    expect(t.whatHappened).toContain('7:50 on your clock');
    expect(validate(t, facts, sagar).violations).toEqual([]);
  });

  it('frames the same move for the opponent without addressing them as you', () => {
    const f = factsFor(REVIEW, 29, { audience: 'intermediate', perspective: 'b' });
    const t = note(f);
    expect(t.whatHappened).toMatch(/15\.Bb2/);
    expect(t.whatHappened).not.toMatch(/\bYou played 15/);
    expect(validate(t, f, sagar).violations).toEqual([]);
  });
});

describe('22.Nxd4 (ply 43): a long think, then an error', () => {
  const facts = factsFor(REVIEW, 43, { audience: 'intermediate', perspective: 'w' });

  it('names the think and the reply it missed', () => {
    expect(clockProp(facts)?.args.kind).toBe('long');
    const t = note(facts);
    expect(t.whatHappened).toContain('1:09');
    expect(t.whatHappened).toContain('22…Rxh4');
    expect(validate(t, facts, sagar).violations).toEqual([]);
  });
});

describe('quiet good moves say nothing about time', () => {
  it('has no clock proposition and no time figure', () => {
    for (const move of REVIEW.moves) {
      if (!['best', 'excellent', 'good', 'book'].includes(move.classification)) continue;
      const f = factsFor(REVIEW, move.ply, { audience: 'intermediate', perspective: 'w' });
      if (f.clock?.inTrouble || f.ending) continue;
      expect(clockProp(f), `ply ${move.ply}`).toBeNull();
      expect(all(note(f)), `ply ${move.ply}`).not.toMatch(TIME);
    }
  });
});

describe('the final ply: lost on time', () => {
  const facts = factsFor(REVIEW, 58, { audience: 'intermediate', perspective: 'w' });

  it('explains the flag, the position and the move that held', () => {
    expect(gameOverProp(facts)).not.toBeNull();
    const t = note(facts);
    expect(t.whyItMatters).toMatch(/Your clock ran out (on move 30 after 48 seconds of thought|; the position)/);
    expect(t.whyItMatters).toMatch(/equal/);
    expect(validate(t, facts, sagar).violations).toEqual([]);
  });

  it('says it for every voice and every reader, and validates', () => {
    for (const perspective of ['w', 'b', null] as const) {
      const f = factsFor(REVIEW, 58, { audience: 'intermediate', perspective });
      for (const persona of PERSONAS) {
        const t = note(f, persona);
        const at = `${persona.id}/${perspective}: ${t.whyItMatters}`;
        expect(t.whyItMatters, at).toMatch(/clock ran out/);
        if (perspective === 'w') expect(t.whyItMatters, at).toMatch(/\bYour clock ran out/i);
        if (perspective === 'b') expect(t.whyItMatters, at).toMatch(/your opponent's clock ran out/i);
        if (perspective === null) expect(t.whyItMatters, at).toMatch(/White's clock ran out/);
        expect(validate(t, f, persona).violations, at).toEqual([]);
      }
    }
  });

  it('names 30.Ng5 as the move that would have held it, when there was room', () => {
    const t = renderCoachText(facts, findPersona('agad'), 'intermediate', 1);
    const texts = PERSONAS.map((p) => note(facts, p).whyItMatters).join(' ');
    expect(`${t.whyItMatters} ${texts}`).toContain('30.Ng5 would have held it');
  });
});

describe('the final ply: resignation', () => {
  const resigned: Review = {
    ...REVIEW,
    ending: {
      kind: 'resignation',
      winner: 'b',
      onBoard: false,
      atPly: 58,
      evalAtEnd: { cp: -520 },
      verdictAtEnd: { w: 'losing', b: 'winning' },
      clocks: { w: 48100, b: 214700 },
    },
  };

  it('says who resigned and in what position', () => {
    const f = factsFor(resigned, 58, { audience: 'intermediate', perspective: 'w' });
    const t = note(f);
    expect(t.whyItMatters).toMatch(/You resigned[^.]*29…Ne5|resignation after 29…Ne5|You resigned here/);
    expect(t.whyItMatters).toMatch(/lost for you \(−5\.2\)/);
    expect(validate(t, f, sagar).violations).toEqual([]);
    const o = note(factsFor(resigned, 58, { audience: 'intermediate', perspective: 'b' }));
    expect(o.whyItMatters).toMatch(/Your opponent resigned|resignation/);
  });
});

describe('invented_time', () => {
  const facts = factsFor(REVIEW, 29, { audience: 'intermediate', perspective: 'w' });
  const text = (whatHappened: string): CoachText => ({
    ply: 29, headline: 'Bb2.', whatHappened, whyItMatters: 'It cost.', betterWas: 'cxb3 was the move.', lesson: 'Slow down.', source: 'rules',
  });

  it('allows figures from the facts, in either form', () => {
    expect(inventedTimes(text('You played 15.Bb2 in 3 seconds, with 7:50 on your clock.'), facts)).toEqual([]);
    expect(inventedTimes(text('You played it with 7 minutes left.'), facts)).toEqual([]);
  });

  it('rejects any other figure, and all figures when there is no clock', () => {
    expect(inventedTimes(text('You played it in 4 seconds with 6:10 on your clock.'), facts)).toEqual(expect.arrayContaining(['6:10', '4 seconds']));
    const bare = { ...facts, clock: undefined };
    expect(inventedTimes(text('With 12 seconds left.'), bare)).toEqual(['12 seconds']);
    expect(validate(text('With 12 seconds left.'), bare, sagar).violations.map((v) => v.kind)).toContain('invented_time');
  });

  it('does not read move numbers as times', () => {
    expect(inventedTimes(text('30.Ng5 would have held it.'), facts)).toEqual([]);
  });
});

describe('the plan merges the clock into the refutation', () => {
  it('carries the clock on the refutation, weight 1, with no separate clock prop', () => {
    const f = factsFor(REVIEW, 43, { audience: 'intermediate', perspective: 'w' });
    const props = plan(f, 'intermediate').props;
    const r = props.find((p) => p.kind === 'refutation')!;
    expect(r.args.clockKind).toBe('long');
    expect(r.weight).toBe(1);
    expect(props.some((p) => p.kind === 'clock')).toBe(false);
  });
});

describe('a notable clock is never dropped (COACH_VERSION 6)', () => {
  // The 2M review's refutation for 22.Nxd4 is 22…cxb3, uncovering an attack
  // on the rook on f1; the stored fixture (300k) has 22…Rxh4. Set by hand.
  const at43 = (perspective: 'w' | 'b' | null): MoveFacts => ({
    ...factsFor(REVIEW, 43, { audience: 'intermediate', perspective }),
    refutation: {
      line: ['cxb3'],
      moveNumber: 22,
      tactic: {
        type: 'discovered_attack',
        mover: { piece: 'P', square: 'b3', color: 'b' },
        attacker: { piece: 'B', square: 'a6', color: 'b' },
        target: { piece: 'R', square: 'f1', color: 'w' },
        check: false,
      },
      gained: [],
      lost: [],
      net: 0,
      actual: 'Bxh4',
    },
  });

  for (const perspective of ['w', 'b', null] as const) {
    it(`15.Bb2 and 22.Nxd4 carry their time in every persona (${perspective ?? 'n'})`, () => {
      const cases: [MoveFacts, RegExp][] = [
        [factsFor(REVIEW, 29, { audience: 'intermediate', perspective }), /3 seconds/],
        [at43(perspective), /1:09/],
      ];
      for (const [f, time] of cases) {
        for (const persona of PERSONAS) {
          for (const seed of [1, 2, 3, seedFor(REVIEW.gameId, f.ply, persona.id, perspective ?? 'n')]) {
            const t = renderCoachText(f, persona, 'intermediate', seed);
            const at = `${persona.id}/${perspective ?? 'n'}/${seed}: ${t.whatHappened}`;
            expect(t.whatHappened, at).toMatch(time);
            expect(validate(t, f, persona).violations, at).toEqual([]);
          }
        }
      }
    });
  }

  it('merges the time with the refutation for the member', () => {
    const t = renderCoachText(at43('w'), findPersona('gotham'), 'intermediate', seedFor(REVIEW.gameId, 43, 'gotham', 'w'));
    expect(t.whatHappened).toMatch(/You spent 1:09 on 22\.Nxd4 and still missed 22…cxb3/);
  });
});
