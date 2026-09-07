import type { PersonaGrammar } from '../contracts.ts';
import { findPersona, type Trigger } from '../personas.ts';

/**
 * The voiceless baseline every persona grammar starts from. Budgets, banned
 * words and the scripted event lines come from the compiled persona data;
 * everything else is the plainest possible choice. A persona module overrides
 * what its voice rules demand and leaves the rest.
 */
export function neutralGrammar(id: string): PersonaGrammar {
  const persona = findPersona(id);
  const events: Partial<Record<Trigger, string[]>> = {};
  for (const [trigger, line] of Object.entries(persona.lines)) {
    if (line) events[trigger as Trigger] = [line];
  }

  return {
    id: persona.id,
    lexicon: {
      pieceNames: { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' },
      captureVerb: 'takes',
      address: 'you',
      intensifiers: [],
      praise: ['good'],
      blame: ['a mistake'],
      fillers: [],
      connectives: ['and', 'so', 'but'],
    },
    syntax: {
      maxSentenceWords: 22,
      fragments: false,
      chainWithAnd: false,
      questionRate: 0,
      verdictFirst: false,
      preferHere: false,
      imperativeAdvice: true,
    },
    prosody: {
      exclamations: persona.budgets.exclamations,
      capsPeak: false,
      reaction: () => '',
      closer: () => '',
      sentenceCase: true,
    },
    budgets: persona.budgets,
    banned: persona.banned,
    events,
    frames: {},
    shape: (slots) => slots,
  };
}
