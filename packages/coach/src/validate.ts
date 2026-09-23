import type { CoachText, MoveFacts } from '@greekgift/engine';
import { formatClock, formatMinutes } from '@greekgift/engine';

import { SLOTS, type Slot, type Voice } from './contracts.ts';
import type { Persona } from './personas.ts';
import { voiceOf } from './plan.ts';
import { liveNarration } from './tense.ts';

/**
 * The check that makes the coach trustworthy.
 *
 * A model asked to explain a chess move will invent a fork that is not there
 * and a square nothing stands on, fluently and in the right voice. Prompting
 * reduces it; nothing eliminates it. So every generated line is checked against
 * the facts object it was given, and anything that mentions a move or a square
 * it was not told about is rejected outright rather than softened.
 *
 * The coach is deterministic now, so rejection cannot happen at runtime: this
 * check runs in tests over a rendered corpus, and a violation fails the build
 * of the coach rather than a reader's request.
 */

/** Squares, and anything shaped like a move in algebraic notation. */
const SAN = /\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;
const SQUARE = /\b[a-h][1-8]\b/g;
/** The same, unanchored, for pulling `e6` back out of `Be6`. */
const SQUARE_INSIDE = /[a-h][1-8]/g;

export type Violation =
  | { kind: 'banned_word'; detail: string }
  | { kind: 'over_budget'; detail: string }
  | { kind: 'too_many_exclamations'; detail: string }
  | { kind: 'headline_too_long'; detail: string }
  | { kind: 'missing_best_move'; detail: string }
  | { kind: 'invented_move'; detail: string }
  | { kind: 'identity_claim'; detail: string }
  | { kind: 'empty_slot'; detail: string }
  | { kind: 'sentence_too_long'; detail: string }
  | { kind: 'wrong_perspective'; detail: string }
  | { kind: 'false_capture'; detail: string }
  | { kind: 'present_tense'; detail: string }
  | { kind: 'bare_numbers'; detail: string }
  | { kind: 'fragment'; detail: string }
  | { kind: 'repeats_label'; detail: string }
  | { kind: 'invented_time'; detail: string };

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

const prose = (text: CoachText): string =>
  SLOTS.map((slot) => text[slot]).join(' ');

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Sentences of a slot: split after terminal punctuation, keeping the text. */
export const sentencesOf = (s: string): string[] =>
  s
    .split(/(?<=[.!?]["')\]]?)\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Every move and square the coach is allowed to name.
 *
 * Built only from the facts it was handed, which is the whole mechanism: it
 * cannot be told about a square and then forbidden from mentioning it, and it
 * cannot mention one it was never told about.
 */
export function permittedTokens(facts: MoveFacts): Set<string> {
  const allowed = new Set<string>();
  const add = (token: string | undefined) => {
    if (token) allowed.add(token.replace(/[+#]$/, ''));
  };

  add(facts.san);
  add(facts.bestMove);
  for (const san of facts.bestLine) add(san);
  for (const san of facts.playedLine) add(san);

  const addRef = (ref: { square: string } | undefined) => add(ref?.square);
  for (const motif of facts.motifs) {
    switch (motif.type) {
      case 'hanging_piece':
        addRef(motif.target);
        motif.attackers.forEach(addRef);
        motif.defenders.forEach(addRef);
        break;
      case 'trapped_piece':
        addRef(motif.target);
        motif.attackers.forEach(addRef);
        break;
      case 'missed_capture':
        addRef(motif.target);
        break;
      case 'fork':
        addRef(motif.by);
        motif.targets.forEach(addRef);
        break;
      case 'pin':
        addRef(motif.pinned);
        addRef(motif.pinner);
        addRef(motif.against);
        break;
      case 'skewer':
        addRef(motif.front);
        addRef(motif.behind);
        addRef(motif.by);
        break;
      case 'discovered_attack':
        addRef(motif.mover);
        addRef(motif.attacker);
        addRef(motif.target);
        break;
      case 'sacrifice':
        addRef(motif.piece);
        break;
      case 'opponent_threat':
        addRef(motif.by);
        motif.targets.forEach(addRef);
        for (const san of motif.line) add(san);
        break;
      case 'traded_while_behind':
        addRef(motif.captured);
        break;
      case 'passed_pawn':
        addRef(motif.pawn);
        break;
      case 'promotion':
        add(motif.square);
        break;
      case 'king_safety':
        motif.attackersInZone.forEach(addRef);
        motif.shieldMissing.forEach(add);
        break;
      case 'overloaded_defender':
        addRef(motif.defender);
        motif.duties.forEach(addRef);
        break;
      case 'mate_threat':
      case 'missed_mate':
        for (const san of motif.line) add(san);
        break;
      default:
        break;
    }
  }

  // The refutation and the better line are facts (§13.1), and so is every
  // piece a refutation's tactic names.
  const r = facts.refutation;
  if (r) {
    for (const san of r.line) add(san);
    add(r.actual);
    const t = r.tactic;
    if (t) {
      for (const v of Object.values(t)) {
        if (Array.isArray(v)) v.forEach((x) => addRef(x as { square: string }));
        else if (v && typeof v === 'object' && 'square' in v) addRef(v as { square: string });
      }
    }
  }
  for (const san of facts.betterLine?.line ?? []) add(san);

  // Squares from the best move's own effect are facts too.
  addRef(facts.bestMoveEffect.captures);
  facts.bestMoveEffect.forks?.forEach(addRef);

  // A square named inside an allowed move is itself fair game: "Nf3" makes
  // "f3" sayable, which is how anyone would actually write the sentence. The
  // word-boundary form will not see it — in "Nf3" there is no boundary before
  // the f — so this pass uses the unanchored pattern.
  for (const token of [...allowed]) {
    for (const square of token.match(SQUARE_INSIDE) ?? []) allowed.add(square);
  }

  return allowed;
}

/** Moves or squares in the text that the facts never mentioned. */
export function inventedTokens(text: string, permitted: Set<string>): string[] {
  const found = new Set<string>();

  for (const match of text.match(SAN) ?? []) {
    const token = match.replace(/[+#]$/, '');
    if (!permitted.has(token)) found.add(token);
  }
  for (const match of text.match(SQUARE) ?? []) {
    if (!permitted.has(match)) found.add(match);
  }

  return [...found];
}

/**
 * What a note may not say off the mover's side, section 6.7 of the
 * review-overhaul design. On the opponent's move the reader did not blunder,
 * and their chances did not fall; for a neutral reader nobody is "you".
 */
const WRONG_PERSPECTIVE: Record<Voice, RegExp[]> = {
  self: [],
  opponent: [
    /\byou (blundered|missed|hung|lost|played|found|could have|should have)\b/i,
    /\byour (winning )?chances (fell|fall|falls|drop|drops|dropped|sank|slipped)\b/i,
    /\byour (move|mistake|blunder|inaccuracy)\b/i,
  ],
  neutral: [/\b(you|your|you're|you’re|yourself)\b/i],
};

/** The slots the perspective rule covers; the lesson is general advice and may say "you". */
const PERSPECTIVE_SLOTS: readonly Slot[] = ['headline', 'whatHappened', 'whyItMatters', 'betterWas'];

/** Sentences in a note that address the wrong side, for the facts' perspective. */
export function wrongPerspective(text: CoachText, facts: MoveFacts): string[] {
  const rules = WRONG_PERSPECTIVE[voiceOf(facts)];
  const found: string[] = [];
  for (const slot of PERSPECTIVE_SLOTS) {
    for (const sentence of sentencesOf(text[slot] ?? '')) {
      const hit = rules.find((r) => r.test(sentence));
      if (hit) found.push(`${slot}: "${sentence}"`);
    }
  }
  return found;
}

/**
 * A move whose SAN has no "x" captures nothing, so no sentence may say it
 * takes something. Guards against a threat, or another move's capture, being
 * told as a capture the move made.
 */
export function falseCaptures(text: CoachText, facts: MoveFacts): string[] {
  const all = prose(text);
  const found: string[] = [];
  for (const san of new Set([facts.san, facts.bestMove])) {
    const bare = san.replace(/[+#]+$/, '');
    if (!bare || bare.includes('x')) continue;
    const said = new RegExp(
      `(?<![\\w])${escape(bare)}[+#]?\\s+(?:just\\s+|simply\\s+)?(?:takes|captures|grabs|picks up|wins (?:the|a|an)\\b)`,
      'i',
    );
    const m = said.exec(all);
    if (m) found.push(m[0]);
  }
  return found;
}

/** Time figures a note may say: formatClock / formatMinutes of the clock facts (§14.5). */
export function permittedTimes(facts: MoveFacts): Set<string> {
  const out = new Set<string>();
  const add = (ms: number | undefined) => {
    if (ms === undefined) return;
    out.add(formatClock(ms));
    const m = formatMinutes(ms);
    if (m) out.add(m);
  };
  const c = facts.clock;
  if (c) [c.spent, c.left, c.leftBefore].forEach(add);
  const e = facts.ending;
  if (e) {
    add(e.finalThink);
    if (e.clocks) Object.values(e.clocks).forEach(add);
  }
  return out;
}

const TIME_TOKEN = /\b\d+:\d{2}\b|\b\d+ seconds?\b|\b\d+ minutes?\b/g;

/** Time figures in the prose that the facts never gave. */
export function inventedTimes(text: CoachText, facts: MoveFacts): string[] {
  const allowed = permittedTimes(facts);
  return [...new Set(prose(text).match(TIME_TOKEN) ?? [])].filter((t) => !allowed.has(t));
}

/** Phrases that would have the coach claim to be the real person. */
const IDENTITY = [
  /\bi am (?:the )?(?:im|gm|international master|grandmaster)\b/i,
  /\bmy (?:youtube |twitch )?channel\b/i,
  /\bsubscribe\b/i,
  /\bin my game against\b/i,
  /\bwhen i played\b/i,
];

export function validate(
  text: CoachText,
  facts: MoveFacts,
  persona: Persona,
): ValidationResult {
  const violations: Violation[] = [];
  const all = prose(text);

  for (const slot of SLOTS) {
    if (!text[slot]?.trim()) {
      violations.push({ kind: 'empty_slot', detail: slot });
    }
  }

  if (text.headline.length > 60) {
    violations.push({
      kind: 'headline_too_long',
      detail: `${text.headline.length} characters`,
    });
  }

  const lower = all.toLowerCase();
  for (const word of persona.banned) {
    // Multi-word entries are phrases; single words must not match inside a
    // longer word, or "just" would flag "adjust".
    const hit = /\s/.test(word)
      ? lower.includes(word.toLowerCase())
      : new RegExp(`\\b${escape(word)}\\b`, 'i').test(all);
    if (hit) violations.push({ kind: 'banned_word', detail: word });
  }

  const words = countWords(all);
  if (words > persona.budgets.words) {
    violations.push({
      kind: 'over_budget',
      detail: `${words} words, budget ${persona.budgets.words}`,
    });
  }

  const perSentence = persona.budgets.perSentence;
  if (perSentence && perSentence > 0) {
    for (const slot of SLOTS) {
      for (const sentence of sentencesOf(text[slot] ?? '')) {
        const n = countWords(sentence);
        if (n > perSentence) {
          violations.push({
            kind: 'sentence_too_long',
            detail: `${slot}: ${n} words, limit ${perSentence}: "${sentence}"`,
          });
        }
      }
    }
  }

  const exclamations = (all.match(/!/g) ?? []).length;
  if (exclamations > persona.budgets.exclamations) {
    violations.push({
      kind: 'too_many_exclamations',
      detail: `${exclamations}, budget ${persona.budgets.exclamations}`,
    });
  }

  // The one thing every explanation must contain: what to play instead.
  const best = facts.bestMove.replace(/[+#]$/, '');
  if (!text.betterWas.includes(best)) {
    violations.push({ kind: 'missing_best_move', detail: best });
  }

  const invented = inventedTokens(all, permittedTokens(facts));
  if (invented.length > 0) {
    violations.push({ kind: 'invented_move', detail: invented.join(', ') });
  }

  for (const detail of wrongPerspective(text, facts)) {
    violations.push({ kind: 'wrong_perspective', detail });
  }

  for (const slot of PERSPECTIVE_SLOTS) {
    for (const sentence of sentencesOf(text[slot] ?? '')) {
      const hit = liveNarration(sentence);
      if (hit) violations.push({ kind: 'present_tense', detail: `${slot}: ${hit.source}: "${sentence}"` });
    }
  }

  // Win percentages carry their unit: "44 to 22." says nothing to a reader.
  for (const slot of SLOTS) {
    const bare = /\b\d{1,3}%? (?:up |down )?to \d{1,3}\b(?!%| percent)/.exec(text[slot] ?? '');
    if (bare) violations.push({ kind: 'bare_numbers', detail: `${slot}: "${bare[0]}"` });
    for (const sentence of sentencesOf(text[slot] ?? '')) {
      if (/^(?:would|could|should) have\b/i.test(sentence)) {
        violations.push({ kind: 'fragment', detail: `${slot}: "${sentence}"` });
      }
    }
  }
  // The card labels the slot "Better was"; the body must not say it again.
  if (/^better was\b/i.test(text.betterWas.trim())) {
    violations.push({ kind: 'repeats_label', detail: text.betterWas });
  }

  const times = inventedTimes(text, facts);
  if (times.length > 0) violations.push({ kind: 'invented_time', detail: times.join(', ') });

  for (const detail of falseCaptures(text, facts)) {
    violations.push({ kind: 'false_capture', detail });
  }

  for (const pattern of IDENTITY) {
    if (pattern.test(all)) {
      violations.push({ kind: 'identity_claim', detail: pattern.source });
      break;
    }
  }

  return { ok: violations.length === 0, violations };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
