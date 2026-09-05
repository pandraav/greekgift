import data from './data/personas.json' with { type: 'json' };

/**
 * The coaches.
 *
 * Content lives in `docs/superpowers/specs/2026-09-04-coach-personas.md` and is
 * compiled here by `scripts/build-personas.mjs`. Editing this file's data is a
 * mistake — edit the spec and rebuild, so the document and the app cannot drift.
 */

/** Events a persona has a scripted flavour line for. */
export type Trigger =
  | 'reviewStart'
  | 'brilliant'
  | 'great'
  | 'blunder'
  | 'mistake'
  | 'miss'
  | 'bookExit'
  | 'comeback'
  | 'collapse'
  | 'highAccuracy'
  | 'lowAccuracy'
  | 'longGame'
  | 'reviewEnd'
  | 'random';

export interface PersonaBudgets {
  words: number;
  perSentence?: number;
  exclamations: number;
}

export interface Persona {
  id: string;
  /** Shown in the picker when creator labels are on. */
  label: string;
  /** The non-attributed name, and the label when they are off. */
  style: string;
  description: string;
  /** Their real repertoire, shown as "plays:". */
  book: string;
  rating: number;
  country: string;
  isDefault?: boolean;
  voiceRules: string[];
  allowed: string[];
  banned: string[];
  budgets: PersonaBudgets;
  humourTarget: string;
  lines: Partial<Record<Trigger, string>>;
  /** The spec's own rendering of the shared example. Documentation and tests. */
  rendered: Record<string, string>;
}

export const PERSONAS = data as unknown as Persona[];

/**
 * Imitating a style is lawful; evoking an identity commercially is the
 * exposure. One flag switches every label in the app.
 */
export const USE_CREATOR_LABELS = true;

export const personaName = (persona: Persona): string =>
  USE_CREATOR_LABELS ? persona.label : persona.style;

export const DEFAULT_PERSONA_ID =
  PERSONAS.find((p) => p.isDefault)?.id ?? PERSONAS[0]!.id;

export function findPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? getPersona(DEFAULT_PERSONA_ID);
}

function getPersona(id: string): Persona {
  const found = PERSONAS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown persona: ${id}`);
  return found;
}

/** Initials for the avatar, from whichever name is on show. */
export const personaInitials = (persona: Persona): string =>
  personaName(persona)
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
