import type { PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { Proposition, PropKind, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { inventedTokens } from '../src/validate.ts';
import { gotham, gothamReaction, materialWords, shapeGotham } from '../src/voices/gotham.ts';

/**
 * GothamChess voice rules turned into assertions. These tests never touch the
 * realiser: frames are called directly with a fake RenderContext, and the
 * shape pass is run over hand-built slots.
 */

const persona = findPersona('gotham');

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

const NAMES: Record<PieceRef['piece'], string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
  P: 'pawn',
};

/** refer → "the knight on d7", square and move → identity, pick → first. */
const ctx: RenderContext = {
  lexicon: gotham.lexicon,
  syntax: gotham.syntax,
  audience: 'intermediate',
  refer: (piece) => `the ${NAMES[piece.piece]} on ${piece.square}`,
  square: (sq) => sq,
  move: (san) => san,
  pick: (variants) => variants[0]!,
};

/** Marks every chess token so an authored literal square or move stands out. */
const marked: RenderContext = {
  ...ctx,
  refer: () => 'PIECE',
  square: () => 'SQUARE',
  move: () => 'MOVE',
};

const Nc5: PieceRef = { piece: 'N', square: 'c5', color: 'w' };
const Nd7: PieceRef = { piece: 'N', square: 'd7', color: 'b' };
const Bb7: PieceRef = { piece: 'B', square: 'b7', color: 'b' };
const Qd8: PieceRef = { piece: 'Q', square: 'd8', color: 'b' };

const prop = (
  kind: PropKind,
  args: Proposition['args'],
  slot: Slot = 'whatHappened',
): Proposition => ({ kind, role: 'observation', slot, args, weight: 1 });

/** Sample props for every frame Gotham overrides, several shapes each. */
const SAMPLES: Proposition[] = [
  ...['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'].map(
    (classification) =>
      prop('verdict', { classification, move: 'Nd7', lead: 'walked_into_fork', epLoss: 0.3 }, 'headline'),
  ),
  prop('verdict', { move: 'Nd7', lead: 'hung_piece' }, 'headline'),
  prop('verdict', {}, 'headline'),
  prop('forked', { by: Nc5, targets: [Nd7, Bb7] }),
  prop('forked', { by: { ...Nc5, piece: 'B' }, targets: [Nd7, Bb7, Qd8] }),
  prop('forked', {}),
  prop('hangs', { piece: Nd7, attackers: [Nc5], defenders: [] }),
  prop('hangs', { piece: Qd8, attackers: [] }),
  prop('hangs', {}),
  prop('swing', { before: 52, after: 18 }, 'whyItMatters'),
  prop('swing', { before: 40, after: 75 }, 'whyItMatters'),
  prop('swing', {}, 'whyItMatters'),
  prop('material_delta', { materialGain: 3 }, 'whyItMatters'),
  prop('material_delta', { delta: 1 }, 'whyItMatters'),
  prop('material_delta', { delta: -9 }, 'whyItMatters'),
  prop('material_delta', { delta: 0 }, 'whyItMatters'),
  prop('best_move', { move: 'Be6' }, 'betterWas'),
  prop('best_move', {}, 'betterWas'),
  prop('best_does', { move: 'Be6', captures: Nc5, check: false, materialGain: 3 }, 'betterWas'),
  prop('best_does', { move: 'Qh5+', check: true, materialGain: 0 }, 'betterWas'),
  prop('best_does', { move: 'Qh7#', mateIn: 1, check: true, materialGain: 0 }, 'betterWas'),
  prop('best_does', { move: 'Nf5', forks: [Nd7, Bb7], check: false, materialGain: 3 }, 'betterWas'),
  prop('best_does', { move: 'a3', check: false, materialGain: 2 }, 'betterWas'),
  prop('best_does', { move: 'a3', check: false, materialGain: 0 }, 'betterWas'),
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
    'unknown_concept',
  ].map((concept) => prop('lesson', { concept }, 'lesson')),
  prop('lesson', { concept: 'check_landing_square', square: 'c5' }, 'lesson'),
];

// ---------------------------------------------------------------------------
// Helpers mirroring the validator's checks, so authored text is held to the
// same standard the realised note will be.
// ---------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function bannedHits(text: string, banned: string[] = persona.banned): string[] {
  const hits: string[] = [];
  for (const entry of banned) {
    for (const word of entry.split('/')) {
      const hit = /\s/.test(word)
        ? text.toLowerCase().includes(word.toLowerCase())
        : new RegExp(`\\b${escape(word)}\\b`, 'i').test(text);
      if (hit) hits.push(word);
    }
  }
  return hits;
}

const IDENTITY = [
  /\bi am (?:the )?(?:im|gm|international master|grandmaster)\b/i,
  /\bmy (?:youtube |twitch )?channel\b/i,
  /\bsubscribe\b/i,
  /\bin my game against\b/i,
  /\bwhen i played\b/i,
];

const identityHits = (text: string) => IDENTITY.filter((re) => re.test(text)).map((re) => re.source);

const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const count = (text: string, ch: string): number => text.split(ch).length - 1;

const frameFor = (kind: PropKind) => {
  const frame = gotham.frames[kind];
  if (!frame) throw new Error(`gotham has no frame for ${kind}`);
  return frame;
};

const OVERRIDDEN: PropKind[] = [
  'verdict',
  'forked',
  'hangs',
  'swing',
  'material_delta',
  'best_move',
  'best_does',
  'lesson',
];

// ---------------------------------------------------------------------------

describe('gotham grammar: identity and budgets', () => {
  it('is the compiled persona', () => {
    expect(gotham.id).toBe('gotham');
    expect(gotham.budgets).toEqual(persona.budgets);
    expect(gotham.banned).toEqual(persona.banned);
    expect(gotham.prosody.exclamations).toBe(persona.budgets.exclamations);
    expect(persona.budgets.exclamations).toBe(2);
    expect(persona.budgets.perSentence).toBe(12);
  });

  it('applies the voice rules to syntax and prosody', () => {
    expect(gotham.syntax.maxSentenceWords).toBe(12);
    expect(gotham.syntax.fragments).toBe(true);
    expect(gotham.syntax.chainWithAnd).toBe(false);
    expect(gotham.syntax.questionRate).toBeGreaterThan(0);
    expect(gotham.syntax.questionRate).toBeLessThan(1);
    expect(gotham.syntax.verdictFirst).toBe(false);
    expect(gotham.prosody.capsPeak).toBe(true);
  });

  it('draws the lexicon from the allowed list and the disambiguation table', () => {
    expect(gotham.lexicon.captureVerb).toBe('takes');
    expect(gotham.lexicon.address).toBe('bro');
    expect(gotham.lexicon.praise[0]).toBe('insane');
    expect(gotham.lexicon.fillers).toContain('okay so');
    expect(gotham.lexicon.fillers).toContain('look');
    // The allowed list permits "the horse" but the referring expression stays "knight",
    // as in the spec's own rendering.
    expect(gotham.lexicon.pieceNames.N).toBe('knight');
    const everything = [
      ...gotham.lexicon.intensifiers,
      ...gotham.lexicon.praise,
      ...gotham.lexicon.blame,
      ...gotham.lexicon.fillers,
      ...gotham.lexicon.connectives,
      gotham.lexicon.address,
      gotham.lexicon.captureVerb,
    ].join(' ');
    expect(bannedHits(everything)).toEqual([]);
  });

  it('overrides the required frames', () => {
    for (const kind of OVERRIDDEN) expect(gotham.frames[kind]).toBeTypeOf('function');
  });
});

describe('gotham events', () => {
  it('has every trigger with at least three variants, the first verbatim from the spec', () => {
    for (const trigger of TRIGGERS) {
      const variants = gotham.events[trigger];
      expect(variants, trigger).toBeDefined();
      expect(variants!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(variants![0], trigger).toBe(persona.lines[trigger]);
      expect(new Set(variants).size, trigger).toBe(variants!.length);
    }
  });

  it('keeps the added variants free of banned words and identity claims', () => {
    for (const trigger of TRIGGERS) {
      // The spec's own line is exempt: its "comeback" deliberately fumbles the
      // banned catchphrase. Every line written here is held to the list.
      for (const line of gotham.events[trigger]!.slice(1)) {
        expect(bannedHits(line), line).toEqual([]);
        expect(identityHits(line), line).toEqual([]);
        expect(count(line, '!'), line).toBeLessThanOrEqual(persona.budgets.exclamations);
        for (const s of sentences(line)) expect(wordCount(s), line).toBeLessThanOrEqual(12);
      }
    }
  });

  it('never states a move or a square in a flavour line', () => {
    for (const trigger of TRIGGERS) {
      for (const line of gotham.events[trigger]!) {
        expect(inventedTokens(line, new Set()), line).toEqual([]);
      }
    }
  });
});

describe('gotham frames', () => {
  it('return at least three distinct variants for every sample prop', () => {
    for (const p of SAMPLES) {
      const out = frameFor(p.kind)(p, ctx);
      expect(out.length, `${p.kind} ${JSON.stringify(p.args)}`).toBeGreaterThanOrEqual(3);
      expect(new Set(out).size, p.kind).toBe(out.length);
      for (const v of out) expect(v.trim(), p.kind).not.toBe('');
    }
  });

  it('never contain a banned word, an identity claim, or too many exclamations', () => {
    for (const p of SAMPLES) {
      for (const v of frameFor(p.kind)(p, ctx)) {
        expect(bannedHits(v), v).toEqual([]);
        expect(identityHits(v), v).toEqual([]);
        expect(count(v, '!'), v).toBeLessThanOrEqual(persona.budgets.exclamations);
      }
    }
  });

  it('only get chess tokens through ctx.refer, ctx.square and ctx.move', () => {
    for (const p of SAMPLES) {
      for (const v of frameFor(p.kind)(p, marked)) {
        expect(inventedTokens(v, new Set()), v).toEqual([]);
        expect(v, v).not.toMatch(/\b[a-h][1-8]\b/);
      }
    }
  });

  it('keep every sentence to twelve words, after shaping, with full referring expressions', () => {
    for (const p of SAMPLES) {
      for (const v of frameFor(p.kind)(p, ctx)) {
        const shaped = shapeGotham(
          { headline: '', whatHappened: '', whyItMatters: '', betterWas: '', lesson: v },
          ctx,
        ).lesson;
        for (const s of sentences(shaped)) expect(wordCount(s), shaped).toBeLessThanOrEqual(12);
      }
    }
  });

  it('keep headlines under sixty characters and open the blunder on a question aimed at the move', () => {
    const p = prop('verdict', { classification: 'blunder', move: 'Nd7', lead: 'walked_into_fork' }, 'headline');
    const out = frameFor('verdict')(p, ctx);
    for (const v of out) {
      expect(v.length).toBeLessThanOrEqual(60);
      expect(v).toContain('Nd7');
      expect(count(v, '?')).toBe(1);
    }
    const praise = frameFor('verdict')(prop('verdict', { classification: 'best', move: 'Be6' }, 'headline'), ctx);
    for (const v of praise) expect(count(v, '?')).toBe(0);
  });

  it('counts material in words, never numbers', () => {
    expect(materialWords(1)).toBe('a free pawn');
    expect(materialWords(2)).toBe('two pawns');
    expect(materialWords(3)).toBe('a whole piece');
    expect(materialWords(5)).toBe('a whole rook');
    expect(materialWords(9)).toBe('a whole queen');
    for (const delta of [1, 2, 3, 5, 9, -3]) {
      for (const v of frameFor('material_delta')(prop('material_delta', { delta }), ctx)) {
        expect(v).not.toMatch(/\d/);
      }
    }
  });

  it('names the best move in every better-was variant', () => {
    for (const v of frameFor('best_move')(prop('best_move', { move: 'Be6' }, 'betterWas'), ctx)) {
      expect(v).toContain('Be6');
    }
  });

  it('says "the horse" only when the forking piece is a knight', () => {
    const knight = frameFor('forked')(prop('forked', { by: Nc5, targets: [Nd7, Bb7] }), ctx).join(' ');
    const bishop = frameFor('forked')(
      prop('forked', { by: { ...Nc5, piece: 'B' }, targets: [Nd7, Bb7] }),
      ctx,
    ).join(' ');
    expect(knight).toMatch(/\bhorse\b/i);
    expect(bishop).not.toMatch(/\bhorse\b/i);
  });
});

describe('gotham prosody', () => {
  const LADDER = ['Oh.', 'Oh my god.', 'Oh my goodness.', 'Oh my goodness. Oh my goodness.'];

  it('climbs the reaction ladder with epLoss and never invents a stronger word', () => {
    expect(gothamReaction(0.05, 'hung_piece')).toBe('Oh.');
    expect(gothamReaction(0.099, 'quiet_loss')).toBe('Oh.');
    expect(gothamReaction(0.1, 'hung_piece')).toBe('Oh my god.');
    expect(gothamReaction(0.249, 'hung_piece')).toBe('Oh my god.');
    expect(gothamReaction(0.25, 'walked_into_fork')).toBe('Oh my goodness.');
    expect(gothamReaction(0.34, 'walked_into_fork')).toBe('Oh my goodness.');
    expect(gothamReaction(0.4, 'allowed_mate')).toBe('Oh my goodness. Oh my goodness.');
    expect(gothamReaction(0.9, 'allowed_mate')).toBe('Oh my goodness. Oh my goodness.');
    for (let loss = 0; loss <= 1; loss += 0.01) {
      expect(LADDER).toContain(gothamReaction(loss, 'hung_piece'));
    }
    expect(gotham.prosody.reaction).toBe(gothamReaction);
  });

  it('is monotone: a bigger loss never gets a lower rung', () => {
    let last = -1;
    for (let loss = 0; loss <= 1; loss += 0.005) {
      const rung = LADDER.indexOf(gothamReaction(loss, 'hung_piece'));
      expect(rung).toBeGreaterThanOrEqual(last);
      last = rung;
    }
  });

  it('stays quiet on praise', () => {
    const praise: SituationKind[] = ['best', 'good', 'book', 'sound_sacrifice', 'created_fork', 'mate_delivered'];
    for (const lead of praise) expect(gothamReaction(0, lead)).toBe('');
  });

  it('closes only the worst moments, without banned words', () => {
    expect(gotham.prosody.closer('allowed_mate')).toBe('Chess is hard.');
    expect(gotham.prosody.closer('walked_into_fork')).toBe('');
    expect(gotham.prosody.closer('best')).toBe('');
    for (const lead of ['allowed_mate', 'missed_mate', 'hung_piece'] as SituationKind[]) {
      expect(bannedHits(gotham.prosody.closer(lead))).toEqual([]);
    }
  });
});

describe('gotham shape', () => {
  const slots = (over: Partial<Record<Slot, string>>): Record<Slot, string> => ({
    headline: 'Nd7? No no no.',
    whatHappened: 'Oh my goodness. The knight drops in. Both of them.',
    whyItMatters: '52 down to 18, gone.',
    betterWas: 'Be6. That is the move.',
    lesson: 'Look at the empty squares first.',
    ...over,
  });

  it('caps exclamation marks at two across the note', () => {
    const out = shapeGotham(
      slots({ headline: 'Wow! Wow!', whatHappened: 'Boom! Gone! Both!', lesson: 'Look!' }),
      ctx,
    );
    const all = Object.values(out).join(' ');
    expect(count(all, '!')).toBe(2);
    expect(out.headline).toBe('Wow! Wow!');
    expect(out.whatHappened).toBe('Boom. Gone. Both.');
    expect(out.lesson).toBe('Look.');
  });

  it('keeps exactly one rhetorical question', () => {
    const out = shapeGotham(
      slots({ headline: 'Nd7? What is that?', whyItMatters: 'Why? Who knows?', lesson: 'Really?' }),
      ctx,
    );
    const all = Object.values(out).join(' ');
    expect(count(all, '?')).toBe(1);
    expect(out.headline).toBe('Nd7? What is that.');
  });

  it('spends the capitalised punchline once', () => {
    const out = shapeGotham(
      slots({ headline: 'c5 was RIGHT there.', whatHappened: 'BOTH of them. BOTH.', lesson: 'WOW.' }),
      ctx,
    );
    const all = Object.values(out).join(' ');
    expect(all.match(/\b[A-Z]{2,}\b/g)).toEqual(['RIGHT']);
    expect(out.whatHappened).toBe('Okay so. Both of them. Both.');
  });

  it('opens what happened on a reaction, never a verdict', () => {
    const out = shapeGotham(slots({ whatHappened: 'The knight drops in. Both of them.' }), ctx);
    expect(out.whatHappened).toMatch(/^Okay so\. The knight drops in/);
    const already = shapeGotham(slots({ whatHappened: 'Oh my god. The knight drops in.' }), ctx);
    expect(already.whatHappened).toBe('Oh my god. The knight drops in.');
    const look = shapeGotham(slots({ whatHappened: 'Look. The knight drops in.' }), ctx);
    expect(look.whatHappened).toBe('Look. The knight drops in.');
  });

  it('snaps back from a simile with "Anyway,"', () => {
    const out = shapeGotham(
      slots({ whyItMatters: 'That knight is sitting there like a parked car. It is gone.' }),
      ctx,
    );
    expect(out.whyItMatters).toBe('That knight is sitting there like a parked car. Anyway, it is gone.');
    const trailing = shapeGotham(slots({ whyItMatters: 'It moves like a shopping trolley.' }), ctx);
    expect(trailing.whyItMatters).toBe('It moves like a shopping trolley. Anyway.');
    const already = shapeGotham(
      slots({ whyItMatters: 'It moves like a shopping trolley. Anyway, it is gone.' }),
      ctx,
    );
    expect(already.whyItMatters).toBe('It moves like a shopping trolley. Anyway, it is gone.');
  });

  it('bursts any sentence over twelve words into fragments', () => {
    const long =
      'The knight on c5 attacks the knight on d7 and the bishop on b7, and only one of them can be saved.';
    const out = shapeGotham(slots({ whatHappened: long }), ctx);
    for (const s of sentences(out.whatHappened)) expect(wordCount(s), s).toBeLessThanOrEqual(12);
    expect(sentences(out.whatHappened).length).toBeGreaterThanOrEqual(3);
    expect(out.whatHappened.toLowerCase()).toContain('only one of them can be saved.');
    const comma = shapeGotham(
      slots({ whyItMatters: 'Okay so. You save one of the two pieces, and then you lose the other one anyway.' }),
      ctx,
    );
    expect(comma.whyItMatters).toBe(
      'Okay so. You save one of the two pieces. Then you lose the other one anyway.',
    );
  });

  it('leaves a note that already obeys the rules alone, apart from the opener', () => {
    const input = slots({});
    const out = shapeGotham(input, ctx);
    expect(out).toEqual(input);
  });
});

describe('gotham on the shared example', () => {
  it('renders the five slots through its own frames', () => {
    // The planner's budget rule (twelve words a prop, drop the lowest weight
    // until under sixty) leaves exactly the five weight-1 props for Gotham.
    const example: Record<Slot, Proposition[]> = {
      headline: [
        { kind: 'verdict', role: 'reaction', slot: 'headline', weight: 1,
          args: { classification: 'blunder', move: 'Nd7', lead: 'walked_into_fork', epLoss: 0.34 } },
      ],
      whatHappened: [
        { kind: 'forked', role: 'observation', slot: 'whatHappened', weight: 1,
          args: { by: Nc5, targets: [Nd7, Bb7] } },
      ],
      whyItMatters: [
        { kind: 'swing', role: 'consequence', slot: 'whyItMatters', weight: 1,
          args: { before: 52, after: 18 } },
      ],
      betterWas: [
        { kind: 'best_move', role: 'counterfactual', slot: 'betterWas', weight: 1, args: { move: 'Be6' } },
      ],
      lesson: [
        { kind: 'lesson', role: 'advice', slot: 'lesson', weight: 1,
          args: { concept: 'check_landing_square', square: 'c5' } },
      ],
    };

    // A minimal stand-in for the realiser's assembly: first variant of each
    // frame, reaction opens whatHappened, closer ends lesson, sentence case,
    // then the shape pass.
    // Sentence case, leaving a square such as "c5" alone at a sentence start.
    const cap = (s: string) =>
      s.replace(/(^|[.!?]\s+)([a-z])(?![1-8]\b)/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
    const raw = Object.fromEntries(
      (Object.keys(example) as Slot[]).map((slot) => [
        slot,
        cap(example[slot].map((p) => ctx.pick(frameFor(p.kind)(p, ctx))).join(' ')),
      ]),
    ) as Record<Slot, string>;
    const reaction = gotham.prosody.reaction(0.34, 'walked_into_fork');
    raw.whatHappened = `${reaction} ${raw.whatHappened}`.trim();
    const closer = gotham.prosody.closer('walked_into_fork');
    raw.lesson = `${raw.lesson} ${closer}`.trim();
    const out = gotham.shape(raw, ctx);

    console.log('\n[gotham] shared example');
    for (const slot of Object.keys(out) as Slot[]) console.log(`  ${slot}: ${out[slot]}`);

    const all = Object.values(out).join(' ');
    expect(out.headline.length).toBeLessThanOrEqual(60);
    expect(out.betterWas).toContain('Be6');
    expect(out.whatHappened).toMatch(/^Oh my goodness\./);
    expect(count(all, '!')).toBeLessThanOrEqual(2);
    expect(count(all, '?')).toBe(1);
    expect(all.match(/\b[A-Z]{2,}\b/g) ?? []).toHaveLength(0);
    expect(wordCount(all)).toBeLessThanOrEqual(persona.budgets.words);
    expect(bannedHits(all)).toEqual([]);
    expect(identityHits(all)).toEqual([]);
    expect(inventedTokens(all, new Set(['c5', 'd7', 'b7', 'Nd7', 'Be6', 'Nc5']))).toEqual([]);
    for (const slot of Object.values(out)) {
      expect(slot.trim()).not.toBe('');
      for (const s of sentences(slot)) expect(wordCount(s), s).toBeLessThanOrEqual(12);
    }
  });
});
