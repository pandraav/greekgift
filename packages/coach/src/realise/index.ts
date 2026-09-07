import type { CoachText } from '@greekgift/engine';

import type { PersonaGrammar, Plan } from '../contracts.ts';
import { fitToBudget } from './budget.ts';

export { fitToBudget } from './budget.ts';

/**
 * The realiser, section 8 of the design.
 *
 * Renders a plan through a persona grammar: neutral frames per proposition
 * kind (a persona's own frames override them), referring expressions,
 * aggregation, seeded variation, the persona's reaction, closer and shaping
 * pass, then the budgets. Never throws and never returns an empty slot.
 */
export function realise(plan: Plan, grammar: PersonaGrammar, seed: number): CoachText {
  const { slots } = fitToBudget(plan, grammar, seed);
  return {
    ply: plan.facts.ply,
    headline: slots.headline,
    whatHappened: slots.whatHappened,
    whyItMatters: slots.whyItMatters,
    betterWas: slots.betterWas,
    lesson: slots.lesson,
    source: 'rules',
  };
}
