import type { PersonaGrammar } from '../contracts.ts';
import { DEFAULT_PERSONA_ID } from '../personas.ts';
import { agad } from './agad.ts';
import { andrea } from './andrea.ts';
import { finegold } from './finegold.ts';
import { gotham } from './gotham.ts';
import { hikaru } from './hikaru.ts';
import { rosen } from './rosen.ts';
import { sagar } from './sagar.ts';

export { neutralGrammar } from './neutral.ts';

/** Every voice, keyed by persona id. */
export const GRAMMARS: Record<string, PersonaGrammar> = {
  gotham,
  hikaru,
  sagar,
  agad,
  rosen,
  finegold,
  andrea,
};

export function grammarFor(id: string | null | undefined): PersonaGrammar {
  return GRAMMARS[id ?? ''] ?? GRAMMARS[DEFAULT_PERSONA_ID]!;
}
