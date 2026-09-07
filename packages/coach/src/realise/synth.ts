import type { Motif } from '@greekgift/engine';

import { SLOTS, type Plan, type PropKind, type Proposition, type Slot } from '../contracts.ts';
import { conceptFor } from './frames.ts';

/**
 * Propositions straight from the facts, for when the plan has none (or has
 * left a slot empty). This is a deliberately small planner: enough to
 * guarantee five non-empty slots, never more.
 */

const MOTIF_KIND: Partial<Record<Motif['type'], PropKind>> = {
  hanging_piece: 'hangs',
  missed_capture: 'missed_capture',
  pin: 'pinned',
  skewer: 'skewered',
  discovered_attack: 'discovered',
  mate_threat: 'mate_allowed',
  missed_mate: 'missed_mate',
  back_rank_weak: 'back_rank',
  trapped_piece: 'trapped',
  sacrifice: 'sacrifice',
  only_move: 'only_move',
  opponent_threat: 'ignored_threat',
  traded_while_behind: 'traded_behind',
  passed_pawn: 'passed_pawn',
  promotion: 'promotion',
  king_safety: 'king_exposed',
  overloaded_defender: 'overloaded',
  zugzwang: 'zugzwang',
  fortress: 'fortress',
};

function motifArgs(motif: Motif): Proposition['args'] {
  const { type: _type, ...rest } = motif;
  return rest as Proposition['args'];
}

function observation(plan: Plan): Proposition {
  const facts = plan.facts;
  const lead = facts.situations[0];
  const motif = lead?.motif ?? facts.motifs[0];
  const base = { role: 'observation' as const, slot: 'whatHappened' as const, weight: 1 };

  if (motif) {
    if (motif.type === 'fork') {
      return { ...base, kind: motif.byMover ? 'forks' : 'forked', args: motifArgs(motif) };
    }
    const kind = MOTIF_KIND[motif.type];
    if (kind) return { ...base, kind, args: motifArgs(motif) };
  }

  switch (plan.lead) {
    case 'allowed_mate':
      return { ...base, kind: 'mate_allowed', args: { line: facts.playedLine } };
    case 'missed_mate':
      return { ...base, kind: 'missed_mate', args: { line: facts.bestLine } };
    case 'mate_delivered':
      return { ...base, kind: 'mate_delivered', args: { san: facts.san } };
    case 'left_book':
      return { ...base, kind: 'left_book', args: facts.opening ? { ...facts.opening } : {} };
    case 'book':
      return { ...base, kind: 'in_book', args: facts.opening ? { ...facts.opening } : {} };
    case 'only_move':
      return { ...base, kind: 'only_move', args: { san: facts.san } };
    case 'quiet_loss':
      return { ...base, kind: 'quiet_loss', args: { epLoss: facts.epLoss, bestMove: facts.bestMove } };
    default:
      return {
        ...base,
        kind: 'verdict',
        args: { classification: plan.classification, san: facts.san, lead: plan.lead },
      };
  }
}

export function synthesiseSlot(plan: Plan, slot: Slot): Proposition[] {
  const facts = plan.facts;
  switch (slot) {
    case 'headline':
      return [
        {
          kind: 'verdict',
          role: 'orientation',
          slot,
          args: { classification: plan.classification, san: facts.san, lead: plan.lead },
          weight: 1,
        },
      ];
    case 'whatHappened':
      return [observation(plan)];
    case 'whyItMatters': {
      const props: Proposition[] = [
        {
          kind: 'swing',
          role: 'consequence',
          slot,
          args: { winBefore: facts.winBefore, winAfter: facts.winAfter, epLoss: plan.epLoss },
          weight: 1,
        },
      ];
      if (Math.abs(facts.bestMoveEffect.materialGain) >= 1) {
        props.push({
          kind: 'material_delta',
          role: 'consequence',
          slot,
          args: { materialGain: facts.bestMoveEffect.materialGain },
          weight: 0.7,
        });
      }
      return props;
    }
    case 'betterWas': {
      const props: Proposition[] = [
        { kind: 'best_move', role: 'counterfactual', slot, args: { move: facts.bestMove }, weight: 1 },
      ];
      const e = facts.bestMoveEffect;
      if (e.captures || e.check || e.mateIn || (e.forks && e.forks.length >= 2)) {
        props.push({
          kind: 'best_does',
          role: 'counterfactual',
          slot,
          args: {
            move: facts.bestMove,
            ...(e.captures ? { captures: e.captures } : {}),
            check: e.check,
            ...(e.mateIn ? { mateIn: e.mateIn } : {}),
            ...(e.forks ? { forks: e.forks } : {}),
          },
          weight: 0.8,
        });
      }
      return props;
    }
    case 'lesson':
      return [{ kind: 'lesson', role: 'advice', slot, args: { concept: conceptFor(plan.lead) }, weight: 1 }];
    default:
      return [];
  }
}

/**
 * The plan's props minus the dropped ones, with any empty slot filled from the
 * facts, in slot order. Indices refer to `plan.props`.
 */
export function ensureProps(plan: Plan, dropped: ReadonlySet<number>): Proposition[] {
  const kept = plan.props.filter((_, i) => !dropped.has(i));
  const out: Proposition[] = [];
  for (const slot of SLOTS) {
    const inSlot = kept.filter((p) => p.slot === slot);
    out.push(...(inSlot.length > 0 ? inSlot : synthesiseSlot(plan, slot)));
  }
  return out;
}
