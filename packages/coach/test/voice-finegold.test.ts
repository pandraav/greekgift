import type { PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { PropKind, Proposition, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { finegold } from '../src/voices/finegold.ts';

/**
 * Ben Finegold's voice rules as assertions. The realiser is built in parallel,
 * so nothing here goes through `realise`: the frames are called directly with
 * a fake `RenderContext` and the shared example is assembled per design §7.
 */

const persona = findPersona('finegold');

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

/** The hedges his banned list spells out, plus the everyday ones. */
const HEDGES = /\b(one might argue|arguably|it seems|in my opinion|maybe|perhaps|probably|i think|sort of|kind of)\b/i;

const Nc5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };
const Nd7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const Bb7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };
const Qd8: PieceRef = { piece: 'Q', square: 'd8', color: 'b' };

const ctx: RenderContext = {
  lexicon: finegold.lexicon,
  syntax: finegold.syntax,
  audience: 'intermediate',
  refer: (piece) => `the ${finegold.lexicon.pieceNames[piece.piece]} on ${piece.square}`,
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
  prop('missed_capture', { target: Nd7, value: 3 }),
  prop('back_rank', { side: 'b' }),
  prop('quiet_loss', { materialGain: 1 }),
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
    const frame = finegold.frames[p.kind];
    return frame ? frame(p, ctx) : [];
  });

/** Every string the voice can say: events, frame variants, reactions, closers. */
const corpus = (): string[] => {
  const leads: SituationKind[] = ['hung_piece', 'walked_into_fork', 'quiet_loss', 'best', 'sound_sacrifice'];
  const prosody = leads.flatMap((lead) => [
    ...[0, 0.03, 0.07, 0.15, 0.3, 0.6].map((loss) => finegold.prosody.reaction(loss, lead)),
    finegold.prosody.closer(lead),
  ]);
  return [...Object.values(finegold.events).flat(), ...frameOutputs(), ...prosody].filter(Boolean);
};

const containsBanned = (text: string, word: string): boolean =>
  /\s/.test(word)
    ? text.toLowerCase().includes(word.toLowerCase())
    : new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

describe('finegold grammar', () => {
  it('starts from the compiled persona', () => {
    expect(finegold.id).toBe('finegold');
    expect(finegold.budgets).toEqual(persona.budgets);
    expect(finegold.banned).toEqual(persona.banned);
    expect(finegold.prosody.exclamations).toBe(0);
  });

  it('has every trigger with at least three variants, the first from the spec', () => {
    for (const trigger of TRIGGERS) {
      const lines = finegold.events[trigger];
      expect(lines, trigger).toBeDefined();
      expect(lines!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(lines![0], trigger).toBe(persona.lines[trigger]);
      expect(new Set(lines).size, trigger).toBe(lines!.length);
    }
    expect(finegold.events.random![0]).toBe('Nothing.');
  });

  it('addresses you at home, allows fragments, puts the verdict first', () => {
    expect(finegold.lexicon.address).toBe('you at home');
    expect(finegold.lexicon.fillers).toEqual([]);
    expect(finegold.lexicon.intensifiers).toEqual([]);
    expect(finegold.syntax.fragments).toBe(true);
    // The reaction supplies the absolute; a verdict word on top read as "Terrible. Blunder."
    expect(finegold.syntax.verdictFirst).toBe(false);
    expect(finegold.syntax.questionRate).toBe(0);
  });

  it('overrides the required frames and the signature kinds', () => {
    for (const kind of ['verdict', 'lesson', 'swing', 'best_move', 'hangs', 'missed_capture', 'back_rank', 'quiet_loss']) {
      expect(finegold.frames[kind as PropKind], kind).toBeTypeOf('function');
    }
  });

  it('every overridden frame is sampled and yields at least three distinct variants', () => {
    for (const kind of Object.keys(finegold.frames)) {
      expect(SAMPLES.some((p) => p.kind === kind), `sample for ${kind}`).toBe(true);
    }
    for (const p of SAMPLES) {
      const out = finegold.frames[p.kind]!(p, ctx);
      expect(out.length, `${p.kind} ${JSON.stringify(p.args)}`).toBeGreaterThanOrEqual(3);
      expect(new Set(out).size, p.kind).toBe(out.length);
      for (const s of out) expect(s, p.kind).toMatch(/^[A-Z0-9]/);
    }
  });

  it('never says a banned word, hedges, apologises, or claims an identity', () => {
    for (const text of corpus()) {
      for (const word of persona.banned) {
        expect(containsBanned(text, word), `${JSON.stringify(text)} contains ${word}`).toBe(false);
      }
      for (const pattern of IDENTITY) {
        expect(pattern.test(text), `${JSON.stringify(text)} matches ${pattern}`).toBe(false);
      }
      expect(text, text).not.toMatch(HEDGES);
      expect(text, text).not.toMatch(/\b(sorry|apologi[sz]e|you can do it|believe in yourself|great effort)\b/i);
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('never uses an exclamation mark or a question mark', () => {
    for (const text of corpus()) {
      expect(text, text).not.toContain('!');
      expect(text, text).not.toContain('?');
    }
  });

  it('gives absolute verdicts: single words are complete sentences', () => {
    const verdicts = SAMPLES.filter((p) => p.kind === 'verdict').flatMap((p) => finegold.frames.verdict!(p, ctx));
    expect(verdicts.some((v) => sentences(v).some((s) => wordCount(s) === 1))).toBe(true);
    const blunder = finegold.frames.verdict!(
      prop('verdict', { classification: 'blunder', move: 'Nd7' }, 'headline'),
      ctx,
    );
    expect(blunder[0]).toBe('Nd7. Terrible.');
    for (const v of verdicts) expect(v.length).toBeLessThanOrEqual(60);
  });

  it('ends every lesson with Okay. and exempts himself from the rule he states', () => {
    for (const concept of [...CONCEPTS, 'no_such_concept']) {
      const out = finegold.frames.lesson!(prop('lesson', { concept }, 'lesson'), ctx);
      for (const text of out) {
        expect(text, concept).toMatch(/Okay\.$/);
        expect(text, concept).not.toMatch(/Okay\. Okay\.$/);
        expect(sentences(text).length, concept).toBeGreaterThanOrEqual(2);
      }
      expect(out.some((text) => /\b(I|I'm|I'd|me|mine|my)\b/.test(text)), `${concept} exempts himself`).toBe(true);
    }
  });

  it('never lets an insult stand alone: blame frames carry the chess point', () => {
    const blame = SAMPLES.filter((p) => ['hangs', 'missed_capture', 'back_rank', 'quiet_loss', 'forked'].includes(p.kind));
    for (const p of blame) {
      for (const text of finegold.frames[p.kind]!(p, ctx)) {
        const chess = sentences(text).filter((s) => /\b(hang|attack|defend|take|took|free|square|king|rank|position|leaving|save|worse|tactic|piece|target)/i.test(s));
        expect(chess.length, text).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('shape strips ! and ? and appends Okay. to whatHappened and lesson only', () => {
    const shaped = finegold.shape(
      {
        headline: 'Nd7. Terrible!',
        whatHappened: 'What were you thinking? The knight is hanging',
        whyItMatters: 'Big swing!',
        betterWas: 'Be6!',
        lesson: 'Count the attackers. Okay.',
      },
      ctx,
    );
    for (const text of Object.values(shaped)) {
      expect(text).not.toContain('!');
      expect(text).not.toContain('?');
    }
    expect(shaped.headline).toBe('Nd7. Terrible.');
    expect(shaped.whatHappened).toBe('What were you thinking. The knight is hanging. Okay.');
    expect(shaped.lesson).toBe('Count the attackers. Okay.');
    expect(shaped.whyItMatters).toBe('Big swing.');
    expect(shaped.betterWas).toBe('Be6.');
    expect(finegold.shape(shaped, ctx)).toEqual(shaped);
  });

  it('reacts with one absolute and closes every lesson with Okay.', () => {
    expect(finegold.prosody.reaction(0.34, 'hung_piece')).toBe('Terrible.');
    expect(finegold.prosody.reaction(0.12, 'hung_piece')).toBe('Incorrect.');
    expect(finegold.prosody.reaction(0.06, 'quiet_loss')).toBe('Suspicious.');
    expect(finegold.prosody.reaction(0.01, 'hung_piece')).toBe('');
    expect(finegold.prosody.reaction(0, 'sound_sacrifice')).toBe('');
    expect(finegold.prosody.closer('hung_piece')).toBe('Okay.');
    expect(finegold.prosody.closer('best')).toBe('Okay.');
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
      const frame = finegold.frames[p.kind];
      expect(frame, p.kind).toBeDefined();
      const sentence = ctx.pick(frame!(p, ctx));
      slots[p.slot] = slots[p.slot] ? `${slots[p.slot]} ${sentence}` : sentence;
    }
    const reaction = finegold.prosody.reaction(0.34, lead);
    if (reaction) slots.whatHappened = `${reaction} ${slots.whatHappened}`;
    const closer = finegold.prosody.closer(lead);
    if (closer && !/\bokay\.$/i.test(slots.lesson)) slots.lesson = `${slots.lesson} ${closer}`;
    const note = finegold.shape(slots, ctx);

    console.log('[finegold] shared example\n' + Object.entries(note).map(([k, v]) => `  ${k}: ${v}`).join('\n'));

    for (const slot of Object.keys(note) as Slot[]) expect(note[slot].trim().length, slot).toBeGreaterThan(0);
    expect(note.headline.length).toBeLessThanOrEqual(60);
    expect(note.headline).toContain('Terrible.');
    expect(note.whatHappened).toMatch(/^Terrible\./);
    expect(note.whatHappened).toMatch(/Okay\.$/);
    expect(note.lesson).toMatch(/Okay\.$/);
    expect(note.betterWas).toContain('Be6');
    expect(wordCount(Object.values(note).join(' '))).toBeLessThanOrEqual(persona.budgets.words);
    expect(Object.values(note).join(' ')).not.toContain('!');
  });
});
