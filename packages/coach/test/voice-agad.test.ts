import type { MoveFacts, PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { PropKind, Proposition, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { validate } from '../src/validate.ts';
import { agad, agadInternals } from '../src/voices/agad.ts';

/**
 * agadmator's voice rules, turned into assertions where a rule is checkable.
 * Nothing here touches the realiser: frames are rendered directly through a
 * fake RenderContext, exactly as design §8 describes the realiser doing it.
 */

const persona = findPersona('agad');

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
  lexicon: agad.lexicon,
  syntax: agad.syntax,
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

const MATE_LINE = ['Qxh7+', 'Kxh7', 'Rh3#'];

/** Sample props, rich and empty, for every frame the voice overrides. */
const sampleProps = (): Proposition[] => [
  ...KINDS.map((lead) => prop('verdict', 'headline', { move: 'Nd7', classification: 'blunder', lead, ply: 36 })),
  ...KINDS.map((lead) => prop('verdict', 'headline', { move: 'Nd7', lead, moveNumber: 77 })),
  ...KINDS.map((lead) => prop('verdict', 'headline', { move: 'Nd7', lead })),
  prop('verdict', 'headline', { move: 'Nd7', classification: 'blunder', ply: 36 }),
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
  prop('swing', 'whyItMatters', { before: 50, after: 50 }),
  prop('swing', 'whyItMatters', {}),
  prop('material_delta', 'whyItMatters', { gain: 3 }),
  prop('material_delta', 'whyItMatters', { gain: 1 }),
  prop('material_delta', 'whyItMatters', { gain: 9 }),
  prop('best_move', 'betterWas', { move: 'Be6' }),
  prop('best_move', 'betterWas', {}),
  prop('best_line', 'betterWas', { line: ['Be6', 'Nxe6', 'fxe6', 'Nd5'] }),
  prop('best_line', 'betterWas', {}),
  prop('sacrifice', 'whatHappened', { piece: B_B7, netMaterial: -3, sound: true }),
  prop('sacrifice', 'whatHappened', { piece: B_B7, netMaterial: -3, sound: false }),
  prop('sacrifice', 'whatHappened', {}),
  prop('missed_mate', 'whyItMatters', { line: MATE_LINE }),
  prop('missed_mate', 'whyItMatters', {}),
  prop('mate_allowed', 'whyItMatters', { line: MATE_LINE }),
  prop('mate_allowed', 'whyItMatters', {}),
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
  for (const lines of Object.values(agad.events)) out.push(...lines);
  for (const p of sampleProps()) out.push(...agad.frames[p.kind]!(p, ctx));
  for (const kind of KINDS) {
    out.push(agad.prosody.closer(kind));
    for (const loss of [0, 0.05, 0.1, 0.34]) out.push(agad.prosody.reaction(loss, kind));
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

/** Rule 10: never a call to action. */
const CALL_TO_ACTION = /\b(like button|smash|subscribe|bell|notifications?|comment below|share this)\b/i;

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const countUh = (s: string) => (s.match(/\buh\b/gi) ?? []).length;

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
      const frame = agad.frames[p.kind];
      expect(frame, `frame for ${p.kind}`).toBeDefined();
      const sentence = ctx.pick(frame!(p, ctx));
      slots[p.slot] = [slots[p.slot], sentence].filter(Boolean).join(' ');
    }
    const reaction = agad.prosody.reaction(epLoss, lead);
    if (reaction) slots.whatHappened = `${reaction} ${slots.whatHappened}`.trim();
    const closer = agad.prosody.closer(lead);
    if (closer) slots.lesson = `${slots.lesson} ${closer}`.trim();
    return agad.shape(slots, ctx);
  };

  let kept = [...props];
  let out = assemble(kept);
  while (countWords(Object.values(out).join(' ')) > agad.budgets.words) {
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

describe('agad: grammar shape', () => {
  it('is the compiled persona, with its budgets and banned list', () => {
    expect(agad.id).toBe('agad');
    expect(agad.budgets).toEqual(persona.budgets);
    expect(agad.banned).toEqual(persona.banned);
    expect(agad.prosody.exclamations).toBe(0);
    expect(agad.budgets.exclamations).toBe(0);
  });

  it('captures on, addresses you guys, and leans on load-bearing filler', () => {
    expect(agad.lexicon.captureVerb).toBe('captures on');
    expect(agad.lexicon.address).toBe('you guys');
    expect(agad.lexicon.fillers).toContain('uh');
    expect(agad.lexicon.fillers).toContain('you know');
    expect(agad.lexicon.praise[0]).toBe('exquisite');
    expect(agad.lexicon.connectives[0]).toBe('and');
  });

  it('chains with and, allows very short fragments, never asks, never commands', () => {
    expect(agad.syntax.chainWithAnd).toBe(true);
    expect(agad.syntax.fragments).toBe(true);
    expect(agad.syntax.maxSentenceWords).toBeGreaterThanOrEqual(35);
    expect(agad.syntax.questionRate).toBe(0);
    expect(agad.syntax.imperativeAdvice).toBe(false);
    expect(agad.syntax.preferHere).toBe(true);
  });

  it('overrides the required frames and its signature kinds', () => {
    for (const kind of [
      'verdict', 'lesson', 'swing', 'best_move', 'define', 'sacrifice', 'missed_mate', 'mate_allowed', 'best_line',
    ] as PropKind[]) {
      expect(agad.frames[kind], kind).toBeTypeOf('function');
    }
  });
});

describe('agad: events', () => {
  it('has at least three variants for every trigger, the first being the spec line', () => {
    for (const trigger of TRIGGERS) {
      const lines = agad.events[trigger];
      expect(lines, trigger).toBeDefined();
      expect(lines!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(lines![0]).toBe(persona.lines[trigger]);
      expect(new Set(lines).size).toBe(lines!.length);
    }
  });

  it('opens every review with hello everyone and a superlative noun phrase', () => {
    for (const line of agad.events.reviewStart!) {
      expect(line).toMatch(/^Hello everyone, and welcome to a /);
    }
  });

  it('subverts the pause formula at least once', () => {
    const all = Object.values(agad.events).flat();
    expect(all.some((l) => /would ask you to pause .* but you guys already see it/.test(l))).toBe(true);
  });
});

describe('agad: lexicon rules over everything it can say', () => {
  const all = authored();

  it('authors a lot of text', () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it('never uses a banned word or phrase', () => {
    for (const text of all) expect(bannedHits(text), text).toEqual([]);
  });

  it('never says takes, and never uses an exclamation mark', () => {
    for (const text of all) {
      expect(text, text).not.toMatch(/\btakes?\b/i);
      expect(text, text).not.toContain('!');
    }
  });

  it('never claims to be the person and never calls the reader to action', () => {
    for (const text of all) {
      for (const pattern of IDENTITY) expect(pattern.test(text), text).toBe(false);
      expect(CALL_TO_ACTION.test(text), text).toBe(false);
    }
  });

  it('never insults a player: flourishes are about pieces', () => {
    for (const text of all) expect(text).not.toMatch(/\b(idiot|stupid|dumb|fool|moron|clown)\b/i);
  });

  it('never names a chess token except through the context', () => {
    const permitted = new Set(['c5', 'd7', 'b7', 'a8', 'e6', 'd5', 'h7', 'h3']);
    for (const text of all) {
      for (const sq of text.match(/\b[a-h][1-8]\b/g) ?? []) expect(permitted.has(sq), text).toBe(true);
    }
  });
});

describe('agad: frames', () => {
  it('gives at least three distinct, terminated variants for every sample proposition', () => {
    for (const p of sampleProps()) {
      const variants = agad.frames[p.kind]!(p, ctx);
      expect(variants.length, p.kind).toBeGreaterThanOrEqual(3);
      expect(new Set(variants).size, p.kind).toBe(variants.length);
      for (const v of variants) {
        expect(v.trim(), p.kind).not.toBe('');
        expect(v, p.kind).toMatch(/[.?]$/);
      }
    }
  });

  it('sets the scene in the headline with the move number in words, under sixty characters', () => {
    for (const lead of KINDS) {
      const cases: Proposition['args'][] = [{ lead, ply: 36 }, { lead, moveNumber: 77 }, { lead }];
      for (const args of cases) {
        for (const v of agad.frames.verdict!(prop('verdict', 'headline', { move: 'Nd7', ...args }), ctx)) {
          expect(v.length, `${lead}: ${v}`).toBeLessThanOrEqual(60);
          expect(v).not.toMatch(/\d/);
        }
      }
    }
    const [first] = agad.frames.verdict!(exampleProps()[0]!, ctx);
    expect(first).toBe('A quiet square, at move eighteen.');
    const [seventySeven] = agad.frames.verdict!(prop('verdict', 'headline', { lead: 'hung_piece', moveNumber: 77 }), ctx);
    expect(seventySeven).toContain('seventy-seven');
  });

  it('says the swing in words, fifty-two to eighteen', () => {
    const [first] = agad.frames.swing!(prop('swing', 'whyItMatters', { before: 52, after: 18 }), ctx);
    expect(first).toBe(
      'And it was here that the game effectively turned, the winning chances falling from fifty-two to eighteen, on a single move.',
    );
    expect(agadInternals.numberWords(40)).toBe('forty');
    expect(agadInternals.numberWords(100)).toBe('one hundred');
  });

  it('chants exchanges: captures on, captures, and the quiet move', () => {
    const line = agadInternals.chant(['Be6', 'Nxe6', 'fxe6', 'Nd5'], ctx);
    expect(line).toBe('Be6, knight captures on e6, captures, and Nd5');
    for (const v of agad.frames.best_line!(prop('best_line', 'betterWas', { line: ['Be6', 'Nxe6', 'fxe6'] }), ctx)) {
      expect(v).toContain('captures on e6');
      expect(v).not.toMatch(/\bNxe6\b/);
    }
  });

  it('deploys and subverts the pause formula on a missed mate', () => {
    const variants = agad.frames.missed_mate!(prop('missed_mate', 'whyItMatters', { line: MATE_LINE }), ctx);
    expect(variants[0]).toMatch(/^Feel free to pause/);
    expect(variants[1]).toMatch(/but you guys already see it/);
    for (const v of variants) expect(v.toLowerCase()).toContain('queen captures on h7');
  });

  it('closes an allowed mate with the resignation formula', () => {
    const variants = agad.frames.mate_allowed!(prop('mate_allowed', 'whyItMatters', { line: MATE_LINE }), ctx);
    expect(variants.some((v) => v.includes('nothing more to be done here'))).toBe(true);
  });

  it('is deadpan about pieces in the sacrifice, sound or not', () => {
    const [sound] = agad.frames.sacrifice!(prop('sacrifice', 'whatHappened', { piece: B_B7, netMaterial: -3, sound: true }), ctx);
    const [unsound] = agad.frames.sacrifice!(prop('sacrifice', 'whatHappened', { piece: B_B7, netMaterial: -3, sound: false }), ctx);
    expect(sound).toContain('the bishop on b7');
    expect(sound).toMatch(/exquisite/);
    expect(unsound).toMatch(/nothing comes back/);
  });

  it('sets the scene for a definition', () => {
    const [first] = agad.frames.define!(prop('define', 'lesson', { term: 'fork' }), ctx);
    expect(first).toMatch(/^For those of you who are new to this, a fork is /);
  });

  it('uses epithets', () => {
    const forked = agad.frames.forked!(prop('forked', 'whatHappened', { by: N_C5, targets: [N_D7, B_B7] }), ctx);
    expect(forked.some((v) => /none other than/i.test(v))).toBe(true);
    const best = agad.frames.best_move!(prop('best_move', 'betterWas', { move: 'Be6' }), ctx);
    expect(best.some((v) => /the one and only/i.test(v))).toBe(true);
    for (const v of best) expect(v).toContain('Be6');
  });

  it('never advises with an imperative in the lesson', () => {
    for (const p of sampleProps().filter((x) => x.kind === 'lesson')) {
      for (const v of agad.frames.lesson!(p, ctx)) {
        expect(v, String(p.args.concept)).not.toMatch(/^(Look|Count|Ask|Check|Remember|Keep|Push|Give|Take)\b/);
      }
    }
  });

  it('refers to pieces and squares only through the context', () => {
    const seen: string[] = [];
    const spy: RenderContext = {
      ...ctx,
      refer: (p) => { seen.push(`refer:${p.square}`); return `the ${NAMES[p.piece]} on ${p.square}`; },
      square: (sq) => { seen.push(`square:${sq}`); return sq; },
      move: (san) => { seen.push(`move:${san}`); return san; },
    };
    agad.frames.hangs!(prop('hangs', 'whatHappened', { target: N_D7, attackers: [N_C5], defenders: [] }), spy);
    expect(seen).toContain('refer:d7');
    expect(seen).toContain('refer:c5');
    expect(seen).toContain('square:d7');
  });
});

describe('agad: prosody', () => {
  it('reacts to a blunder with it was here, uh', () => {
    expect(agad.prosody.reaction(0.34, 'walked_into_fork')).toBe('And it was here, uh, that things went wrong.');
    expect(agad.prosody.reaction(0.01, 'good')).toBe('');
  });

  it('closes lost positions with there is nothing more to be done here, and only those', () => {
    expect(agad.prosody.closer('allowed_mate')).toBe(agadInternals.RESIGNATION);
    expect(agad.prosody.closer('hung_piece')).toBe(agadInternals.RESIGNATION);
    expect(agadInternals.RESIGNATION).toBe('There is nothing more to be done here.');
    for (const kind of KINDS) {
      if (agadInternals.LOST_LEADS.has(kind)) continue;
      expect(agad.prosody.closer(kind), kind).not.toContain('nothing more to be done');
    }
  });
});

describe('agad: shape', () => {
  it('rewrites takes to captures on, and SAN captures outside betterWas', () => {
    const out = agad.shape({
      ...EMPTY,
      whatHappened: 'The knight takes on d7. Then Nxe6 and fxe6.',
      betterWas: 'Bxe6 was the move.',
    }, ctx);
    expect(out.whatHappened).toBe('The knight captures on d7. Then knight captures on e6 and pawn captures on e6.');
    expect(out.betterWas).toBe('Bxe6 was the move.');
  });

  it('removes every exclamation mark', () => {
    const out = agad.shape({ ...EMPTY, headline: 'Exquisite!', lesson: 'Remarkable!' }, ctx);
    expect(Object.values(out).join(' ')).not.toContain('!');
    expect(out.headline).toBe('Exquisite.');
  });

  it('injects uh at roughly one per sixty words, and never stacks them', () => {
    const clause = 'the knight on c5 attacks d7 and b7 at the same moment, and only one of the two can be saved';
    const long = Array.from({ length: 4 }, () => clause).join(', and ');
    const slots = { ...EMPTY, whatHappened: long, whyItMatters: long, lesson: 'And that is the game.' };
    const total = countWords(Object.values(slots).join(' '));
    const out = agad.shape(slots, ctx);
    expect(countUh(Object.values(out).join(' '))).toBe(Math.floor(total / agadInternals.FILLER_EVERY));
    expect(Object.values(out).join(' ')).not.toMatch(/uh, uh/);
    expect(out.whatHappened).toMatch(/, uh, /);

    const short = agad.shape({ ...EMPTY, whatHappened: 'A quiet square, and a quiet cost.' }, ctx);
    expect(countUh(short.whatHappened)).toBe(0);

    const already = agad.shape({ ...EMPTY, whatHappened: `And it was here, uh, that things went wrong, ${long}` }, ctx);
    expect(countUh(already.whatHappened)).toBe(Math.max(1, Math.floor(countWords(already.whatHappened) / 60)));
  });
});

describe('agad: the shared example', () => {
  it('renders the spec example within budget and passes the validator', () => {
    const slots = render(exampleProps(), FACTS.epLoss, 'walked_into_fork');
    console.log(`[agad] shared example\n${JSON.stringify(slots, null, 2)}`);

    expect(slots.headline).toBe('A quiet square, at move eighteen.');
    expect(slots.whatHappened).toMatch(/^And it was here, uh, that things went wrong\./);
    expect(slots.whatHappened).toContain('d7 and b7');
    expect(slots.whyItMatters).toContain('fifty-two to eighteen');
    expect(slots.betterWas).toContain('Be6');
    expect(slots.lesson).toMatch(/couple of seconds/);
    const all = Object.values(slots).join(' ');
    expect(all).not.toContain('!');
    expect(all).not.toMatch(/\btakes\b/);

    const result = validate({ ply: 36, ...slots, source: 'rules' }, FACTS, persona);
    expect(result.violations).toEqual([]);
    expect(countWords(all)).toBeLessThanOrEqual(agad.budgets.words);
  });
});
