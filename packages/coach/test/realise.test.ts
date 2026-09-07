import type { CoachText, MoveFacts, PieceRef } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { SLOTS, type PersonaGrammar, type Plan, type Proposition, type RenderContext } from '../src/contracts.ts';
import { findPersona } from '../src/personas.ts';
import { plan as planFor } from '../src/plan.ts';
import { neutralFrames, PROP_KINDS } from '../src/realise/frames.ts';
import { realise } from '../src/realise/index.ts';
import { Referrer } from '../src/realise/refer.ts';
import { makePick, mulberry32 } from '../src/realise/seed.ts';
import { countWords } from '../src/realise/text.ts';
import { sentencesOf, validate } from '../src/validate.ts';
import { neutralGrammar } from '../src/voices/neutral.ts';

/** The spec's shared example: 36... Nd7, a blunder into a knight fork. */
const N_C5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };
const N_D7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const B_B7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };

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
    { type: 'fork', by: N_C5, targets: [N_D7, B_B7], byMover: false },
    { type: 'hanging_piece', target: N_D7, attackers: [N_C5], defenders: [] },
  ],
  materialAfterBestLine: 0,
  materialAfterPlayedLine: -3,
  bestMoveEffect: { check: false, materialGain: 3, line: ['Be6', 'Nxe6', 'fxe6'] },
  situations: [
    { kind: 'walked_into_fork', severity: 0.85, motif: { type: 'fork', by: N_C5, targets: [N_D7, B_B7], byMover: false } },
    { kind: 'hung_piece', severity: 0.72, motif: { type: 'hanging_piece', target: N_D7, attackers: [N_C5], defenders: [] } },
  ],
  phase: 'middlegame',
  leftBook: true,
  audience: 'intermediate',
};

const prop = (
  kind: Proposition['kind'],
  slot: Proposition['slot'],
  role: Proposition['role'],
  args: Proposition['args'],
  weight = 1,
): Proposition => ({ kind, slot, role, args, weight });

/** The plan the planner would build for the example, by hand. */
const examplePlan = (over: Partial<Plan> = {}): Plan => ({
  facts: FACTS,
  audience: 'intermediate',
  classification: 'blunder',
  lead: 'walked_into_fork',
  epLoss: 0.34,
  props: [
    prop('verdict', 'headline', 'orientation', { classification: 'blunder', san: 'Nd7', lead: 'walked_into_fork' }),
    prop('forked', 'whatHappened', 'observation', { by: N_C5, targets: [N_D7, B_B7] }),
    prop('hangs', 'whatHappened', 'observation', { target: N_D7, attackers: [N_C5], defenders: [] }, 0.6),
    prop('swing', 'whyItMatters', 'consequence', { winBefore: 52, winAfter: 18, epLoss: 0.34 }),
    prop('material_delta', 'whyItMatters', 'consequence', { materialGain: 3 }, 0.7),
    prop('best_move', 'betterWas', 'counterfactual', { move: 'Be6' }),
    prop('lesson', 'lesson', 'advice', { concept: 'check_landing_square' }),
  ],
  ...over,
});

const grammar = (over: Partial<PersonaGrammar> = {}): PersonaGrammar => ({
  ...neutralGrammar('sagar'),
  ...over,
});

const sagar = findPersona('sagar');
const all = (text: CoachText) => SLOTS.map((s) => text[s]).join(' ');
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const contextFor = (plan: Plan, g: PersonaGrammar, seed = 1): { ctx: RenderContext; referrer: Referrer } => {
  const referrer = new Referrer({
    lexicon: g.lexicon,
    preferHere: g.syntax.preferHere,
    playedSquare: 'd7',
    moverColor: plan.facts.color,
  });
  const ctx: RenderContext = {
    lexicon: g.lexicon,
    syntax: g.syntax,
    audience: plan.audience,
    refer: (p) => referrer.refer(p),
    square: (sq) => referrer.square(sq),
    move: (san) => referrer.move(san),
    pick: makePick(mulberry32(seed)),
  };
  return { ctx, referrer };
};

describe('referring expressions', () => {
  const make = (preferHere = false) =>
    new Referrer({
      lexicon: neutralGrammar('sagar').lexicon,
      preferHere,
      playedSquare: 'd7',
      moverColor: 'b',
    });

  it('names a piece in full the first time and "it" straight after', () => {
    const r = make();
    expect(r.resolve(`${r.refer(N_D7)} is attacked and nothing defends ${r.refer(N_D7)}.`)).toBe(
      'the knight on d7 is attacked and nothing defends it.',
    );
  });

  it('falls back to "the knight" once another piece has intervened', () => {
    const r = make();
    const text = r.resolve(`${r.refer(N_D7)} and ${r.refer(B_B7)}. ${r.refer(N_D7)} falls.`);
    expect(text).toBe('the knight on d7 and the bishop on b7. the knight falls.');
  });

  it('disambiguates two knights by owner', () => {
    const r = make();
    const text = r.resolve(`${r.refer(N_C5)} hits ${r.refer(N_D7)}, so ${r.refer(N_C5)} wins ${r.refer(N_D7)}.`);
    expect(text).toBe('the knight on c5 hits the knight on d7, so their knight wins your knight.');
  });

  it('does not reach back across a slot boundary with "it"', () => {
    const r = make();
    r.resolve(r.refer(N_D7));
    r.newSlot();
    expect(r.resolve(r.refer(N_D7))).toBe('the knight');
  });

  it('says a square once', () => {
    const r = make();
    expect(r.resolve(`${r.refer(N_D7)} defends ${r.square('d7')} and ${r.square('b7')} and ${r.square('b7')}`)).toBe(
      'the knight on d7 defends that square and b7 and that square',
    );
  });

  it('prefers "here" for the played move’s square', () => {
    const r = make(true);
    expect(r.resolve(`${r.refer(N_D7)} lands ${r.square('d7')}`)).toBe('the knight here lands here');
  });

  it('does not let unpicked variants pollute the mention state', () => {
    const text = realise(examplePlan(), grammar(), 3);
    expect(count(text.whatHappened, 'on d7')).toBeLessThanOrEqual(1);
    expect(count(text.whatHappened, 'on c5')).toBeLessThanOrEqual(1);
    expect(text.whatHappened.startsWith('The ')).toBe(true);
  });

  it('refers back with a pronoun or a bare noun in the second sentence', () => {
    const plan = examplePlan({
      props: [
        prop('verdict', 'headline', 'orientation', { classification: 'blunder', san: 'Nd7' }),
        prop('attacked_by', 'whatHappened', 'observation', { target: N_D7, attackers: [N_C5] }),
        prop('trapped', 'whatHappened', 'observation', { target: N_D7, attackers: [N_C5] }),
        prop('swing', 'whyItMatters', 'consequence', {}),
        prop('best_move', 'betterWas', 'counterfactual', { move: 'Be6' }),
        prop('lesson', 'lesson', 'advice', { concept: 'count_attackers' }),
      ],
    });
    for (const seed of [1, 2, 3, 4, 5]) {
      const text = realise(plan, grammar(), seed);
      expect(count(text.whatHappened, 'on d7'), text.whatHappened).toBe(1);
      expect(text.whatHappened, text.whatHappened).toMatch(/\b(it|It|the knight|your knight)\b/);
    }
  });
});

describe('aggregation', () => {
  it('folds two hangs by the same attacker into one sentence', () => {
    const plan = examplePlan({
      props: [
        prop('verdict', 'headline', 'orientation', { classification: 'blunder', san: 'Nd7' }),
        prop('hangs', 'whatHappened', 'observation', { target: N_D7, attackers: [N_C5], defenders: [] }),
        prop('hangs', 'whatHappened', 'observation', { target: B_B7, attackers: [N_C5], defenders: [] }, 0.6),
        prop('swing', 'whyItMatters', 'consequence', {}),
        prop('best_move', 'betterWas', 'counterfactual', { move: 'Be6' }),
        prop('lesson', 'lesson', 'advice', { concept: 'count_attackers' }),
      ],
    });
    const text = realise(plan, grammar(), 7);
    expect(sentencesOf(text.whatHappened)).toHaveLength(1);
    expect(text.whatHappened).toContain('d7');
    expect(text.whatHappened).toContain('b7');
    expect(count(text.whatHappened, 'c5')).toBe(1);
  });

  it('joins swing and material_delta with a connective', () => {
    const text = realise(examplePlan(), grammar(), 11);
    expect(sentencesOf(text.whyItMatters)).toHaveLength(1);
    expect(text.whyItMatters).toMatch(/about 52%/);
    expect(text.whyItMatters).toMatch(/about 18%/);
    expect(text.whyItMatters).toMatch(/three pawns/);
    expect(text.whyItMatters).toMatch(/, (and|so|but) /);
  });

  it('keeps hangs by different attackers apart', () => {
    const other: PieceRef = { piece: 'B', square: 'e6', color: 'w' };
    const plan = examplePlan({
      facts: { ...FACTS, motifs: [...FACTS.motifs, { type: 'hanging_piece', target: B_B7, attackers: [other], defenders: [] }] },
      props: [
        prop('verdict', 'headline', 'orientation', {}),
        prop('hangs', 'whatHappened', 'observation', { target: N_D7, attackers: [N_C5], defenders: [] }),
        prop('hangs', 'whatHappened', 'observation', { target: B_B7, attackers: [other], defenders: [] }, 0.6),
        prop('swing', 'whyItMatters', 'consequence', {}),
        prop('best_move', 'betterWas', 'counterfactual', { move: 'Be6' }),
        prop('lesson', 'lesson', 'advice', { concept: 'count_attackers' }),
      ],
    });
    expect(sentencesOf(realise(plan, grammar(), 7).whatHappened)).toHaveLength(2);
  });
});

describe('seeded variation', () => {
  it('renders the same note for the same seed', () => {
    const a = realise(examplePlan(), grammar(), 42);
    const b = realise(examplePlan(), grammar(), 42);
    expect(a).toEqual(b);
  });

  it('varies across seeds', () => {
    const notes = new Set<string>();
    for (let seed = 0; seed < 40; seed++) notes.add(all(realise(examplePlan(), grammar(), seed)));
    expect(notes.size).toBeGreaterThan(3);
  });
});

/** One sample proposition per kind, with motif-shaped args. */
const SAMPLE: Record<Proposition['kind'], Proposition['args']> = {
  verdict: { classification: 'blunder', san: 'Nd7', lead: 'walked_into_fork' },
  hangs: { target: N_D7, attackers: [N_C5], defenders: [] },
  attacked_by: { target: N_D7, attackers: [N_C5] },
  under_defended: { target: N_D7, attackers: [N_C5, B_B7], defenders: [B_B7] },
  forked: { by: N_C5, targets: [N_D7, B_B7] },
  forks: { by: N_D7, targets: [N_C5, B_B7] },
  pinned: { pinned: N_D7, pinner: N_C5, against: B_B7, absolute: true },
  skewered: { front: N_D7, behind: B_B7, by: N_C5 },
  discovered: { mover: N_D7, attacker: B_B7, target: N_C5, check: true },
  trapped: { target: N_D7, attackers: [N_C5] },
  missed_capture: { target: N_C5, value: 3 },
  missed_mate: { line: ['Be6', 'Nxe6', 'fxe6'], mateIn: 3 },
  mate_allowed: { line: ['Nc5', 'Qc7', 'Nxd7'] },
  mate_delivered: { san: 'Nd7' },
  ignored_threat: { kind: 'capture', by: N_C5, targets: [N_D7], line: ['Nc5'] },
  sacrifice: { piece: N_D7, netMaterial: -3, sound: false },
  only_move: { margin: 0.2, san: 'Nd7' },
  swing: { winBefore: 52, winAfter: 18, epLoss: 0.34 },
  material_delta: { materialGain: 3 },
  best_does: { move: 'Be6', captures: N_C5, check: false, forks: [] },
  best_line: { line: ['Be6', 'Nxe6', 'fxe6'] },
  best_move: { move: 'Be6' },
  left_book: { name: 'Sicilian Defence', eco: 'B90' },
  in_book: { name: 'Sicilian Defence', eco: 'B90' },
  back_rank: { side: 'b' },
  passed_pawn: { pawn: { piece: 'P', square: 'b7', color: 'b' }, stepsToPromote: 6, created: true },
  promotion: { square: 'b7', inBestLine: true },
  king_exposed: { side: 'b', score: 0.7, openFiles: ['c'], shieldMissing: ['b7'], attackersInZone: [N_C5] },
  overloaded: { defender: N_D7, duties: [B_B7, N_C5] },
  zugzwang: { side: 'b' },
  fortress: { side: 'b', deficit: 3, stablePlies: 8 },
  traded_behind: { deficit: 3, captured: N_C5 },
  quiet_loss: { epLoss: 0.05, bestMove: 'Be6' },
  define: { term: 'fork' },
  lesson: { concept: 'check_landing_square' },
};

describe('every proposition kind', () => {
  it('has a neutral frame with at least three non-empty variants', () => {
    const plan = examplePlan();
    const g = grammar();
    const frames = neutralFrames(plan, g);
    for (const kind of PROP_KINDS) {
      const { ctx } = contextFor(plan, g);
      const variants = frames[kind](prop(kind, 'whatHappened', 'observation', SAMPLE[kind]), ctx);
      expect(variants.length, kind).toBeGreaterThanOrEqual(3);
      for (const v of variants) expect(v.trim().length, `${kind}: ${v}`).toBeGreaterThan(0);
    }
  });

  it('renders non-empty prose through the neutral grammar, with no placeholder left', () => {
    for (const kind of PROP_KINDS) {
      const plan = examplePlan({
        props: [
          prop('verdict', 'headline', 'orientation', {}),
          prop(kind, 'whatHappened', 'observation', SAMPLE[kind]),
          prop('swing', 'whyItMatters', 'consequence', {}),
          prop('best_move', 'betterWas', 'counterfactual', { move: 'Be6' }),
          prop('lesson', 'lesson', 'advice', { concept: 'remember_this' }),
        ],
      });
      const text = realise(plan, grammar(), 5);
      for (const slot of SLOTS) {
        expect(text[slot].trim().length, `${kind}.${slot}`).toBeGreaterThan(0);
        expect(text[slot], `${kind}.${slot}`).not.toContain('');
        expect(text[slot], `${kind}.${slot}`).toMatch(/^[A-Z0-9"'(]/);
        expect(text[slot], `${kind}.${slot}`).toMatch(/[.!?]["')\]]?$/);
      }
    }
  });

  it('renders every kind with empty args by falling back to the facts', () => {
    for (const kind of PROP_KINDS) {
      const plan = examplePlan({ props: [prop(kind, 'whatHappened', 'observation', {})] });
      const text = realise(plan, grammar(), 9);
      expect(text.whatHappened.trim().length, kind).toBeGreaterThan(0);
      expect(text.whatHappened, kind).not.toContain('');
    }
  });
});

describe('budgets and guarantees', () => {
  it('meets a tight word budget by dropping low-weight props, then terser variants', () => {
    const g = grammar({ budgets: { words: 40, exclamations: 2 } });
    const text = realise(examplePlan(), g, 13);
    expect(countWords(all(text))).toBeLessThanOrEqual(40);
    expect(text.betterWas).toContain('Be6');
    for (const slot of SLOTS) expect(text[slot].trim().length, slot).toBeGreaterThan(0);
  });

  it('keeps every sentence within a per-sentence budget', () => {
    const g = grammar({ budgets: { words: 60, perSentence: 12, exclamations: 2 } });
    for (const seed of [1, 2, 3]) {
      const text = realise(examplePlan(), g, seed);
      for (const slot of SLOTS) {
        for (const s of sentencesOf(text[slot])) expect(countWords(s), `${slot}: ${s}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('caps exclamation marks by replacing the extras', () => {
    const g = grammar({
      budgets: { words: 200, exclamations: 1 },
      prosody: { ...neutralGrammar('sagar').prosody, exclamations: 1, reaction: () => 'Oh no! Look at this!', closer: () => 'Learn it!' },
    });
    const text = realise(examplePlan(), g, 1);
    expect(count(all(text), '!')).toBe(1);
    expect(text.whatHappened.startsWith('Oh no!')).toBe(true);
  });

  it('keeps the headline at or under 60 characters, never cut mid-word', () => {
    const long = grammar({
      frames: {
        verdict: () => ['A very long headline that goes on and on and on well past sixty characters', 'Short and to the point.'],
      },
    });
    for (let seed = 0; seed < 10; seed++) {
      const text = realise(examplePlan(), long, seed);
      expect(text.headline.length).toBeLessThanOrEqual(60);
      expect(text.headline).toBe('Short and to the point.');
    }
    const hopeless = grammar({ frames: { verdict: () => ['x'.repeat(70)] } });
    const text = realise(examplePlan(), hopeless, 1);
    expect(text.headline.length).toBeLessThanOrEqual(60);
    expect(text.headline).toMatch(/[.!?]$/);
  });

  it('always names the best move in betterWas, even when a persona frame forgets', () => {
    const forgetful = grammar({ frames: { best_move: () => ['There was something better.'] } });
    const text = realise(examplePlan(), forgetful, 1);
    expect(text.betterWas).toContain('Be6');
    const checking = examplePlan({ facts: { ...FACTS, bestMove: 'Be6+' } });
    expect(realise(checking, grammar(), 1).betterWas).toContain('Be6');
  });

  it('never returns an empty slot, even for an empty plan', () => {
    const text = realise(examplePlan({ props: [] }), grammar(), 1);
    for (const slot of SLOTS) expect(text[slot].trim().length, slot).toBeGreaterThan(0);
    expect(text.whatHappened).toContain('c5');
    expect(text.betterWas).toContain('Be6');
    expect(validate(text, FACTS, sagar).ok, JSON.stringify(validate(text, FACTS, sagar))).toBe(true);
  });

  it('fills a slot the planner left empty', () => {
    const plan = examplePlan({ props: examplePlan().props.filter((p) => p.slot !== 'lesson') });
    const text = realise(plan, grammar(), 1);
    expect(text.lesson.trim().length).toBeGreaterThan(0);
  });

  it('survives a persona frame or shape that throws', () => {
    const broken = grammar({
      frames: {
        forked: () => {
          throw new Error('boom');
        },
      },
      shape: () => {
        throw new Error('boom');
      },
    });
    const text = realise(examplePlan(), broken, 1);
    for (const slot of SLOTS) expect(text[slot].trim().length, slot).toBeGreaterThan(0);
  });
});

describe('sentence forms', () => {
  it('opens whatHappened with the reaction and ends the lesson with the closer', () => {
    const g = grammar({
      prosody: { ...neutralGrammar('sagar').prosody, reaction: () => 'Ah, okay', closer: () => 'That is the idea' },
    });
    const text = realise(examplePlan(), g, 2);
    expect(text.whatHappened.startsWith('Ah, okay.')).toBe(true);
    expect(text.lesson.endsWith('That is the idea.')).toBe(true);
  });

  it('asks a question for advice when the question rate is 1', () => {
    const g = grammar({ syntax: { ...neutralGrammar('sagar').syntax, questionRate: 1 } });
    const text = realise(examplePlan(), g, 2);
    expect(sentencesOf(text.lesson).some((s) => s.endsWith('?'))).toBe(true);
    const never = realise(examplePlan(), grammar(), 2);
    expect(never.lesson.endsWith('?')).toBe(false);
  });

  it('puts the verdict first when the syntax asks for it', () => {
    const g = grammar({ syntax: { ...neutralGrammar('sagar').syntax, verdictFirst: true } });
    const text = realise(examplePlan(), g, 2);
    expect(text.headline.startsWith('Blunder')).toBe(true);
    expect(text.whatHappened.startsWith('Blunder.')).toBe(true);
  });

  it('chains sentences with "and" when asked', () => {
    const g = grammar({ syntax: { ...neutralGrammar('sagar').syntax, chainWithAnd: true, maxSentenceWords: 40 } });
    const text = realise(examplePlan(), g, 2);
    expect(sentencesOf(text.whatHappened)).toHaveLength(1);
    expect(text.whatHappened).toMatch(/ and /);
  });

  it('gives the played square as "here" under preferHere', () => {
    const g = grammar({ syntax: { ...neutralGrammar('sagar').syntax, preferHere: true } });
    const text = realise(examplePlan(), g, 2);
    expect(text.whatHappened).toContain('here');
    expect(text.whatHappened).not.toContain('on d7');
  });

  it('applies the persona’s own frames over the neutral ones', () => {
    const g = grammar({ frames: { lesson: () => ['Friends, look at the square first.'] } });
    expect(realise(examplePlan(), g, 2).lesson).toBe('Friends, look at the square first.');
  });
});

describe('the shared example', () => {
  it('passes validation for Sagar through the neutral grammar, on every seed', () => {
    for (let seed = 0; seed < 25; seed++) {
      const text = realise(examplePlan(), neutralGrammar('sagar'), seed);
      const result = validate(text, FACTS, sagar);
      expect(result.violations, `seed ${seed}: ${JSON.stringify(text)}`).toEqual([]);
      expect(text.source).toBe('rules');
      expect(text.ply).toBe(36);
    }
  });

  it('passes validation for every persona through its neutral grammar', () => {
    for (const id of ['gotham', 'hikaru', 'sagar', 'agad', 'rosen', 'finegold', 'andrea']) {
      const text = realise(examplePlan(), neutralGrammar(id), 4);
      const result = validate(text, FACTS, findPersona(id));
      expect(result.violations, `${id}: ${JSON.stringify(text)}`).toEqual([]);
    }
  });

  it('renders the planner’s own plan for every audience and validates', () => {
    for (const audience of ['beginner', 'intermediate', 'advanced'] as const) {
      const plan = planFor({ ...FACTS, audience }, audience);
      for (const seed of [1, 2, 3]) {
        const text = realise(plan, neutralGrammar('sagar'), seed);
        const result = validate(text, FACTS, sagar);
        expect(result.violations, `${audience} seed ${seed}: ${JSON.stringify(text)}`).toEqual([]);
        expect(text.betterWas).toContain('Be6');
      }
    }
  });

  it('reads like a note', () => {
    const text = realise(examplePlan(), neutralGrammar('sagar'), 1);
    expect(text.headline.length).toBeLessThanOrEqual(60);
    expect(text.whatHappened).toContain('c5');
    expect(text.whatHappened).toMatch(/d7|here/);
    expect(text.whatHappened).toContain('b7');
    expect(text.whyItMatters).toContain('%');
    expect(text.betterWas).toContain('Be6');
  });
});
