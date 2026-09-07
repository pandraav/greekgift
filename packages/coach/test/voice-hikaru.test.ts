import type { PieceRef, SituationKind } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import type { Proposition, PropKind, RenderContext, Slot } from '../src/contracts.ts';
import { findPersona, type Trigger } from '../src/personas.ts';
import { inventedTokens } from '../src/validate.ts';
import { hikaru, materialWords, shapeHikaru } from '../src/voices/hikaru.ts';

/**
 * Hikaru voice rules turned into assertions. These tests never touch the
 * realiser: frames are called directly with a fake RenderContext, and the
 * shape pass is run over hand-built slots.
 */

const persona = findPersona('hikaru');

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
  lexicon: hikaru.lexicon,
  syntax: hikaru.syntax,
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

const CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

const LEADS: SituationKind[] = [
  'allowed_mate', 'missed_mate', 'hung_piece', 'under_defended', 'walked_into_fork', 'walked_into_pin',
  'walked_into_skewer', 'missed_capture', 'ignored_threat', 'created_fork', 'created_discovered',
  'trapped_piece', 'traded_behind', 'unsound_sacrifice', 'sound_sacrifice', 'only_move', 'left_book',
  'book', 'best', 'good', 'quiet_loss', 'back_rank', 'passed_pawn', 'promotion', 'king_exposed',
  'overloaded', 'zugzwang', 'fortress', 'mate_delivered',
];

/** Sample props for every frame Hikaru overrides, several shapes each. */
const SAMPLES: Proposition[] = [
  ...CLASSES.map((classification) =>
    prop('verdict', { classification, move: 'Nd7', lead: 'walked_into_fork', epLoss: 0.3 }, 'headline'),
  ),
  ...LEADS.map((lead) => prop('verdict', { classification: 'blunder', move: 'Nd7', lead }, 'headline')),
  prop('verdict', { move: 'Nd7' }, 'headline'),
  prop('verdict', {}, 'headline'),
  prop('hangs', { piece: Nd7, attackers: [Nc5], defenders: [] }),
  prop('hangs', { piece: Qd8, attackers: [] }),
  prop('hangs', {}),
  prop('forked', { by: Nc5, targets: [Nd7, Bb7] }),
  prop('forked', {}),
  prop('missed_capture', { target: Qd8, value: 9 }),
  prop('missed_capture', {}),
  prop('swing', { before: 52, after: 18 }, 'whyItMatters'),
  prop('swing', { before: 80, after: 20 }, 'whyItMatters'),
  prop('swing', { before: 20, after: 60 }, 'whyItMatters'),
  prop('swing', {}, 'whyItMatters'),
  prop('material_delta', { materialGain: 3 }, 'whyItMatters'),
  prop('material_delta', { delta: 1 }, 'whyItMatters'),
  prop('material_delta', { delta: -9 }, 'whyItMatters'),
  prop('material_delta', { delta: 0 }, 'whyItMatters'),
  prop('best_move', { move: 'Be6' }, 'betterWas'),
  prop('best_move', {}, 'betterWas'),
  prop('best_does', { move: 'Be6', captures: Nc5, check: false, materialGain: 3 }, 'betterWas'),
  prop('best_does', { move: 'Qh5+', check: true, materialGain: 0 }, 'betterWas'),
  prop('best_does', { move: 'Qh7#', mateIn: 2, check: true, materialGain: 0 }, 'betterWas'),
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
// Helpers mirroring the validator's checks.
// ---------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function bannedHits(text: string, banned: string[] = persona.banned): string[] {
  const hits: string[] = [];
  for (const entry of banned) {
    // "damn/hell/crap" is one entry in the spec; each word is held separately.
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
  const frame = hikaru.frames[kind];
  if (!frame) throw new Error(`hikaru has no frame for ${kind}`);
  return frame;
};

const OVERRIDDEN: PropKind[] = [
  'verdict',
  'hangs',
  'forked',
  'missed_capture',
  'swing',
  'material_delta',
  'best_move',
  'best_does',
  'lesson',
];

/** Words that carry a verdict; one must sit in the first four words of a headline. */
const VERDICT_WORDS = new Set([
  'losing', 'loses', 'bad', 'fine', 'move', 'winning', 'worse', 'misses', 'mate', 'hangs', 'drops',
  'walks', 'ignores', 'traps', 'trades', 'fork', 'pin', 'skewer', 'threat', 'okay', 'simple', 'theory',
  'only', 'fortress', 'zugzwang', 'sac', 'works', 'not', 'open', 'weak', 'under-defended', 'passed',
  'promotes', 'free', 'defender', 'discovered', 'more', 'leaves', 'still', 'it', 'yeah',
]);

const firstWords = (text: string, n: number): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n);

// ---------------------------------------------------------------------------

describe('hikaru grammar: identity and budgets', () => {
  it('is the compiled persona', () => {
    expect(hikaru.id).toBe('hikaru');
    expect(hikaru.budgets).toEqual(persona.budgets);
    expect(hikaru.banned).toEqual(persona.banned);
    expect(hikaru.prosody.exclamations).toBe(persona.budgets.exclamations);
    expect(persona.budgets.exclamations).toBe(0);
    expect(persona.budgets.words).toBe(45);
  });

  it('applies the voice rules to syntax and prosody', () => {
    expect(hikaru.syntax.verdictFirst).toBe(true);
    expect(hikaru.syntax.preferHere).toBe(true);
    expect(hikaru.syntax.questionRate).toBe(0);
    expect(hikaru.syntax.chainWithAnd).toBe(false);
    expect(hikaru.syntax.imperativeAdvice).toBe(false);
    expect(hikaru.prosody.capsPeak).toBe(false);
    expect(hikaru.prosody.sentenceCase).toBe(true);
  });

  it('draws the lexicon from the allowed list and the disambiguation table', () => {
    expect(hikaru.lexicon.captureVerb).toBe('takes');
    expect(hikaru.lexicon.address).toBe('guys');
    expect(hikaru.lexicon.intensifiers).toEqual([]);
    expect(hikaru.lexicon.praise[0]).toBe('the move');
    expect(hikaru.lexicon.blame).toContain('terrible');
    expect(hikaru.lexicon.fillers).toContain('I mean');
    expect(hikaru.lexicon.pieceNames.N).toBe('knight');
    const everything = [
      ...hikaru.lexicon.praise,
      ...hikaru.lexicon.blame,
      ...hikaru.lexicon.fillers,
      ...hikaru.lexicon.connectives,
      hikaru.lexicon.address,
      hikaru.lexicon.captureVerb,
    ].join(' ');
    expect(bannedHits(everything)).toEqual([]);
  });

  it('overrides the required frames', () => {
    for (const kind of OVERRIDDEN) expect(hikaru.frames[kind]).toBeTypeOf('function');
  });
});

describe('hikaru events', () => {
  it('has every trigger with at least three variants, the first verbatim from the spec', () => {
    for (const trigger of TRIGGERS) {
      const variants = hikaru.events[trigger];
      expect(variants, trigger).toBeDefined();
      expect(variants!.length, trigger).toBeGreaterThanOrEqual(3);
      expect(variants![0], trigger).toBe(persona.lines[trigger]);
      expect(new Set(variants).size, trigger).toBe(variants!.length);
    }
  });

  it('keeps every line flat: no banned words, no identity claims, no "!" or "?"', () => {
    for (const trigger of TRIGGERS) {
      for (const line of hikaru.events[trigger]!) {
        expect(bannedHits(line), line).toEqual([]);
        expect(identityHits(line), line).toEqual([]);
        expect(count(line, '!'), line).toBe(0);
        expect(count(line, '?'), line).toBe(0);
        expect(line, line).not.toMatch(/\bvery\b/i);
      }
    }
  });

  it('never states a move or a square in a flavour line', () => {
    for (const trigger of TRIGGERS) {
      for (const line of hikaru.events[trigger]!) {
        expect(inventedTokens(line, new Set()), line).toEqual([]);
      }
    }
  });
});

describe('hikaru frames', () => {
  it('return at least three distinct variants for every sample prop', () => {
    for (const p of SAMPLES) {
      const out = frameFor(p.kind)(p, ctx);
      expect(out.length, `${p.kind} ${JSON.stringify(p.args)}`).toBeGreaterThanOrEqual(3);
      expect(new Set(out).size, `${p.kind} ${JSON.stringify(p.args)}`).toBe(out.length);
      for (const v of out) expect(v.trim(), p.kind).not.toBe('');
    }
  });

  it('never contain a banned word, an identity claim, an exclamation, a question or an intensifier', () => {
    for (const p of SAMPLES) {
      for (const v of frameFor(p.kind)(p, ctx)) {
        expect(bannedHits(v), v).toEqual([]);
        expect(identityHits(v), v).toEqual([]);
        expect(count(v, '!'), v).toBe(0);
        expect(count(v, '?'), v).toBe(0);
        expect(v, v).not.toMatch(/\b(?:very|really|extremely|incredibly)\b/i);
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

  it('keep every variant to two sentences', () => {
    for (const p of SAMPLES) {
      for (const v of frameFor(p.kind)(p, ctx)) {
        expect(sentences(v).length, v).toBeLessThanOrEqual(2);
      }
    }
  });

  it('put the verdict in the first four words of every headline', () => {
    const verdicts = SAMPLES.filter((p) => p.kind === 'verdict');
    expect(verdicts.length).toBeGreaterThan(30);
    for (const p of verdicts) {
      for (const v of frameFor('verdict')(p, ctx)) {
        expect(v.length, v).toBeLessThanOrEqual(60);
        const head = firstWords(v, 4);
        expect(head.some((w) => VERDICT_WORDS.has(w)), `${v} → ${head.join(' ')}`).toBe(true);
      }
    }
  });

  it('renders the shared example headline as the spec does', () => {
    const p = prop('verdict', { classification: 'blunder', move: 'Nd7', lead: 'walked_into_fork' }, 'headline');
    expect(frameFor('verdict')(p, ctx)[0]).toBe('Drops a piece to a fork.');
  });

  it('builds verdicts on "just"', () => {
    for (const cls of ['blunder', 'mistake', 'miss', 'great']) {
      const out = frameFor('verdict')(prop('verdict', { classification: cls, move: 'Nd7' }, 'headline'), ctx);
      expect(out.join(' '), cls).toMatch(/\bjust\b/);
    }
  });

  it('announces the best move with "let\'s go"', () => {
    for (const v of frameFor('best_move')(prop('best_move', { move: 'Be6' }, 'betterWas'), ctx)) {
      expect(v.toLowerCase()).toContain("let's go");
      expect(v).toContain('Be6');
    }
  });

  it('says what the best move does without defining anything', () => {
    const capture = frameFor('best_does')(
      prop('best_does', { move: 'Be6', captures: Nc5, check: false, materialGain: 3 }, 'betterWas'),
      ctx,
    );
    expect(capture[0]).toContain('takes the knight on c5');
    const mate = frameFor('best_does')(prop('best_does', { move: 'Qh7#', mateIn: 2, check: true }, 'betterWas'), ctx);
    expect(mate[0]).toContain('mate in two');
    const fork = frameFor('best_does')(prop('best_does', { move: 'Nf5', forks: [Nd7, Bb7] }, 'betterWas'), ctx);
    expect(fork[0]).toContain('hits the knight on d7 and the bishop on b7');
    for (const v of [...capture, ...mate, ...fork]) expect(v).not.toMatch(/\bis when\b|\bmeans\b/i);
  });

  it('treats a missed capture as free material, flatly', () => {
    const out = frameFor('missed_capture')(prop('missed_capture', { target: Qd8, value: 9 }), ctx);
    expect(out[0]).toBe('the queen on d8 was just free. Takes takes takes.');
  });

  it('keeps material unadorned and in words', () => {
    expect(materialWords(1)).toBe('a pawn');
    expect(materialWords(3)).toBe('a piece');
    expect(materialWords(5)).toBe('a rook');
    expect(materialWords(9)).toBe('the queen');
    for (const v of frameFor('material_delta')(prop('material_delta', { materialGain: 3 }), ctx)) {
      expect(v).not.toMatch(/\d/);
      expect(v).not.toMatch(/\bwhole\b/);
    }
  });
});

describe('hikaru prosody', () => {
  it('is silent: no reaction and no closer for any loss or lead', () => {
    for (const lead of LEADS) {
      for (const loss of [0, 0.05, 0.2, 0.34, 0.6, 1]) {
        expect(hikaru.prosody.reaction(loss, lead)).toBe('');
      }
      expect(hikaru.prosody.closer(lead)).toBe('');
    }
  });
});

describe('hikaru shape', () => {
  const slots = (over: Partial<Record<Slot, string>>): Record<Slot, string> => ({
    headline: 'Drops a piece to a fork.',
    whatHappened: 'The knight lands on c5 and hits d7 and b7. One of them survives.',
    whyItMatters: '52 to 18. I mean, it was equal before this.',
    betterWas: "Let's go Be6.",
    lesson: 'c5 was available. Worth a look.',
    ...over,
  });

  it('strips every exclamation mark and question mark', () => {
    const out = shapeHikaru(
      slots({ headline: 'What is that?!', whatHappened: 'Boom! Gone!', lesson: 'Really? Just look.' }),
      ctx,
    );
    const all = Object.values(out).join(' ');
    expect(count(all, '!')).toBe(0);
    expect(count(all, '?')).toBe(0);
    expect(out.headline).toBe('What is that.');
    expect(out.whatHappened).toBe('Boom. Gone.');
    expect(out.lesson).toBe('Really. Just look.');
  });

  it('collapses every slot to at most two sentences', () => {
    const out = shapeHikaru(
      slots({ whatHappened: 'One. Two. Three. Four.', lesson: 'Look. Then look again. Then play.' }),
      ctx,
    );
    expect(out.whatHappened).toBe('One. Two.');
    expect(out.lesson).toBe('Look. Then look again.');
    for (const slot of Object.values(out)) expect(sentences(slot).length).toBeLessThanOrEqual(2);
  });

  it('removes intensifiers', () => {
    const out = shapeHikaru(
      slots({ whyItMatters: 'This is very bad. It was really winning before.' }),
      ctx,
    );
    expect(out.whyItMatters).toBe('This is bad. It was winning before.');
  });

  it('inserts "just" once per note where a verb allows, and only when absent', () => {
    const out = shapeHikaru(
      slots({
        headline: 'Drops a piece.',
        whatHappened: 'The knight on c5 hits two pieces.',
        whyItMatters: '52 to 18. It was equal before this.',
        lesson: 'That square was available.',
      }),
      ctx,
    );
    const all = Object.values(out).join(' ');
    expect(all.match(/\bjust\b/gi)).toHaveLength(1);
    expect(out.headline).toBe('Drops a piece.');
    expect(out.whatHappened).toBe('The knight on c5 just hits two pieces.');

    // The headline takes it only when nothing earlier has a verb to carry it.
    const headline = shapeHikaru(
      slots({ headline: 'Drops a piece.', whatHappened: 'Two pieces.', whyItMatters: '52 to 18.', lesson: 'Count.' }),
      ctx,
    );
    expect(headline.headline).toBe('Just drops a piece.');
    expect(Object.values(headline).join(' ').match(/\bjust\b/gi)).toHaveLength(1);

    const after = shapeHikaru(
      slots({ headline: 'Terrible.', whatHappened: 'The position is lost.', whyItMatters: 'Level before.', lesson: 'Count.' }),
      ctx,
    );
    expect(after.whatHappened).toBe('The position is just lost.');

    const present = slots({ whyItMatters: '52 to 18. It was just equal before this.' });
    expect(shapeHikaru(present, ctx)).toEqual(present);
    expect(Object.values(shapeHikaru(present, ctx)).join(' ').match(/\bjust\b/gi)).toHaveLength(1);
  });

  it('never touches the best move', () => {
    const out = shapeHikaru(slots({ betterWas: "Let's go Be6! Obviously?" }), ctx);
    expect(out.betterWas).toBe("Let's go Be6. Obviously.");
    expect(out.betterWas).toContain('Be6');
  });
});

describe('hikaru on the shared example', () => {
  it('renders the five slots through its own frames', () => {
    // The planner's budget rule (twelve words a prop) leaves the five
    // weight-1 props for a forty-five word budget.
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

    // Sentence case, leaving a square such as "c5" alone at a sentence start.
    const cap = (s: string) =>
      s.replace(/(^|[.!?]\s+)([a-z])(?![1-8]\b)/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
    const raw = Object.fromEntries(
      (Object.keys(example) as Slot[]).map((slot) => [
        slot,
        cap(example[slot].map((p) => ctx.pick(frameFor(p.kind)(p, ctx))).join(' ')),
      ]),
    ) as Record<Slot, string>;
    const reaction = hikaru.prosody.reaction(0.34, 'walked_into_fork');
    raw.whatHappened = `${reaction} ${raw.whatHappened}`.trim();
    const closer = hikaru.prosody.closer('walked_into_fork');
    raw.lesson = `${raw.lesson} ${closer}`.trim();
    const out = hikaru.shape(raw, ctx);

    console.log('\n[hikaru] shared example');
    for (const slot of Object.keys(out) as Slot[]) console.log(`  ${slot}: ${out[slot]}`);

    const all = Object.values(out).join(' ');
    expect(out.headline).toBe('Drops a piece to a fork.');
    expect(out.whatHappened).toBe(
      'The knight on c5 just lands, hitting the knight on d7 and the bishop on b7. One of them survives.',
    );
    expect(out.betterWas.toLowerCase()).toContain("let's go be6");
    expect(out.lesson).toBe('c5 was available. Worth a look.');
    expect(count(all, '!')).toBe(0);
    expect(count(all, '?')).toBe(0);
    expect(wordCount(all)).toBeLessThanOrEqual(persona.budgets.words);
    expect(bannedHits(all)).toEqual([]);
    expect(identityHits(all)).toEqual([]);
    expect(inventedTokens(all, new Set(['c5', 'd7', 'b7', 'Nd7', 'Be6', 'Nc5']))).toEqual([]);
    for (const slot of Object.values(out)) {
      expect(slot.trim()).not.toBe('');
      expect(sentences(slot).length).toBeLessThanOrEqual(2);
    }
  });
});
