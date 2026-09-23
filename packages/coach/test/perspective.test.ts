import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Color, CoachText, MoveFacts, Review } from '@greekgift/engine';
import { factsFor } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { PERSONAS, findPersona } from '../src/personas.ts';
import { lessonFor, plan, viewerOf, voiceOf } from '../src/plan.ts';
import { Referrer } from '../src/realise/refer.ts';
import { renderCoachText, seedFor } from '../src/render.ts';
import { validate, wrongPerspective } from '../src/validate.ts';
import { neutralGrammar } from '../src/voices/index.ts';

/**
 * Coach perspective, section 6 of
 * docs/superpowers/specs/2026-09-23-review-overhaul-design.md: the member's
 * moves are "you", the opponent's are "your opponent" / "they" with the win%
 * restated from the member's side, and a neutral reader gets White / Black.
 * Every fixture ply is rendered under all three and must still validate —
 * no invented move or square, no wrong-side address.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../../engine/test/fixtures/reviews');
const REVIEWS: { name: string; review: Review }[] = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ name: f, review: JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) as Review }))
  // The clocked game (§14) runs the clock and game-over frames too.
  .concat(
    readdirSync(join(here, '../../engine/test/fixtures/clocked'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({
        name: `clocked/${f}`,
        review: JSON.parse(readFileSync(join(here, '../../engine/test/fixtures/clocked', f), 'utf8')) as Review,
      })),
  );

const PERSPECTIVES: (Color | null)[] = ['w', 'b', null];
const AUDIENCES: MoveFacts['audience'][] = ['beginner', 'intermediate', 'advanced'];
const SLOTS_CHECKED = ['headline', 'whatHappened', 'whyItMatters', 'betterWas'] as const;
const keyOf = (p: Color | null) => p ?? 'n';
const body = (t: CoachText) => SLOTS_CHECKED.map((s) => t[s]).join(' ');

interface Rendered {
  fixture: string;
  facts: MoveFacts;
  persona: string;
  audience: MoveFacts['audience'];
  perspective: Color | null;
  text: CoachText;
}

/** Every fixture ply × persona × audience × perspective, rendered once. */
const RENDERED: Rendered[] = [];
for (const { name, review } of REVIEWS) {
  for (const move of review.moves) {
    for (const audience of AUDIENCES) {
      for (const perspective of PERSPECTIVES) {
        const facts = factsFor(review, move.ply, { audience, perspective });
        for (const persona of PERSONAS) {
          const seed = seedFor(review.gameId, move.ply, persona.id, keyOf(perspective));
          RENDERED.push({
            fixture: name,
            facts,
            persona: persona.id,
            audience,
            perspective,
            text: renderCoachText(facts, persona, audience, seed),
          });
        }
      }
    }
  }
}

const LOSS = new Set(['blunder', 'mistake', 'inaccuracy', 'miss']);

describe('facts carry the perspective', () => {
  const { review } = REVIEWS[0]!;
  const ply = review.moves[0]!.ply;

  it('copies it when given, including null, and leaves the key off when not', () => {
    expect(factsFor(review, ply, { perspective: 'b' }).perspective).toBe('b');
    expect(factsFor(review, ply, { perspective: null }).perspective).toBeNull();
    expect('perspective' in factsFor(review, ply)).toBe(false);
  });

  it('derives viewer and voice: omitted is the mover, null is neutral', () => {
    const legacy = factsFor(review, ply);
    expect(viewerOf(legacy)).toBe(legacy.color);
    expect(voiceOf(legacy)).toBe('self');
    const other: Color = legacy.color === 'w' ? 'b' : 'w';
    expect(voiceOf(factsFor(review, ply, { perspective: legacy.color }))).toBe('self');
    expect(voiceOf(factsFor(review, ply, { perspective: other }))).toBe('opponent');
    expect(voiceOf(factsFor(review, ply, { perspective: null }))).toBe('neutral');
    const p = plan(factsFor(review, ply, { perspective: other }), 'intermediate');
    expect(p.viewer).toBe(other);
    expect(p.voice).toBe('opponent');
  });
});

describe('seedFor', () => {
  it('keeps the legacy seed and varies by perspective', () => {
    const legacy = seedFor('g1', 12, 'gotham');
    expect(seedFor('g1', 12, 'gotham', undefined)).toBe(legacy);
    const seeds = new Set([legacy, seedFor('g1', 12, 'gotham', 'w'), seedFor('g1', 12, 'gotham', 'b'), seedFor('g1', 12, 'gotham', 'n')]);
    expect(seeds.size).toBe(4);
  });
});

describe('every fixture ply validates under w, b and null', () => {
  it('renders a sizeable corpus', () => {
    expect(RENDERED.length).toBeGreaterThan(1000);
  });

  it('has no violation of any kind, including invented moves and wrong_perspective', () => {
    const bad = RENDERED.flatMap((r) =>
      validate(r.text, r.facts, findPersona(r.persona)).violations.map(
        (v) => `${r.fixture} ply ${r.facts.ply} ${r.persona}/${r.audience}/${keyOf(r.perspective)}: ${v.kind} ${v.detail}`,
      ),
    );
    expect(bad).toEqual([]);
  });

  it('is deterministic per perspective', () => {
    const r = RENDERED.find((x) => x.perspective === null)!;
    const again = renderCoachText(
      r.facts,
      findPersona(r.persona),
      r.audience,
      seedFor(r.fixture, r.facts.ply, r.persona, 'n'),
    );
    const same = renderCoachText(
      r.facts,
      findPersona(r.persona),
      r.audience,
      seedFor(r.fixture, r.facts.ply, r.persona, 'n'),
    );
    expect(again).toEqual(same);
  });
});

describe("the opponent's moves", () => {
  const opponent = RENDERED.filter((r) => r.perspective !== null && r.perspective !== r.facts.color);

  it('are present in the fixtures, including errors', () => {
    expect(opponent.some((r) => LOSS.has(r.facts.classification))).toBe(true);
  });

  it('never say "your winning chances fell" or address the mover as you', () => {
    const offenders = opponent.filter((r) =>
      /\byour (winning )?chances (fell|fall|falls|drop|drops|dropped|sank|slipped)\b|\byou (blundered|missed|hung|lost|played|found|could have|should have)\b|\byour (move|mistake|blunder|inaccuracy)\b/i.test(
        body(r.text),
      ),
    );
    expect(offenders.map((r) => `${r.fixture} ${r.facts.ply} ${r.persona}: ${body(r.text)}`)).toEqual([]);
  });

  it('frame an opponent error as a chance, with the win% restated from the member side', () => {
    const errors = opponent.filter(
      (r) => r.facts.epLoss >= 0.05 && Math.abs(r.facts.winAfter - r.facts.winBefore) >= 2,
    );
    expect(errors.length).toBeGreaterThan(0);
    for (const r of errors) {
      expect(r.text.whyItMatters, `${r.fixture} ${r.facts.ply} ${r.persona}`).toMatch(
        /handed you a chance|A chance for you|opened a door for you/,
      );
      const member = (w: number) => `about ${Math.round(100 - w)}%`;
      expect(r.text.whyItMatters).toContain(member(r.facts.winAfter));
    }
  });

  it('get no reaction aimed at the member and a lesson about punishing the slip', () => {
    const r = opponent.find((x) => x.facts.classification === 'blunder' && x.persona === 'gotham')!;
    expect(r).toBeDefined();
    expect(body(r.text)).not.toMatch(/What are you doing/i);
    const p = plan(r.facts, r.audience);
    expect(p.props.find((x) => x.kind === 'lesson')?.args.concept).toBe('punish_it');
  });

  it("praise the opponent's good move with a lesson about their threat", () => {
    const facts = opponent.find((r) => !LOSS.has(r.facts.classification))!.facts;
    expect(lessonFor(facts, 'best', 'opponent')).toBe('see_their_threat');
  });

  it('name the better move as theirs', () => {
    const r = opponent.find(
      (x) => LOSS.has(x.facts.classification) && x.persona === 'sagar' && x.audience === 'intermediate',
    )!;
    expect(r.text.betterWas).toMatch(/their best|for them/i);
    expect(r.text.betterWas).toContain(r.facts.bestMove.replace(/[+#]$/, ''));
  });
});

describe('the neutral reader', () => {
  const neutral = RENDERED.filter((r) => r.perspective === null);

  it('is never addressed as you outside the lesson', () => {
    const offenders = neutral.filter((r) => /\b(you|your|you're|yourself)\b/i.test(body(r.text)));
    expect(offenders.map((r) => `${r.fixture} ${r.facts.ply} ${r.persona}: ${body(r.text)}`)).toEqual([]);
  });

  it('hears the mover by colour', () => {
    const r = neutral.find(
      (x) => LOSS.has(x.facts.classification) && x.persona === 'sagar' && x.audience === 'intermediate',
    )!;
    const side = r.facts.color === 'w' ? 'White' : 'Black';
    expect(body(r.text)).toContain(side);
  });
});

describe("the member's own moves", () => {
  it('read exactly as the legacy voice for the same seed', () => {
    const { name, review } = REVIEWS[0]!;
    for (const move of review.moves.slice(0, 20)) {
      for (const persona of PERSONAS) {
        const seed = seedFor(name, move.ply, persona.id);
        const legacy = renderCoachText(factsFor(review, move.ply), persona, 'intermediate', seed);
        const self = renderCoachText(
          factsFor(review, move.ply, { perspective: move.color }),
          persona,
          'intermediate',
          seed,
        );
        expect(self).toEqual(legacy);
      }
    }
  });
});

describe('wrong_perspective', () => {
  const { review } = REVIEWS[0]!;
  const move = review.moves[0]!;
  const other: Color = move.color === 'w' ? 'b' : 'w';
  const note = (whyItMatters: string): CoachText => ({
    ply: move.ply,
    headline: 'A slip.',
    whatHappened: 'Something happened.',
    whyItMatters,
    betterWas: 'Better was it.',
    lesson: 'You should always look at checks.',
    source: 'rules',
  });

  it("flags an opponent's note that says the member's chances fell", () => {
    const facts = factsFor(review, move.ply, { perspective: other });
    expect(wrongPerspective(note('Your winning chances fell from 50% to 30%.'), facts)).toHaveLength(1);
    expect(wrongPerspective(note('That hands you a chance: your winning chances go from 50% to 70%.'), facts)).toEqual([]);
  });

  it('flags any you for a neutral reader, but not in the lesson', () => {
    const facts = factsFor(review, move.ply, { perspective: null });
    expect(wrongPerspective(note('Your chances went down.'), facts)).toHaveLength(1);
    expect(wrongPerspective(note("White's chances went down."), facts)).toEqual([]);
  });

  it('leaves the self voice alone', () => {
    const facts = factsFor(review, move.ply, { perspective: move.color });
    expect(wrongPerspective(note('Your winning chances fell from 50% to 30%.'), facts)).toEqual([]);
  });
});

describe('Referrer', () => {
  const N_D7 = { piece: 'N' as const, square: 'd7', color: 'b' as const };
  const N_C5 = { piece: 'N' as const, square: 'c5', color: 'w' as const };
  const lexicon = neutralGrammar('sagar').lexicon;

  it('owns pieces by colour for a neutral reader', () => {
    const r = new Referrer({ lexicon, preferHere: false, viewer: null, moverColor: 'b', voice: 'neutral' });
    const text = r.resolve(`${r.refer(N_D7)} and ${r.refer(N_C5)}; then ${r.refer(N_C5)} and ${r.refer(N_D7)}.`);
    expect(text).toContain("Black's knight");
    expect(text).not.toMatch(/\byour\b|\btheir\b/);
  });

  it('owns pieces against the viewer, not the mover', () => {
    // Black moved, White reads: Black's knight is "their", White's "your".
    const r = new Referrer({ lexicon, preferHere: false, viewer: 'w', moverColor: 'b', voice: 'opponent' });
    const text = r.resolve(`${r.refer(N_D7)} and ${r.refer(N_C5)}; then ${r.refer(N_D7)} and ${r.refer(N_C5)}.`);
    expect(text).toBe('the knight on d7 and the knight on c5; then their knight and your knight.');
  });

  it('names the opponent once, then "they"', () => {
    const r = new Referrer({ lexicon, preferHere: false, viewer: 'w', moverColor: 'b', voice: 'opponent' });
    expect(r.resolve(`${r.mover()} could have won. ${r.mover()} did not.`)).toBe(
      'your opponent could have won. they did not.',
    );
    const n = new Referrer({ lexicon, preferHere: false, viewer: null, moverColor: 'b', voice: 'neutral' });
    expect(n.resolve(`${n.mover()} could have won.`)).toBe('Black could have won.');
    expect(n.moverPossessive()).toBe("Black's");
  });
});
