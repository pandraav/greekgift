import type { CoachText, MoveFacts } from '@greekgift/engine';

import { SLOTS } from './contracts.ts';
import type { Persona } from './personas.ts';

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
  | { kind: 'sentence_too_long'; detail: string };

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

  for (const pattern of IDENTITY) {
    if (pattern.test(all)) {
      violations.push({ kind: 'identity_claim', detail: pattern.source });
      break;
    }
  }

  return { ok: violations.length === 0, violations };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
