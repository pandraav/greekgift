import type {
  Classification,
  MoveFacts,
  PieceRef,
  SituationKind,
} from '@greekgift/engine';

import type { Trigger } from './personas.ts';

/**
 * Frozen contracts for the deterministic coach, section 3 of
 * docs/superpowers/specs/2026-09-07-deterministic-coach-design.md.
 *
 * The planner emits propositions; the realiser turns them into sentences; a
 * persona grammar decides how those sentences sound. Nothing here may change
 * during the build — a needed change is reported, not made.
 */

export type Slot = 'headline' | 'whatHappened' | 'whyItMatters' | 'betterWas' | 'lesson';

export const SLOTS: readonly Slot[] = [
  'headline',
  'whatHappened',
  'whyItMatters',
  'betterWas',
  'lesson',
] as const;

export type Role =
  | 'reaction'
  | 'orientation'
  | 'observation'
  | 'consequence'
  | 'counterfactual'
  | 'advice'
  | 'definition';

export type PropKind =
  | 'verdict'
  | 'hangs'
  | 'attacked_by'
  | 'under_defended'
  | 'forked'
  | 'forks'
  | 'pinned'
  | 'skewered'
  | 'discovered'
  | 'trapped'
  | 'missed_capture'
  | 'missed_mate'
  | 'mate_allowed'
  | 'mate_delivered'
  | 'ignored_threat'
  | 'sacrifice'
  | 'only_move'
  | 'swing'
  | 'material_delta'
  | 'best_does'
  | 'best_line'
  | 'best_move'
  | 'left_book'
  | 'in_book'
  | 'back_rank'
  | 'passed_pawn'
  | 'promotion'
  | 'king_exposed'
  | 'overloaded'
  | 'zugzwang'
  | 'fortress'
  | 'traded_behind'
  | 'quiet_loss'
  | 'define'
  | 'lesson';

export type Arg = PieceRef | PieceRef[] | string | string[] | number | boolean;

export interface Proposition {
  kind: PropKind;
  role: Role;
  slot: Slot;
  args: Record<string, Arg>;
  /** Higher survives budget cuts longer. 1 = must keep. */
  weight: number;
}

export interface Plan {
  facts: MoveFacts;
  audience: MoveFacts['audience'];
  classification: Classification;
  /** The lead situation kind, for persona event lines and lesson choice. */
  lead: SituationKind;
  /** Slot order, then weight. */
  props: Proposition[];
  epLoss: number;
}

export interface Lexicon {
  /** "knight", or a persona's own word for it when its allowed list permits. */
  pieceNames: Record<PieceRef['piece'], string>;
  /** "takes" | "captures on" | "wins". */
  captureVerb: string;
  /** "you" | "friends" | "chat" | "you at home". */
  address: string;
  intensifiers: string[];
  /** Highest first. */
  praise: string[];
  blame: string[];
  /** "uh", "yeah", "okay"; may be empty. */
  fillers: string[];
  /** "and", "so", "but", "—". */
  connectives: string[];
}

export interface Syntax {
  maxSentenceWords: number;
  /** Allow verbless fragments. */
  fragments: boolean;
  /** agadmator's run-ons. */
  chainWithAnd: boolean;
  /** 0..1 share of advice/consequence rendered as a question. */
  questionRate: number;
  /** Hikaru: verdict in the first four words. */
  verdictFirst: boolean;
  /** "here" instead of the square when unambiguous. */
  preferHere: boolean;
  imperativeAdvice: boolean;
}

export interface Prosody {
  exclamations: number;
  capsPeak: boolean;
  /** Opener keyed by loss size; returns a reaction or ''. */
  reaction: (epLoss: number, lead: SituationKind) => string;
  closer: (lead: SituationKind) => string;
  sentenceCase: boolean;
}

export interface RenderContext {
  lexicon: Lexicon;
  syntax: Syntax;
  audience: MoveFacts['audience'];
  /** Referring expressions: first mention full, later "it"/"the knight". */
  refer: (piece: PieceRef) => string;
  square: (sq: string) => string;
  move: (san: string) => string;
  /** Seeded. */
  pick: <T>(variants: T[]) => T;
}

/** A frame renders one proposition kind to sentence variants; the realiser picks one. */
export type Frame = (p: Proposition, ctx: RenderContext) => string[];

export interface PersonaGrammar {
  id: string;
  lexicon: Lexicon;
  syntax: Syntax;
  prosody: Prosody;
  budgets: { words: number; perSentence?: number; exclamations: number };
  banned: string[];
  events: Partial<Record<Trigger, string[]>>;
  /** Persona-specific sentence frames; anything absent falls back to the neutral frame. */
  frames: Partial<Record<PropKind, Frame>>;
  /** Final pass over the whole note: contractions, "just" insertion, "Okay." endings. */
  shape: (slots: Record<Slot, string>, ctx: RenderContext) => Record<Slot, string>;
}
