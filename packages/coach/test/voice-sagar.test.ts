import type { MoveFacts, PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { PropKind, Proposition, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { validate } from '../src/validate.ts';
import { sagar, sagarInternals } from '../src/voices/sagar.ts';

/**
 * Sagar Shah's voice rules, turned into assertions where a rule is checkable.
 * Nothing here touches the realiser: frames are rendered directly through a
 * fake RenderContext, exactly as design §8 describes the realiser doing it.
 */

const persona = findPersona('sagar');

const TRIGGERS: Trigger[] = [
  'reviewStart', 'brilliant', 'great', 'blunder', 'mistake', 'miss', 'bookExit', 'comeback',
  'collapse', 'highAccuracy', 'lowAccuracy', 'longGame', 'reviewEnd', 'random',
];

const KINDS: SituationKind[] = [
  'allowed_mate', 'missed_mate', 'hung_piece', 'under_defended', 'walked_into_fork',
  'walked_into_pin', 'walked_into_skewer', 'missed_capture', 'ignored_threat', 'created_fork',
  'created_discovered', 'trapped_piece', 'traded_behind', 'unsound_sacrifice', 'sound_sacrifice',
  'only_move', 'left_book', 'book', 'best', 'good', 'quiet_loss', 'back_rank', 'passed_pawn',
  'promotion', 'king_exposed', 'overloaded', 'zugzwang', 'fortress', 'mate_delivered',
];

const NAMES: Record<PieceRef['piece'], string> = {
  K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn',
};

/** refer → "the knight on d7", square/move → identity, pick → first variant. */
const ctx: RenderContext = {
  lexicon: sagar.lexicon,
  syntax: sagar.syntax,
  audience: 'intermediate',
  refer: (p) => `the ${NAMES[p.piece]} on ${p.square}`,
  square: (sq) => sq,
  move: (san) => san,
  pick: (variants) => variants[0]!,
};

const N_C5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };
const N_D7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const B_B7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };

const prop = (
  kind: PropKind,
  slot: Slot,
  args: Proposition['args'],
  weight = 1,
  role: Proposition['role'] = 'observation',
): Proposition => ({ kind, role, slot, args, weight });

/** The shared example, as the planner would lay it out (design §7). */
const exampleProps = (): Proposition[] => [
  prop('verdict', 'headline', { move: 'Nd7', classification: 'blunder', lead: 'walked_into_fork', ply: 36 }),
  prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] }),
  prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [] }, 0.6),
  prop('swing', 'whyItMatters', { before: 52, after: 18 }, 1, 'consequence'),
  prop('material_delta', 'whyItMatters', { gain: 3 }, 0.7, 'consequence'),
  prop('best_move', 'betterWas', { move: 'Be6' }, 1, 'counterfactual'),
  prop('lesson', 'lesson', { concept: 'check_landing_square', lead: 'walked_into_fork' }, 1, 'advice'),
];

/** Sample props, rich and empty, for every frame the voice overrides. */
const sampleProps = (): Proposition[] => [
  ...KINDS.map((lead) => prop('verdict', 'headline', { move: 'Nd7', classification: 'blunder', lead })),
  prop('verdict', 'headline', { move: 'Nd7', classification: 'blunder' }),
  prop('verdict', 'headline', {}),
  prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [] }),
  prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [B_B7] }),
  prop('hangs', 'whatHappened', { target: N_D7 }),
  prop('hangs', 'whatHappened', {}),
  prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] }),
  prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7, { piece: 'R', square: 'a8', color: 'b' }] }),
  prop('forked', 'whatHappened', {}),
  prop('swing', 'whyItMatters', { before: 52, after: 18 }),
  prop('swing', 'whyItMatters', { before: 18, after: 52 }),
  prop('swing', 'whyItMatters', { before: 50, after: 51 }),
  prop('swing', 'whyItMatters', {}),
  prop('material_delta', 'whyItMatters', { gain: 3 }),
  prop('material_delta', 'whyItMatters', { gain: 1 }),
  prop('material_delta', 'whyItMatters', { gain: 9 }),
  prop('best_move', 'betterWas', { move: 'Be6' }),
  prop('best_move', 'betterWas', {}),
  prop('best_does', 'betterWas', { move: 'Be6', captures: N_C5, check: true }),
  prop('best_does', 'betterWas', { move: 'Qh5', mateIn: 2 }),
  prop('best_does', 'betterWas', { move: 'Nf3', forks: [N_D7, B_B7] }),
  prop('best_does', 'betterWas', { move: 'Be6' }),
  ...['fork', 'pin', 'skewer', 'discovered attack', 'zugzwang', 'fortress', 'back rank', 'passed pawn', 'overloaded', 'unknown']
    .map((term) => prop('define', 'lesson', { term })),
  ...[
    'check_landing_square', 'count_attackers', 'look_for_captures', 'checks_first', 'defend_back_rank',
    'see_their_threat', 'dont_trade_behind', 'push_the_passer', 'keep_the_shield', 'one_defender_two_jobs',
    'keep_the_tension', 'book_ends_here', 'remember_this', 'unknown',
  ].map((concept) => prop('lesson', 'lesson', { concept })),
];

/** Every string the voice can author, for the lexical checks. */
function authored(): string[] {
  const out: string[] = [];
  for (const lines of Object.values(sagar.events)) out.push(...lines);
  for (const p of sampleProps()) out.push(...sagar.frames[p.kind]!(p, ctx));
  for (const kind of KINDS) {
    out.push(sagar.prosody.closer(kind));
    for (const loss of [0, 0.05, 0.1, 0.34]) out.push(sagar.prosody.reaction(loss, kind));
  }
  return out.filter(Boolean);
}

/** The validator's own banned-word rule: phrases by inclusion, words by boundary. */
function bannedHits(text: string): string[] {
  const lower = text.toLowerCase();
  return persona.banned.filter((word) => {
    const bare = word.replace(/^"|"$/g, '');
    return /\s/.test(bare)
      ? lower.includes(bare.toLowerCase())
      : new RegExp(`\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  });
}

const IDENTITY = [
  /\bi am (?:the )?(?:im|gm|international master|grandmaster)\b/i,
  /\bmy (?:youtube |twitch )?channel\b/i,
  /\bsubscribe\b/i,
  /\bin my game against\b/i,
  /\bwhen i played\b/i,
];

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const exclamations = (s: string) => (s.match(/!/g) ?? []).length;

const EMPTY: Record<Slot, string> = {
  headline: '', whatHappened: '', whyItMatters: '', betterWas: '', lesson: '',
};

/**
 * Design §8 assembly, done by hand: frames per slot in plan order, reaction
 * opening whatHappened, closer ending lesson, shape, then budget enforced by
 * dropping the lightest props and never by cutting words.
 */
function render(props: Proposition[], epLoss: number, lead: SituationKind): Record<Slot, string> {
  const assemble = (kept: Proposition[]) => {
    const slots = { ...EMPTY };
    for (const p of kept) {
      const frame = sagar.frames[p.kind];
      expect(frame, `frame for ${p.kind}`).toBeDefined();
      const sentence = ctx.pick(frame!(p, ctx));
      slots[p.slot] = [slots[p.slot], sentence].filter(Boolean).join(' ');
    }
    const reaction = sagar.prosody.reaction(epLoss, lead);
    if (reaction) slots.whatHappened = `${reaction} ${slots.whatHappened}`.trim();
    const closer = sagar.prosody.closer(lead);
    if (closer) slots.lesson = `${slots.lesson} ${closer}`.trim();
    return sagar.shape(slots, ctx);
  };

  let kept = [...props];
  let out = assemble(kept);
  while (countWords(Object.values(out).join(' ')) > sagar.budgets.words) {
    const droppable = kept.filter((p) => p.weight < 1).sort((a, b) => a.weight - b.weight);
    if (droppable.length === 0) break;
    kept = kept.filter((p) => p !== droppable[0]);
    out = assemble(kept);
  }
  return out;
}

/** The spec's shared example, as facts, for the validator. */
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
    { kind: 'walked_into_fork', severity: 0.85 },
    { kind: 'hung_piece', severity: 0.72 },
  ],
  phase: 'middlegame',
  leftBook: true,
  audience: 'intermediate',
};

// ---------------------------------------------------------------------------

describe('sagar: grammar shape', () => {
  it('is the compiled persona, with its budgets and banned list', () => {
    expect(sagar.id).toBe('sagar');
    expect(sagar.budgets).toEqual(persona.budgets);
    expect(sagar.banned).toEqual(persona.banned);
    expect(sagar.prosody.exclamations).toBe(2);
  });

  it('speaks to friends, with a warm praise ladder and no fillers', () => {
    expect(sagar.lexicon.address).toBe('friends');
    expect(sagar.lexicon.captureVerb).toBe('takes');
    expect(sagar.lexicon.praise[0]).toBe('brilliant');
    expect(sagar.lexicon.praise).toContain('beautiful');
    expect(sagar.lexicon.praise).toContain('very nice');
    expect(sagar.lexicon.fillers).toEqual([]);
    expect(sagar.lexicon.blame).not.toContain('terrible');
  });

  it('asks a real question about a third of the time and never puts the verdict first', () => {
    expect(sagar.syntax.questionRate).toBeGreaterThanOrEqual(0.25);
    expect(sagar.syntax.questionRate).toBeLessThanOrEqual(0.35);
    expect(sagar.syntax.verdictFirst).toBe(false);
    expect(sagar.syntax.chainWithAnd).toBe(false);
    expect(sagar.syntax.fragments).toBe(false);
  });

  it('overrides the required frames and its signature kinds', () => {
    for (const kind of ['verdict', 'lesson', 'swing', 'best_move', 'define', 'forked', 'hangs', 'best_does'] as PropKind[]) {
      expect(sagar.frames[kind], kind).toBeTypeOf('function');
    }
  });
});

describe('sagar: events', () => {
  it('has at least three variants for every trigger, the first being the spec line', () => {
    for (const trigger of TRIGGERS) {
      const lines = sagar.events[trigger];
      expect(lines, trigger).toBeDefined();
      expect(lines!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(lines![0]).toBe(persona.lines[trigger]);
      expect(new Set(lines).size).toBe(lines!.length);
    }
  });

  it('opens by going through it together', () => {
    expect(sagar.events.reviewStart![0]).toMatch(/friends/);
  });
});

describe('sagar: lexicon rules over everything it can say', () => {
  const all = authored();

  it('authors a lot of text', () => {
    expect(all.length).toBeGreaterThan(150);
  });

  it('never uses a banned word or phrase', () => {
    for (const text of all) expect(bannedHits(text), text).toEqual([]);
  });

  it('never claims to be the person', () => {
    for (const text of all) {
      for (const pattern of IDENTITY) expect(pattern.test(text), text).toBe(false);
    }
  });

  it('earns at most two exclamation marks in any one string', () => {
    for (const text of all) expect(exclamations(text), text).toBeLessThanOrEqual(2);
  });

  it('never names a chess token except through the context', () => {
    // Every square in the authored strings must be one the fake context was given.
    const permitted = new Set(['c5', 'd7', 'b7', 'a8']);
    for (const text of all) {
      for (const sq of text.match(/\b[a-h][1-8]\b/g) ?? []) expect(permitted.has(sq), text).toBe(true);
    }
  });
});

describe('sagar: frames', () => {
  it('gives at least three distinct, terminated variants for every sample proposition', () => {
    for (const p of sampleProps()) {
      const variants = sagar.frames[p.kind]!(p, ctx);
      expect(variants.length, p.kind).toBeGreaterThanOrEqual(3);
      expect(new Set(variants).size, p.kind).toBe(variants.length);
      for (const v of variants) {
        expect(v.trim(), p.kind).not.toBe('');
        expect(v, p.kind).toMatch(/[.?!]$/);
      }
    }
  });

  it('opens the verdict with orientation and keeps every headline under sixty characters', () => {
    for (const lead of KINDS) {
      const variants = sagar.frames.verdict!(prop('verdict', 'headline', { move: 'Nd7', lead }), ctx);
      for (const v of variants) {
        expect(v.length, `${lead}: ${v}`).toBeLessThanOrEqual(60);
        expect(v, lead).not.toMatch(/^(blunder|mistake|terrible|bad)/i);
      }
    }
    const [first] = sagar.frames.verdict!(exampleProps()[0]!, ctx);
    expect(first).toBe('One square, two of your pieces.');
  });

  it('addresses the reader as friends or you in every lesson variant', () => {
    const lessons = sampleProps().filter((p) => p.kind === 'lesson');
    expect(lessons.length).toBeGreaterThan(10);
    for (const p of lessons) {
      for (const v of sagar.frames.lesson!(p, ctx)) {
        expect(v, String(p.args.concept)).toMatch(/\b(friends|you|your|yours)\b/i);
      }
    }
  });

  it('asks a real question and answers it in the lesson', () => {
    const [, question] = sagar.frames.lesson!(prop('lesson', 'lesson', { concept: 'check_landing_square' }), ctx);
    expect(question).toMatch(/\?/);
    expect(question!.split('?')[1]!.trim().length).toBeGreaterThan(10);
  });

  it('unpacks one technical term in the definition', () => {
    for (const term of ['fork', 'pin', 'skewer', 'zugzwang', 'back rank']) {
      for (const v of sagar.frames.define!(prop('define', 'lesson', { term }), ctx)) {
        expect(v.toLowerCase()).toContain(term);
        expect(countWords(v)).toBeGreaterThan(10);
      }
    }
    const [fork] = sagar.frames.define!(prop('define', 'lesson', { term: 'fork' }), ctx);
    expect(fork).toMatch(/two at once/);
  });

  it('describes the swing in words, never numbers', () => {
    const variants = sagar.frames.swing!(prop('swing', 'whyItMatters', { before: 52, after: 18 }), ctx);
    for (const v of variants) {
      expect(v).not.toMatch(/\d/);
      expect(v).toMatch(/a shade above even/);
      expect(v).toMatch(/under a fifth/);
    }
    expect(sagarInternals.describeWin(95)).toBe('almost completely winning');
    expect(sagarInternals.describeWin(5)).toBe('almost lost');
    expect(sagarInternals.describeMaterial(3)).toBe('a whole piece');
  });

  it('refers to pieces and squares only through the context', () => {
    const seen: string[] = [];
    const spy: RenderContext = {
      ...ctx,
      refer: (p) => { seen.push(`refer:${p.square}`); return `the ${NAMES[p.piece]} on ${p.square}`; },
      square: (sq) => { seen.push(`square:${sq}`); return sq; },
      move: (san) => { seen.push(`move:${san}`); return san; },
    };
    sagar.frames.forked!(prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] }), spy);
    expect(seen).toContain('refer:c5');
    expect(seen).toContain('square:d7');
    seen.length = 0;
    sagar.frames.best_move!(prop('best_move', 'betterWas', { move: 'Be6' }), spy);
    expect(seen).toContain('move:Be6');
  });

  it('names the best move in every best_move variant', () => {
    for (const v of sagar.frames.best_move!(prop('best_move', 'betterWas', { move: 'Be6' }), ctx)) {
      expect(v).toContain('Be6');
    }
  });

  it('explains what the best move does', () => {
    const [first] = sagar.frames.best_does!(
      prop('best_does', 'betterWas', { move: 'Bxe6', captures: N_C5, check: true }),
      ctx,
    );
    expect(first).toContain('Bxe6');
    expect(first).toContain('takes the knight on c5');
    expect(first).toContain('comes with check');
  });
});

describe('sagar: prosody', () => {
  it('reacts to a blunder with curiosity, not disappointment', () => {
    const line = sagar.prosody.reaction(0.34, 'walked_into_fork');
    expect(line).toMatch(/important moment/);
    expect(bannedHits(line)).toEqual([]);
    expect(sagar.prosody.reaction(0.01, 'good')).toBe('');
  });

  it('closes every lead on something carryable', () => {
    for (const kind of KINDS) {
      const line = sagar.prosody.closer(kind);
      expect(line, kind).not.toBe('');
      expect(line, kind).toMatch(/next game|carry|pattern|from here/i);
    }
  });
});

describe('sagar: shape', () => {
  it('caps the note at two exclamation marks', () => {
    const out = sagar.shape({
      ...EMPTY,
      headline: 'Beautiful!',
      whatHappened: 'Look at this!',
      whyItMatters: 'Fantastic!',
      lesson: 'Carry it into your next game!',
    }, ctx);
    expect(exclamations(Object.values(out).join(' '))).toBe(2);
    expect(out.headline).toBe('Beautiful!');
    expect(out.whyItMatters).toBe('Fantastic.');
  });

  it('softens dismissive verdicts', () => {
    const out = sagar.shape({ ...EMPTY, whatHappened: 'That was just a terrible move, obviously.', lesson: 'Next game, count.' }, ctx);
    expect(out.whatHappened).toBe('That was not the best move, clearly.');
    expect(bannedHits(out.whatHappened)).toEqual([]);
  });

  it('adds one carryable closing line when the lesson lacks one, and not otherwise', () => {
    const added = sagar.shape({ ...EMPTY, lesson: 'Count your attackers.' }, ctx);
    expect(added.lesson).toBe('Count your attackers. That is a pattern worth carrying into your next game.');
    const kept = sagar.shape({ ...EMPTY, lesson: 'Count your attackers next game.' }, ctx);
    expect(kept.lesson).toBe('Count your attackers next game.');
  });

  it('addresses the reader somewhere', () => {
    const out = sagar.shape({ ...EMPTY, whatHappened: 'A knight moved.', lesson: 'Count the attackers next game.' }, ctx);
    expect(out.lesson).toMatch(/^Friends, count/);
  });
});

describe('sagar: the shared example', () => {
  it('renders the spec example within budget and passes the validator', () => {
    const slots = render(exampleProps(), FACTS.epLoss, 'walked_into_fork');
    console.log(`[sagar] shared example\n${JSON.stringify(slots, null, 2)}`);

    expect(slots.headline).toBe('One square, two of your pieces.');
    expect(slots.whatHappened.toLowerCase()).toContain('the knight on c5');
    expect(slots.whatHappened).toContain('d7 and b7');
    expect(slots.whyItMatters).toContain('a shade above even');
    expect(slots.betterWas).toContain('Be6');
    expect(slots.lesson).toMatch(/next game/);

    const result = validate({ ply: 36, ...slots, source: 'rules' }, FACTS, persona);
    expect(result.violations).toEqual([]);
    expect(countWords(Object.values(slots).join(' '))).toBeLessThanOrEqual(sagar.budgets.words);
  });
});
