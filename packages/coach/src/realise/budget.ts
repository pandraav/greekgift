import { SLOTS, type PersonaGrammar, type Plan, type Proposition } from '../contracts.ts';
import { renderOnce, type Rendered, type RenderOptions } from './assemble.ts';
import { ensureProps } from './synth.ts';

/**
 * Word budgets are met by saying less, never by cutting words.
 *
 * Order of retreat: drop the lowest-weight proposition (never weight 1, never
 * the last one in its slot), re-render; then pick the shortest variants; then
 * drop the closer; then the reaction. The result of the final attempt is
 * returned even when it is still over — the validator reports that, and a
 * persona whose weight-1 frames cannot fit its own budget has a voice bug.
 *
 * The planner may export its own `fitPlan`; this stays independent of it so
 * the realiser is complete on its own.
 */
export function fitToBudget(plan: Plan, grammar: PersonaGrammar, seed: number): Rendered {
  const budget = grammar.budgets.words > 0 ? grammar.budgets.words : Infinity;
  const dropped = new Set<number>();
  const opts: RenderOptions = { dropped, terse: false, closer: true, reaction: true };

  for (let attempt = 0; attempt < plan.props.length + 4; attempt++) {
    const props = ensureProps(plan, dropped);
    const rendered = renderOnce(plan, grammar, seed, opts, props);
    if (rendered.words <= budget) return rendered;

    const next = droppable(plan.props, dropped);
    if (next !== undefined) {
      dropped.add(next);
      continue;
    }
    if (!opts.terse) {
      opts.terse = true;
      continue;
    }
    if (opts.closer) {
      opts.closer = false;
      continue;
    }
    if (opts.reaction) {
      opts.reaction = false;
      continue;
    }
    return rendered;
  }

  return renderOnce(plan, grammar, seed, opts, ensureProps(plan, dropped));
}

/** The index of the lowest-weight prop that may still go, latest first on ties. */
function droppable(props: Proposition[], dropped: ReadonlySet<number>): number | undefined {
  let best: number | undefined;
  for (let i = 0; i < props.length; i++) {
    if (dropped.has(i)) continue;
    const p = props[i]!;
    if (p.weight >= 1) continue;
    const slotMates = props.filter((q, j) => j !== i && !dropped.has(j) && q.slot === p.slot);
    if (slotMates.length === 0 && SLOTS.includes(p.slot)) continue;
    if (best === undefined || p.weight <= props[best]!.weight) best = i;
  }
  return best;
}
