import type { PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { Proposition, RenderContext, Slot } from '../src/contracts.ts';
import { SLOTS } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { andrea, andreaReaction, andreaShape } from '../src/voices/andrea.ts';

/**
 * Andrea's voice rules as assertions. The realiser is built in parallel and
 * is not used here: frames are called directly with a fake render context,
 * and the shared example is assembled by hand per design §7.
 */

const persona = findPersona('andrea');

const TRIGGERS: Trigger[] = [
  'reviewStart',
  'brilliant',
  'great',
  'blunder',
  'mistake',
  'miss',
  'bookExit',
  'comeback',
  'collapse',
  'highAccuracy',
  'lowAccuracy',
  'longGame',
  'reviewEnd',
  'random',
];

/** Same patterns as validate.ts, which is frozen and does not export them. */
const IDENTITY = [
  /\bi am (?:the )?(?:im|gm|international master|grandmaster)\b/i,
  /\bmy (?:youtube |twitch )?channel\b/i,
  /\bsubscribe\b/i,
  /\bin my game against\b/i,
  /\bwhen i played\b/i,
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function bannedHits(text: string): string[] {
  return persona.banned.filter((word) =>
    /\s/.test(word)
      ? text.toLowerCase().includes(word.toLowerCase())
      : new RegExp(`\\b${escape(word)}\\b`, 'i').test(text),
  );
}

const bangs = (text: string) => (text.match(/!/g) ?? []).length;

/** The fake context the task prescribes: refer is fixed, squares and moves pass through, pick takes the first. */
const fakeCtx: RenderContext = {
  lexicon: andrea.lexicon,
  syntax: andrea.syntax,
  audience: 'intermediate',
  refer: () => 'the knight on d7',
  square: (sq) => sq,
  move: (san) => san,
  pick: (variants) => variants[0]!,
};

const N_D7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const B_B7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };
const N_C5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };

const prop = (
  kind: Proposition['kind'],
  slot: Slot,
  args: Proposition['args'],
  role: Proposition['role'] = 'observation',
): Proposition => ({ kind, role, slot, args, weight: 1 });

/** Every frame rendered over a representative proposition. */
const SAMPLES: Array<[Proposition, RenderContext]> = [
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'blunder', square: 'c5' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'blunder' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'miss' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'mistake' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'inaccuracy' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Bxh7+', classification: 'brilliant' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'great' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'book' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'best' }), fakeCtx],
  [prop('verdict', 'headline', { san: 'Nd7', classification: 'good' }), fakeCtx],
  [prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [] }), fakeCtx],
  [prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] }), fakeCtx],
  [prop('missed_capture', 'whatHappened', { target: N_D7, value: 3 }), fakeCtx],
  [prop('ignored_threat', 'whatHappened', { by: N_C5, targets: [N_D7], kind: 'fork', line: ['Nc5'] }), fakeCtx],
  [prop('ignored_threat', 'whatHappened', { by: N_C5, targets: [N_D7], kind: 'mate', line: ['Nc5'] }), fakeCtx],
  [prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 18 }, 'consequence'), fakeCtx],
  [prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 45 }, 'consequence'), fakeCtx],
  [prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 80 }, 'consequence'), fakeCtx],
  [prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 55 }, 'consequence'), fakeCtx],
  [prop('best_move', 'betterWas', { move: 'Be6', san: 'Nd7', played: false, lead: 'walked_into_fork' }, 'counterfactual'), fakeCtx],
  ...['fork', 'pin', 'skewer', 'discovered attack', 'zugzwang', 'fortress', 'back rank', 'passed pawn', 'overloaded'].map(
    (term): [Proposition, RenderContext] => [prop('define', 'lesson', { term }, 'definition'), fakeCtx],
  ),
  ...[
    'check_landing_square',
    'count_attackers',
    'look_for_captures',
    'checks_first',
    'defend_back_rank',
    'see_their_threat',
    'dont_trade_behind',
    'push_the_passer',
    'keep_the_shield',
    'one_defender_two_jobs',
    'keep_the_tension',
    'book_ends_here',
    'remember_this',
  ].map((concept): [Proposition, RenderContext] => [prop('lesson', 'lesson', { concept }, 'advice'), fakeCtx]),
];

function everyAuthoredString(): string[] {
  const out: string[] = [];
  for (const trigger of TRIGGERS) out.push(...(andrea.events[trigger] ?? []));
  for (const [p, ctx] of SAMPLES) out.push(...andrea.frames[p.kind]!(p, ctx));
  const leads: SituationKind[] = ['walked_into_fork', 'hung_piece', 'sound_sacrifice', 'mate_delivered', 'only_move', 'best', 'book'];
  for (const lead of leads) {
    for (const loss of [0, 0.01, 0.03, 0.05, 0.15, 0.25, 0.4]) out.push(andrea.prosody.reaction(loss, lead));
    out.push(andrea.prosody.closer(lead));
  }
  return out;
}

describe('andrea: identity and budgets', () => {
  it('is the andrea persona with the compiled budgets and banned list', () => {
    expect(andrea.id).toBe('andrea');
    expect(andrea.budgets).toEqual(persona.budgets);
    expect(andrea.budgets).toEqual({ words: 75, exclamations: 2 });
    expect(andrea.banned).toEqual(persona.banned);
    expect(andrea.prosody.exclamations).toBe(persona.budgets.exclamations);
  });

  it('speaks to chat, with bro and dude as intensifiers, in feelings not evaluations', () => {
    expect(andrea.lexicon.address).toBe('chat');
    expect(andrea.lexicon.intensifiers).toEqual(expect.arrayContaining(['bro', 'dude']));
    expect(andrea.lexicon.praise[0]).toBe('bro, respect');
    expect(andrea.lexicon.captureVerb).toBe('takes');
    for (const word of andrea.lexicon.blame) {
      expect(['a mistake', 'inaccurate', 'dubious', 'losing', 'bad']).not.toContain(word);
    }
  });

  it('asks rather than tells, in short fast sentences, with caps as the peak', () => {
    expect(andrea.syntax.questionRate).toBeCloseTo(0.5);
    expect(andrea.syntax.maxSentenceWords).toBeLessThanOrEqual(12);
    expect(andrea.syntax.fragments).toBe(true);
    expect(andrea.syntax.verdictFirst).toBe(false);
    expect(andrea.prosody.capsPeak).toBe(true);
  });
});

describe('andrea: events', () => {
  it('has at least three variants for all fourteen triggers, the first being the spec line', () => {
    for (const trigger of TRIGGERS) {
      const lines = andrea.events[trigger];
      expect(lines, trigger).toBeDefined();
      expect(lines!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(lines![0], trigger).toBe(persona.lines[trigger]);
    }
  });

  it('keeps every event line under the exclamation budget and free of chess claims', () => {
    for (const trigger of TRIGGERS) {
      for (const line of andrea.events[trigger]!) {
        expect(bangs(line), line).toBeLessThanOrEqual(2);
        // A persona line may never state an evaluation, a move or a square.
        expect(line, line).not.toMatch(/\b[KQRBN]?[a-h][1-8]\b/);
        expect(line, line).not.toMatch(/[+-]\d+(\.\d+)?/);
      }
    }
  });
});

describe('andrea: hygiene over every authored string', () => {
  it('contains no banned word and no identity claim', () => {
    for (const text of everyAuthoredString()) {
      expect(bannedHits(text), text).toEqual([]);
      for (const pattern of IDENTITY) expect(text, text).not.toMatch(pattern);
    }
  });

  it('never uses more than two exclamation marks in one string', () => {
    for (const text of everyAuthoredString()) expect(bangs(text), text).toBeLessThanOrEqual(2);
  });
});

describe('andrea: frames', () => {
  it('overrides verdict, lesson, swing, best_move, define and her signature kinds', () => {
    for (const kind of ['verdict', 'lesson', 'swing', 'best_move', 'define', 'hangs', 'forked', 'missed_capture', 'ignored_threat'] as const) {
      expect(andrea.frames[kind], kind).toBeTypeOf('function');
    }
  });

  it('gives every frame at least three variants over every sample', () => {
    for (const [p, ctx] of SAMPLES) {
      const variants = andrea.frames[p.kind]!(p, ctx);
      expect(variants.length, `${p.kind} ${JSON.stringify(p.args)}`).toBeGreaterThanOrEqual(3);
      for (const v of variants) expect(v.trim().length, p.kind).toBeGreaterThan(0);
    }
  });

  it('only names chess tokens through ctx.refer, ctx.square and ctx.move', () => {
    const tagged: RenderContext = {
      ...fakeCtx,
      refer: (piece) => `<R:${piece.piece}${piece.square}>`,
      square: (sq) => `<S:${sq}>`,
      move: (san) => `<M:${san}>`,
    };
    for (const [p] of SAMPLES) {
      for (const v of andrea.frames[p.kind]!(p, tagged)) {
        const outside = v.replace(/<[RSM]:[^>]*>/g, '');
        expect(outside, v).not.toMatch(/\b[KQRBN]?[a-h][1-8]\b/);
      }
    }
  });

  it('headlines are questions or short and fit the sixty-character cap', () => {
    for (const [p, ctx] of SAMPLES.filter(([q]) => q.kind === 'verdict')) {
      for (const v of andrea.frames.verdict!(p, ctx)) {
        expect(v.length, v).toBeLessThanOrEqual(60);
      }
    }
    const blunder = andrea.frames.verdict!(prop('verdict', 'headline', { san: 'Nd7', classification: 'blunder', square: 'c5' }), fakeCtx);
    expect(blunder[0]).toBe('Okay wait, c5 was open?');
    expect(blunder.filter((v) => v.includes('?')).length).toBeGreaterThanOrEqual(3);
  });

  it('best_move always names the move', () => {
    for (const v of andrea.frames.best_move!(prop('best_move', 'betterWas', { move: 'Be6', san: 'Nd7', played: false, lead: 'walked_into_fork' }), fakeCtx)) {
      expect(v).toContain('Be6');
      expect(v).not.toContain('Nd7');
    }
  });

  it('lesson agrees and then redirects to chat', () => {
    for (const v of andrea.frames.lesson!(prop('lesson', 'lesson', { concept: 'check_landing_square' }), fakeCtx)) {
      expect(v).toMatch(/^Glance at the empty squares on your own side before you commit a piece\./);
      expect(v).toMatch(/\b(chat|you guys)\b/i);
    }
  });

  it('swing admits the loss then jokes, and deflects blame in at most one variant', () => {
    const big = andrea.frames.swing!(prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 18 }), fakeCtx);
    expect(big.filter((v) => /chat's fault|my sister|I was late/i.test(v)).length).toBe(1);
    expect(big.some((v) => /we have all done this|same|every single game/i.test(v))).toBe(true);
    // Feelings, not numbers.
    for (const v of big) expect(v).not.toMatch(/\d/);
  });

  it('define never says the banned word even when asked to define it', () => {
    const z = andrea.frames.define!(prop('define', 'lesson', { term: 'zugzwang' }), fakeCtx);
    for (const v of z) expect(bannedHits(v)).toEqual([]);
  });
});

describe('andrea: reaction ladder', () => {
  const godCount = (s: string) => (s.match(/oh god/gi) ?? []).length;

  it('escalates in repeats with epLoss and hard-cuts to the reset above 0.3', () => {
    const losses = [0, 0.01, 0.03, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.31, 0.5, 0.9];
    let last = -1;
    for (const loss of losses) {
      const r = andreaReaction(loss, 'walked_into_fork');
      const n = godCount(r);
      expect(n, `epLoss ${loss}`).toBeGreaterThanOrEqual(last);
      last = n;
      if (loss > 0.3 || loss === 0.3) expect(r, `epLoss ${loss}`).toMatch(/Okay, let me think\.$/);
      else expect(r).not.toMatch(/let me think/);
    }
    expect(godCount(andreaReaction(0.31, 'hung_piece'))).toBe(4);
    expect(godCount(andreaReaction(0.2, 'hung_piece'))).toBe(3);
    expect(godCount(andreaReaction(0.1, 'hung_piece'))).toBe(2);
    expect(godCount(andreaReaction(0.05, 'hung_piece'))).toBe(1);
    expect(andreaReaction(0, 'best')).toBe('');
  });

  it('puts exactly one ALL-CAPS peak in the blunder reaction', () => {
    expect(andreaReaction(0.31, 'walked_into_fork').match(/\b[A-Z]{2,}\b/g)).toEqual(['OH', 'GOD']);
    expect(andrea.prosody.reaction).toBe(andreaReaction);
  });

  it('closes losses with the reset and praise with a clip', () => {
    expect(andrea.prosody.closer('walked_into_fork')).toBe('Okay, go agane.');
    expect(andrea.prosody.closer('sound_sacrifice')).toBe('Clip that.');
    expect(andrea.prosody.closer('book')).toBe('');
  });
});

describe('andrea: shape', () => {
  const note = (over: Partial<Record<Slot, string>>): Record<Slot, string> => ({
    headline: 'Nd7? Bro.',
    whatHappened: 'The knight goes to d7.',
    whyItMatters: 'It is rough.',
    betterWas: 'Be6.',
    lesson: 'Look first.',
    ...over,
  });

  it('caps exclamation marks at two across the whole note', () => {
    const out = andreaShape(note({ headline: 'Nd7! Bro!', whatHappened: 'No! No! No!', lesson: 'Chat, look first!' }), fakeCtx);
    const all = SLOTS.map((s) => out[s]).join(' ');
    expect(bangs(all)).toBe(2);
    expect(out.headline).toBe('Nd7! Bro!');
    expect(out.whatHappened).toBe('No. No. No.');
  });

  it('guarantees chat appears at least once', () => {
    const out = andreaShape(note({}), fakeCtx);
    expect(SLOTS.map((s) => out[s]).join(' ')).toMatch(/\bchat\b/i);
    expect(out.whatHappened).toBe('Okay chat, the knight goes to d7.');

    const has = andreaShape(note({ lesson: 'Chat, look first.' }), fakeCtx);
    expect(has.whatHappened).toBe('The knight goes to d7.');
  });

  it('does not lowercase a move or a colour when inserting chat', () => {
    expect(andreaShape(note({ whatHappened: 'Be6 was fine.' }), fakeCtx).whatHappened).toBe('Okay chat, Be6 was fine.');
    expect(andreaShape(note({ whatHappened: "White's knight hits d7." }), fakeCtx).whatHappened).toBe("Okay chat, White's knight hits d7.");
  });

  it('keeps only the first ALL-CAPS peak per note', () => {
    const out = andreaShape(
      note({
        headline: 'WAIT. Nd7?',
        whatHappened: 'Oh God, oh God, OH GOD. Okay, let me think. Chat.',
        lesson: 'GO AGANE.',
      }),
      fakeCtx,
    );
    expect(out.headline).toBe('WAIT. Nd7?');
    expect(out.whatHappened).toBe('Oh God, oh God, oh God. Okay, let me think. Chat.');
    expect(out.lesson).toBe('Go agane.');
  });

  it('is the grammar shape and leaves untouched notes alone', () => {
    expect(andrea.shape).toBe(andreaShape);
    const clean = note({ lesson: 'Chat, look first.' });
    expect(andreaShape(clean, fakeCtx)).toEqual(clean);
  });
});

describe('andrea: the shared example', () => {
  /** A minimal referrer: first mention in full, later mentions by piece name. */
  function referrer(): (piece: PieceRef) => string {
    const seen = new Set<string>();
    const names = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
    return (piece) => {
      const key = `${piece.piece}${piece.square}`;
      const owner = piece.color === 'w' ? "White's" : 'the';
      if (seen.has(key)) return `the ${names[piece.piece]}`;
      seen.add(key);
      return `${owner} ${names[piece.piece]} on ${piece.square}`;
    };
  }

  it('renders ply 36 Nd7 through the frames per design §7', () => {
    const epLoss = 0.31;
    const lead: SituationKind = 'walked_into_fork';

    const words = (slots: Record<Slot, string>) => SLOTS.map((s) => slots[s]).join(' ').split(/\s+/).length;

    /** §7 props; the supporting observation (weight 0.6) is the first to go when re-planning under budget. */
    const assemble = (withSupport: boolean): Record<Slot, string> => {
      const ctx: RenderContext = { ...fakeCtx, refer: referrer() };
      const render = (p: Proposition) => ctx.pick(andrea.frames[p.kind]!(p, ctx));
      const headline = render(prop('verdict', 'headline', { san: 'Nd7', classification: 'blunder', square: 'c5', winBefore: 52, winAfter: 18 }));
      const observation = [
        render(prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] })),
        withSupport ? render(prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [] })) : '',
      ].filter(Boolean).join(' ');
      const reaction = andrea.prosody.reaction(epLoss, lead);
      const whatHappened = [reaction, observation].filter(Boolean).join(' ');
      const whyItMatters = render(prop('swing', 'whyItMatters', { winBefore: 52, winAfter: 18 }, 'consequence'));
      const betterWas = render(prop('best_move', 'betterWas', { move: 'Be6', san: 'Nd7', played: false, lead: 'walked_into_fork' }, 'counterfactual'));
      const lessonText = [
        render(prop('lesson', 'lesson', { concept: 'check_landing_square' }, 'advice')),
        andrea.prosody.closer(lead),
      ].filter(Boolean).join(' ');
      return andrea.shape({ headline, whatHappened, whyItMatters, betterWas, lesson: lessonText }, ctx);
    };

    const full = assemble(true);
    const slots = words(full) <= persona.budgets.words ? full : assemble(false);
    console.log('[andrea · shared example]');
    for (const slot of SLOTS) console.log(`  ${slot}: ${slots[slot]}`);

    const all = SLOTS.map((s) => slots[s]).join(' ');
    expect(slots.headline).toBe('Okay wait, c5 was open?');
    expect(slots.headline.length).toBeLessThanOrEqual(60);
    expect(slots.whatHappened).toMatch(/^Oh God, oh God, oh God, OH GOD\. Okay, let me think\./);
    expect(slots.whatHappened).toContain("White's knight on c5");
    expect(slots.whatHappened).toContain('the knight on d7');
    expect(slots.whatHappened).toContain('the bishop on b7');
    expect(slots.betterWas).toContain('Be6');
    expect(slots.lesson).toMatch(/Okay, go agane\.$/);
    expect(all).toMatch(/\bchat\b/i);
    expect(bangs(all)).toBeLessThanOrEqual(persona.budgets.exclamations);
    expect(all.match(/\b[A-Z]{2,}(?:[ ,]+[A-Z]{2,})*\b/g)).toEqual(['OH GOD']);
    expect(bannedHits(all)).toEqual([]);
    for (const pattern of IDENTITY) expect(all).not.toMatch(pattern);
    // Only the facts' tokens may appear.
    const tokens = all.match(/\b[KQRBN]?[a-h][1-8]\b/g) ?? [];
    for (const t of tokens) expect(['Nd7', 'Be6', 'c5', 'd7', 'b7'], t).toContain(t);
    expect(words(slots)).toBeLessThanOrEqual(persona.budgets.words);
    // The weight-1 props alone must fit, or the realiser could never satisfy the budget.
    expect(words(assemble(false))).toBeLessThanOrEqual(persona.budgets.words);
  });
});
