import type { PieceRef } from '@greekgift/engine';

import {
  SLOTS,
  type PersonaGrammar,
  type Plan,
  type Proposition,
  type RenderContext,
  type Slot,
} from '../contracts.ts';
import { neutralFrames, verdictWord } from './frames.ts';
import { Referrer } from './refer.ts';
import { makePick, mulberry32 } from './seed.ts';
import {
  countWords,
  destinationOf,
  finishSentence,
  isQuestion,
  limitSentences,
  lowerFirst,
  stripCheck,
  stripTerminal,
} from './text.ts';

/**
 * One rendering pass: props → sentences → slots → shaped slots.
 *
 * The budget loop in `budget.ts` calls this repeatedly with fewer props, or in
 * terse mode, until the note fits. Everything here is deterministic in
 * (plan, grammar, seed, options).
 */

export interface RenderOptions {
  /** Indices into `plan.props` to leave out. */
  dropped: ReadonlySet<number>;
  /** Pick the shortest variant everywhere. */
  terse: boolean;
  closer: boolean;
  reaction: boolean;
}

export interface Rendered {
  slots: Record<Slot, string>;
  words: number;
}

const HEADLINE_MAX = 60;

type Unit = { kind: 'one'; prop: Proposition } | { kind: 'joined'; props: [Proposition, Proposition] };

const attackerKey = (p: Proposition): string | undefined => {
  const a = p.args.attackers ?? p.args.attacker ?? p.args.by;
  const first = Array.isArray(a) ? a[0] : a;
  if (!first || typeof first !== 'object') return undefined;
  const ref = first as PieceRef;
  return `${ref.color}${ref.piece}${ref.square}`;
};

const targetOf = (p: Proposition): PieceRef | undefined => {
  const t = p.args.target ?? p.args.piece;
  return t && typeof t === 'object' && !Array.isArray(t) ? (t as PieceRef) : undefined;
};

/** Aggregation: hangs by the same attacker merge; swing + material_delta pair up. */
function aggregate(props: Proposition[]): Unit[] {
  const units: Unit[] = [];
  const used = new Set<number>();

  for (let i = 0; i < props.length; i++) {
    if (used.has(i)) continue;
    const p = props[i]!;

    if (p.kind === 'hangs') {
      const key = attackerKey(p);
      const partners = key
        ? props
            .map((q, j) => ({ q, j }))
            .filter(({ q, j }) => j > i && !used.has(j) && q.kind === 'hangs' && attackerKey(q) === key)
        : [];
      if (partners.length > 0) {
        const targets = [p, ...partners.map(({ q }) => q)]
          .map(targetOf)
          .filter((t): t is PieceRef => !!t);
        partners.forEach(({ j }) => used.add(j));
        units.push({
          kind: 'one',
          prop: {
            ...p,
            args: { ...p.args, targets, ...(targets[0] ? { target: targets[0] } : {}) },
            weight: Math.max(p.weight, ...partners.map(({ q }) => q.weight)),
          },
        });
        used.add(i);
        continue;
      }
    }

    if (p.kind === 'swing' || p.kind === 'material_delta') {
      const other = p.kind === 'swing' ? 'material_delta' : 'swing';
      const j = props.findIndex((q, k) => k > i && !used.has(k) && q.kind === other);
      if (j >= 0) {
        used.add(i);
        used.add(j);
        const swing = p.kind === 'swing' ? p : props[j]!;
        const delta = p.kind === 'swing' ? props[j]! : p;
        units.push({ kind: 'joined', props: [swing, delta] });
        continue;
      }
    }

    used.add(i);
    units.push({ kind: 'one', prop: p });
  }
  return units;
}

export function renderOnce(
  plan: Plan,
  grammar: PersonaGrammar,
  seed: number,
  opts: RenderOptions,
  props: Proposition[],
): Rendered {
  const facts = plan.facts;
  const { lexicon, syntax, prosody, budgets } = grammar;
  const rng = mulberry32(seed);
  const seededPick = makePick(rng);
  const referrer = new Referrer({
    lexicon,
    preferHere: syntax.preferHere,
    playedSquare: destinationOf(facts.san),
    moverColor: facts.color,
  });
  const limit = Math.min(
    syntax.maxSentenceWords > 0 ? syntax.maxSentenceWords : Infinity,
    budgets.perSentence && budgets.perSentence > 0 ? budgets.perSentence : Infinity,
  );

  const shortest = (variants: string[]): string =>
    variants.reduce((best, v) => (countWords(v) < countWords(best) ? v : best));

  const pick = <T>(variants: T[]): T => {
    if (variants.length === 0) return undefined as T;
    if (opts.terse && typeof variants[0] === 'string') {
      return shortest(variants as unknown as string[]) as unknown as T;
    }
    return seededPick(variants);
  };

  const ctx: RenderContext = {
    lexicon,
    syntax,
    audience: plan.audience,
    refer: (piece) => referrer.refer(piece),
    square: (sq) => referrer.square(sq),
    move: (san) => referrer.move(san),
    pick,
  };

  const neutral = neutralFrames(plan, grammar);

  const variantsFor = (p: Proposition): string[] => {
    // A held swing on a praise move is rendered neutrally: the voices' swing
    // frames narrate a change, and there is none to narrate.
    const neutralOnly =
      (p.kind === 'swing' && p.args.held === true) ||
      (p.kind === 'material_delta' && p.args.missed === true);
    const persona = neutralOnly ? undefined : grammar.frames[p.kind];
    let variants: string[] = [];
    if (persona) {
      try {
        variants = (persona(p, ctx) ?? []).filter((v) => typeof v === 'string' && v.trim());
      } catch {
        variants = [];
      }
    }
    if (variants.length === 0) {
      const frame = neutral[p.kind];
      variants = frame ? frame(p, ctx).filter((v) => v.trim()) : [];
    }
    if (variants.length === 0) variants = [FALLBACK[p.slot](plan)];
    return variants;
  };

  /** The variants to choose from, honouring the question rate. */
  const poolFor = (p: Proposition, allowQuestion = true): string[] => {
    const variants = variantsFor(p);
    const askable = allowQuestion && (p.role === 'advice' || p.role === 'consequence');
    const wantQuestion = askable && syntax.questionRate > 0 && rng() < syntax.questionRate;
    const questions = variants.filter(isQuestion);
    const statements = variants.filter((v) => !isQuestion(v));
    if (wantQuestion) return questions.length > 0 ? questions : variants;
    return statements.length > 0 ? statements : variants;
  };

  const choose = (fits: string[]): string => (opts.terse ? shortest(fits) : seededPick(fits));

  /** Choose a variant within the sentence limit, then resolve it. */
  const renderProp = (p: Proposition, ref: Referrer): string => {
    const pool = poolFor(p);
    const measured = pool.map((v) => ({ v, words: countWords(ref.clone().resolve(v)) }));
    const fits = measured.filter((m) => m.words <= limit).map((m) => m.v);
    const chosen =
      fits.length > 0 ? choose(fits) : measured.reduce((b, m) => (m.words < b.words ? m : b)).v;
    return finishSentence(ref.resolve(chosen));
  };

  const connective = (): string => {
    const c = pick(lexicon.connectives.length > 0 ? lexicon.connectives : ['and']);
    return c === '—' || c === '–' ? ' — ' : `, ${c} `;
  };

  /** Two propositions as one sentence when some pair of statements fits; else two. */
  const renderPair = (a: Proposition, b: Proposition, ref: Referrer): string[] => {
    const as = poolFor(a, false).filter((v) => !isQuestion(v));
    const bs = poolFor(b, false).filter((v) => !isQuestion(v));
    const glue = connective();
    const pairs: { text: string; words: number }[] = [];
    for (const va of as) {
      for (const vb of bs) {
        const text = `${stripTerminal(va)}${glue}${lowerFirst(vb)}`;
        const words = countWords(ref.clone().resolve(text));
        if (words <= limit) pairs.push({ text, words });
      }
    }
    if (pairs.length > 0) {
      const chosen = opts.terse
        ? pairs.reduce((s, p) => (p.words < s.words ? p : s)).text
        : seededPick(pairs).text;
      return [finishSentence(ref.resolve(chosen))];
    }
    return [renderProp(a, ref), renderProp(b, ref)];
  };

  const renderSlot = (slot: Slot): string[] => {
    const inSlot = props.filter((p) => p.slot === slot);
    const units = aggregate(inSlot);
    referrer.newSlot();
    const sentences: string[] = [];
    for (const unit of units) {
      if (unit.kind === 'one') {
        sentences.push(renderProp(unit.prop, referrer));
      } else {
        sentences.push(...renderPair(unit.props[0], unit.props[1], referrer));
      }
    }
    return sentences;
  };

  const chain = (sentences: string[]): string[] => {
    if (!syntax.chainWithAnd || sentences.length < 2) return sentences;
    const out: string[] = [];
    for (const s of sentences) {
      const prev = out[out.length - 1];
      if (prev && !isQuestion(prev) && !isQuestion(s)) {
        const joined = `${stripTerminal(prev)} and ${lowerFirst(s)}`;
        if (countWords(joined) <= limit) {
          out[out.length - 1] = finishSentence(joined);
          continue;
        }
      }
      out.push(s);
    }
    return out;
  };

  // Headline: rendered on an isolated referrer so the body still gets full first mentions.
  const headline = (): string => {
    const inSlot = props.filter((p) => p.slot === 'headline');
    const verdicts = inSlot.filter((p) => p.kind === 'verdict');
    const ordered = verdicts.length > 0 ? verdicts : inSlot;
    const resolve = (v: string) => finishSentence(referrer.clone().resolve(v));
    const fits = (c: string) => c.length > 0 && c.length <= HEADLINE_MAX;
    const own: string[] = [];
    const fallback: string[] = [];
    for (const p of ordered) {
      own.push(...variantsFor(p).map(resolve));
      const frame = neutral[p.kind];
      if (grammar.frames[p.kind] && frame) fallback.push(...frame(p, ctx).map(resolve));
    }
    const pool = own.filter(fits).length > 0 ? own.filter(fits) : fallback.filter(fits);
    if (pool.length > 0) return opts.terse ? shortest(pool) : seededPick(pool);
    return `${verdictWord(plan.classification, grammar.banned)}.`;
  };

  const raw: Record<Slot, string> = {
    headline: headline(),
    whatHappened: '',
    whyItMatters: '',
    betterWas: '',
    lesson: '',
  };

  const what = chain(renderSlot('whatHappened'));
  // A reaction and a verdict word both open the slot; together they read as
  // "Terrible. Blunder." The reaction wins when the voice has one.
  const reaction = opts.reaction ? safe(() => prosody.reaction(plan.epLoss, plan.lead), '') : '';
  if (reaction.trim()) what.unshift(finishSentence(reaction));
  else if (syntax.verdictFirst) what.unshift(`${verdictWord(plan.classification, grammar.banned)}.`);
  raw.whatHappened = what.join(' ');

  raw.whyItMatters = chain(renderSlot('whyItMatters')).join(' ');
  raw.betterWas = chain(renderSlot('betterWas')).join(' ');

  const lesson = renderSlot('lesson');
  if (opts.closer) {
    const closer = safe(() => prosody.closer(plan.lead), '');
    // Never say the closer twice: a lesson that already ends with it is done.
    const norm = (t: string) => stripTerminal(t).trim().toLowerCase();
    const already =
      closer.trim() &&
      norm(lesson.join(' ')).endsWith(norm(closer));
    if (closer.trim() && !already) lesson.push(finishSentence(closer));
  }
  raw.lesson = lesson.join(' ');

  const shaped = safe(() => grammar.shape({ ...raw }, ctx), raw);
  const slots = finalise(shaped, raw, plan, grammar, referrer);
  return { slots, words: countWords(SLOTS.map((s) => slots[s]).join(' ')) };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

const FALLBACK: Record<Slot, (plan: Plan) => string> = {
  headline: (plan) => `${stripCheck(plan.facts.san)}.`,
  whatHappened: (plan) => `${stripCheck(plan.facts.san)} was played.`,
  whyItMatters: () => 'The position changed.',
  betterWas: (plan) => `${plan.facts.bestMove} was the move.`,
  lesson: () => 'Take one idea from this move into the next game.',
};

/** The guarantees: no empty slot, capital start, terminal end, headline fits, best move named, exclamation cap. */
function finalise(
  shaped: Record<Slot, string>,
  raw: Record<Slot, string>,
  plan: Plan,
  grammar: PersonaGrammar,
  referrer: Referrer,
): Record<Slot, string> {
  const out = {} as Record<Slot, string>;
  for (const slot of SLOTS) {
    let text = typeof shaped[slot] === 'string' ? shaped[slot] : '';
    text = referrer.resolve(text);
    if (!text.trim()) text = raw[slot];
    if (!text.trim()) text = FALLBACK[slot](plan);
    text = finishSentence(text);
    // The voice's per-sentence limit is a guarantee, not a hope.
    if (grammar.budgets.perSentence) text = limitSentences(text, grammar.budgets.perSentence);
    out[slot] = text;
  }

  if (out.headline.length > HEADLINE_MAX) {
    out.headline = raw.headline.length <= HEADLINE_MAX ? raw.headline : FALLBACK.headline(plan);
  }

  const best = stripCheck(plan.facts.bestMove);
  if (best && !out.betterWas.includes(best)) {
    out.betterWas = finishSentence(`${plan.facts.bestMove} was the move. ${out.betterWas}`);
  }

  const cap = Math.max(0, Math.min(grammar.budgets.exclamations, grammar.prosody.exclamations));
  let seen = 0;
  for (const slot of SLOTS) {
    out[slot] = out[slot].replace(/!+/g, (m) => {
      seen += 1;
      return seen <= cap ? m : '.';
    });
    out[slot] = out[slot].replace(/\.\s*\./g, '.');
  }

  return out;
}
