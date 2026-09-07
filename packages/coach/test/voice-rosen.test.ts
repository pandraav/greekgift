import type { PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { PropKind, Proposition, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { rosen } from '../src/voices/rosen.ts';

/**
 * Eric Rosen's voice rules as assertions. The realiser is built in parallel,
 * so nothing here goes through `realise`: the frames are called directly with
 * a fake `RenderContext` and the shared example is assembled per design §7.
 */

const persona = findPersona('rosen');

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

const CONCEPTS = [
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
];

const CLASSIFICATIONS = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** Phrases that would have the coach claim to be the real person (validate.ts). */
const IDENTITY = [
  /\bi am (?:the )?(?:im|gm|international master|grandmaster)\b/i,
  /\bmy (?:youtube |twitch )?channel\b/i,
  /\bsubscribe\b/i,
  /\bin my game against\b/i,
  /\bwhen i played\b/i,
];

const Nc5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };
const Nd7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const Bb7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };
const Qd8: PieceRef = { piece: 'Q', square: 'd8', color: 'b' };

const ctx: RenderContext = {
  lexicon: rosen.lexicon,
  syntax: rosen.syntax,
  audience: 'intermediate',
  refer: (piece) => `the ${rosen.lexicon.pieceNames[piece.piece]} on ${piece.square}`,
  square: (sq) => sq,
  move: (san) => san,
  pick: (variants) => variants[0]!,
};

const prop = (kind: PropKind, args: Proposition['args'], slot: Slot = 'whatHappened'): Proposition => ({
  kind,
  role: 'observation',
  slot,
  args,
  weight: 1,
});

/** One or more sample propositions for every frame the grammar overrides. */
const SAMPLES: Proposition[] = [
  ...CLASSIFICATIONS.map((classification) =>
    prop('verdict', { classification, move: 'Nd7', lead: 'walked_into_fork' }, 'headline'),
  ),
  prop('hangs', { target: Nd7, attackers: [Nc5], defenders: [] }),
  prop('hangs', { target: Nd7, attackers: [], defenders: [] }),
  prop('forked', { by: Nc5, targets: [Nd7, Bb7] }),
  prop('forked', { by: Nc5, targets: [Nd7, Bb7, Qd8] }),
  prop('forks', { by: Nc5, targets: [Nd7, Bb7] }),
  prop('trapped', { target: Nd7, attackers: [Nc5] }),
  prop('sacrifice', { piece: Nd7, netMaterial: -3, sound: true }),
  prop('sacrifice', { piece: Nd7, netMaterial: -3, sound: false }),
  prop('only_move', { margin: 0.2 }),
  prop('swing', { winBefore: 52, winAfter: 18, epLoss: 0.34 }, 'whyItMatters'),
  prop('swing', { winBefore: 40, winAfter: 61, epLoss: 0 }, 'whyItMatters'),
  prop('swing', {}, 'whyItMatters'),
  prop('best_move', { move: 'Be6' }, 'betterWas'),
  prop('best_does', { move: 'Be6', check: false, materialGain: 3, line: ['Be6'] }, 'betterWas'),
  prop('best_does', { move: 'Bxd7', captures: Nd7, check: false, materialGain: 3, line: [] }, 'betterWas'),
  prop('best_does', { move: 'Qh7', check: true, mateIn: 1, materialGain: 0, line: [] }, 'betterWas'),
  prop('best_does', { move: 'Nc5', forks: [Nd7, Bb7], check: false, materialGain: 3, line: [] }, 'betterWas'),
  prop('best_does', { move: 'Bb5', check: true, materialGain: 0, line: [] }, 'betterWas'),
  prop('best_does', { move: 'Be6', check: false, materialGain: 0, line: [] }, 'betterWas'),
  ...CONCEPTS.map((concept) => prop('lesson', { concept }, 'lesson')),
  prop('lesson', { concept: 'no_such_concept' }, 'lesson'),
];

const sentences = (text: string): string[] =>
  text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const frameOutputs = (): string[] =>
  SAMPLES.flatMap((p) => {
    const frame = rosen.frames[p.kind];
    return frame ? frame(p, ctx) : [];
  });

/** Every string the voice can say: events, frame variants, reactions, closers. */
const corpus = (): string[] => {
  const leads: SituationKind[] = ['hung_piece', 'walked_into_fork', 'quiet_loss', 'best', 'sound_sacrifice'];
  const prosody = leads.flatMap((lead) => [
    ...[0, 0.03, 0.07, 0.15, 0.3, 0.6].map((loss) => rosen.prosody.reaction(loss, lead)),
    rosen.prosody.closer(lead),
  ]);
  return [...Object.values(rosen.events).flat(), ...frameOutputs(), ...prosody].filter(Boolean);
};

const containsBanned = (text: string, word: string): boolean =>
  /\s/.test(word)
    ? text.toLowerCase().includes(word.toLowerCase())
    : new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

describe('rosen grammar', () => {
  it('starts from the compiled persona', () => {
    expect(rosen.id).toBe('rosen');
    expect(rosen.budgets).toEqual(persona.budgets);
    expect(rosen.banned).toEqual(persona.banned);
    expect(rosen.prosody.exclamations).toBe(1);
  });

  it('has every trigger with at least three variants, the first from the spec', () => {
    for (const trigger of TRIGGERS) {
      const lines = rosen.events[trigger];
      expect(lines, trigger).toBeDefined();
      expect(lines!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(lines![0], trigger).toBe(persona.lines[trigger]);
      expect(new Set(lines).size, trigger).toBe(lines!.length);
    }
  });

  it('rates on fun, drives with let’s, fills with yeah/okay/oh', () => {
    expect(rosen.lexicon.praise[0]).toBe('fun');
    expect(rosen.lexicon.fillers).toEqual(expect.arrayContaining(['yeah', 'okay', 'oh']));
    expect(rosen.syntax.maxSentenceWords).toBe(12);
    expect(rosen.syntax.imperativeAdvice).toBe(false);
    const lets = frameOutputs().filter((s) => /\blet's\b/i.test(s));
    expect(lets.length).toBeGreaterThan(20);
  });

  it('overrides the required frames and the signature kinds', () => {
    for (const kind of ['verdict', 'lesson', 'swing', 'best_move', 'sacrifice', 'only_move', 'trapped', 'forks']) {
      expect(rosen.frames[kind as PropKind], kind).toBeTypeOf('function');
    }
  });

  it('every overridden frame is sampled and yields at least three distinct variants', () => {
    for (const kind of Object.keys(rosen.frames)) {
      expect(SAMPLES.some((p) => p.kind === kind), `sample for ${kind}`).toBe(true);
    }
    for (const p of SAMPLES) {
      const out = rosen.frames[p.kind]!(p, ctx);
      expect(out.length, `${p.kind} ${JSON.stringify(p.args)}`).toBeGreaterThanOrEqual(3);
      expect(new Set(out).size, p.kind).toBe(out.length);
      for (const s of out) expect(s, p.kind).toMatch(/^[A-Z0-9]/);
    }
  });

  it('never says a banned word or claims an identity', () => {
    for (const text of corpus()) {
      for (const word of persona.banned) {
        expect(containsBanned(text, word), `${JSON.stringify(text)} contains ${word}`).toBe(false);
      }
      for (const pattern of IDENTITY) {
        expect(pattern.test(text), `${JSON.stringify(text)} matches ${pattern}`).toBe(false);
      }
      expect(text).not.toMatch(/\b(idiot|stupid|dumb|yikes|oof|terrible|awful|horrible)\b/i);
      expect(text.toLowerCase()).not.toContain("that's the idea");
    }
  });

  it('keeps every frame sentence to twelve words or fewer', () => {
    for (const text of frameOutputs()) {
      for (const s of sentences(text)) {
        expect(wordCount(s), JSON.stringify(s)).toBeLessThanOrEqual(12);
        expect(wordCount(s), JSON.stringify(s)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('spends at most one exclamation mark per authored string', () => {
    for (const text of corpus()) {
      expect((text.match(/!/g) ?? []).length, JSON.stringify(text)).toBeLessThanOrEqual(1);
    }
  });

  it('goes quieter under pressure: the reaction shortens as the loss grows', () => {
    const losses = [0.05, 0.12, 0.25, 0.5, 0.9];
    const reactions = losses.map((loss) => rosen.prosody.reaction(loss, 'hung_piece'));
    expect(reactions.every((r) => r.length > 0)).toBe(true);
    for (let i = 1; i < reactions.length; i++) {
      expect(reactions[i]!.length).toBeLessThanOrEqual(reactions[i - 1]!.length);
    }
    expect(reactions[reactions.length - 1]).toMatch(/^Oh/);
    expect(rosen.prosody.reaction(0.01, 'hung_piece')).toBe('');
    expect(rosen.prosody.reaction(0, 'sound_sacrifice')).toMatch(/nice/i);
    expect(rosen.prosody.closer('sound_sacrifice')).toBe('Fun.');
    expect(rosen.prosody.closer('hung_piece')).toBe('');
  });

  it('shape splits long sentences at connectives and prefixes one filler at most', () => {
    const long = 'The knight goes to d7, and suddenly c5 is available, and from there White hits d7 and b7 at the same time.';
    const shaped = rosen.shape(
      { headline: 'Oh no, Nd7.', whatHappened: long, whyItMatters: 'Wow! Wow! Wow!', betterWas: 'Be6.', lesson: 'x.' },
      ctx,
    );
    for (const s of sentences(shaped.whatHappened)) {
      expect(wordCount(s), JSON.stringify(s)).toBeLessThanOrEqual(12);
    }
    expect(shaped.whatHappened).toMatch(/^Okay\. The knight goes to d7/);
    expect(sentences(shaped.whatHappened).length).toBeGreaterThanOrEqual(3);
    expect(shaped.whatHappened).not.toMatch(/\bD7\b|\bC5\b|\bB7\b/);
    expect((Object.values(shaped).join(' ').match(/!/g) ?? []).length).toBe(1);

    const already = rosen.shape(
      { headline: 'h.', whatHappened: 'Oh no. The knight is gone.', whyItMatters: 'w.', betterWas: 'b.', lesson: 'l.' },
      ctx,
    );
    expect(already.whatHappened).toBe('Oh no. The knight is gone.');
  });

  it('renders the shared example (ply 36, Nd7) through its own frames', () => {
    const lead: SituationKind = 'walked_into_fork';
    const plan: Proposition[] = [
      prop('verdict', { classification: 'blunder', move: 'Nd7', lead }, 'headline'),
      prop('forked', { by: Nc5, targets: [Nd7, Bb7] }),
      { ...prop('hangs', { target: Nd7, attackers: [Nc5], defenders: [] }), weight: 0.6 },
      prop('swing', { winBefore: 52, winAfter: 18, epLoss: 0.34 }, 'whyItMatters'),
      prop('best_move', { move: 'Be6' }, 'betterWas'),
      prop('lesson', { concept: 'check_landing_square' }, 'lesson'),
    ];
    const slots: Record<Slot, string> = { headline: '', whatHappened: '', whyItMatters: '', betterWas: '', lesson: '' };
    for (const p of plan) {
      const frame = rosen.frames[p.kind];
      expect(frame, p.kind).toBeDefined();
      const sentence = ctx.pick(frame!(p, ctx));
      slots[p.slot] = slots[p.slot] ? `${slots[p.slot]} ${sentence}` : sentence;
    }
    const reaction = rosen.prosody.reaction(0.34, lead);
    if (reaction) slots.whatHappened = `${reaction} ${slots.whatHappened}`;
    const closer = rosen.prosody.closer(lead);
    if (closer) slots.lesson = `${slots.lesson} ${closer}`;
    const note = rosen.shape(slots, ctx);

    console.log('[rosen] shared example\n' + Object.entries(note).map(([k, v]) => `  ${k}: ${v}`).join('\n'));

    for (const slot of Object.keys(note) as Slot[]) expect(note[slot].trim().length, slot).toBeGreaterThan(0);
    expect(note.headline.length).toBeLessThanOrEqual(60);
    expect(note.headline).toMatch(/^Oh no/);
    expect(note.betterWas).toContain('Be6');
    expect(note.betterWas).toMatch(/Let's/);
    expect(note.whatHappened).toMatch(/^Oh no\./);
    expect(wordCount(Object.values(note).join(' '))).toBeLessThanOrEqual(persona.budgets.words);
    expect((Object.values(note).join(' ').match(/!/g) ?? []).length).toBeLessThanOrEqual(persona.budgets.exclamations);
    for (const text of Object.values(note)) {
      for (const s of sentences(text)) expect(wordCount(s), JSON.stringify(s)).toBeLessThanOrEqual(12);
    }
  });
});
