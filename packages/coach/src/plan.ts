import type {
  Classification,
  Motif,
  MoveFacts,
  PieceRef,
  Situation,
  SituationKind,
} from '@greekgift/engine';

import { SLOTS, type Arg, type Plan, type PropKind, type Proposition, type Slot } from './contracts.ts';

/**
 * The planner, section 7 of docs/superpowers/specs/2026-09-07-deterministic-coach-design.md.
 *
 * Facts and their ranked situations in, a `Plan` out: one proposition per
 * thing worth saying, each pinned to a slot, carrying the arguments the
 * realiser needs and a weight that says how long it survives a budget cut.
 *
 * The planner cuts nothing itself. Budgets belong to personas, so the realiser
 * calls `fitPlan` with the persona's word budget once it knows it.
 *
 * Every plan carries: exactly one `verdict` (headline), at least one
 * observation (whatHappened), at least one consequence (whyItMatters), a
 * `best_move` (betterWas) and exactly one `lesson`. Those five are weight 1
 * and are never dropped.
 */

/** The planner's estimate of how many words one proposition renders to. */
export const WORDS_PER_PROP = 12;

/** Concept ids a `lesson` prop may carry, section 7. */
export type LessonConcept =
  | 'check_landing_square'
  | 'count_attackers'
  | 'look_for_captures'
  | 'checks_first'
  | 'defend_back_rank'
  | 'see_their_threat'
  | 'dont_trade_behind'
  | 'push_the_passer'
  | 'keep_the_shield'
  | 'one_defender_two_jobs'
  | 'keep_the_tension'
  | 'book_ends_here'
  | 'remember_this';

/** Terms a beginner gets defined the first time a note uses them, section 7. */
export type DefinedTerm =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered attack'
  | 'zugzwang'
  | 'fortress'
  | 'back rank'
  | 'passed pawn'
  | 'overloaded';

/** The lesson each lead situation teaches. */
export const LESSON_BY_LEAD: Record<SituationKind, LessonConcept> = {
  allowed_mate: 'see_their_threat',
  missed_mate: 'checks_first',
  mate_delivered: 'checks_first',
  hung_piece: 'count_attackers',
  under_defended: 'count_attackers',
  walked_into_fork: 'check_landing_square',
  walked_into_pin: 'check_landing_square',
  walked_into_skewer: 'check_landing_square',
  trapped_piece: 'check_landing_square',
  missed_capture: 'look_for_captures',
  ignored_threat: 'see_their_threat',
  created_fork: 'remember_this',
  created_discovered: 'remember_this',
  traded_behind: 'dont_trade_behind',
  unsound_sacrifice: 'count_attackers',
  sound_sacrifice: 'remember_this',
  only_move: 'remember_this',
  left_book: 'book_ends_here',
  book: 'remember_this',
  best: 'remember_this',
  good: 'remember_this',
  quiet_loss: 'keep_the_tension',
  back_rank: 'defend_back_rank',
  passed_pawn: 'push_the_passer',
  promotion: 'push_the_passer',
  king_exposed: 'keep_the_shield',
  overloaded: 'one_defender_two_jobs',
  zugzwang: 'keep_the_tension',
  fortress: 'remember_this',
};

/** The observation kind each lead situation is said as. Supporting `hung_piece` becomes `attacked_by`. */
export const OBSERVATION_BY_LEAD: Record<SituationKind, PropKind> = {
  allowed_mate: 'mate_allowed',
  missed_mate: 'missed_mate',
  mate_delivered: 'mate_delivered',
  hung_piece: 'hangs',
  under_defended: 'under_defended',
  walked_into_fork: 'forked',
  walked_into_pin: 'pinned',
  walked_into_skewer: 'skewered',
  trapped_piece: 'trapped',
  missed_capture: 'missed_capture',
  ignored_threat: 'ignored_threat',
  created_fork: 'forks',
  created_discovered: 'discovered',
  traded_behind: 'traded_behind',
  unsound_sacrifice: 'sacrifice',
  sound_sacrifice: 'sacrifice',
  only_move: 'only_move',
  left_book: 'left_book',
  book: 'in_book',
  best: 'best_does',
  good: 'best_does',
  quiet_loss: 'quiet_loss',
  back_rank: 'back_rank',
  passed_pawn: 'passed_pawn',
  promotion: 'promotion',
  king_exposed: 'king_exposed',
  overloaded: 'overloaded',
  zugzwang: 'zugzwang',
  fortress: 'fortress',
};

/** Which proposition kinds use a term a beginner may not know. */
const TERM_BY_KIND: Partial<Record<PropKind, DefinedTerm>> = {
  forked: 'fork',
  forks: 'fork',
  pinned: 'pin',
  skewered: 'skewer',
  discovered: 'discovered attack',
  zugzwang: 'zugzwang',
  fortress: 'fortress',
  back_rank: 'back rank',
  passed_pawn: 'passed pawn',
  overloaded: 'overloaded',
};

const WEIGHT = {
  must: 1,
  supporting: 0.6,
  mateConsequence: 0.9,
  bestDoes: 0.8,
  materialDelta: 0.7,
  bestLine: 0.4,
  define: 0.5,
} as const;

const GOOD: ReadonlySet<Classification> = new Set([
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
]);

const SLOT_INDEX: Record<Slot, number> = Object.fromEntries(
  SLOTS.map((slot, i) => [slot, i]),
) as Record<Slot, number>;

/** Loss situations, which a good move never carries and which drive the mate consequences. */
export function isLossMove(classification: Classification): boolean {
  return !GOOD.has(classification);
}

// ---------------------------------------------------------------------------
// Entry point

export function plan(facts: MoveFacts, audience: MoveFacts['audience']): Plan {
  const [first, second] = facts.situations;

  let lead: SituationKind = first?.kind ?? fallbackLead(facts);
  let leadObservation = observationFor(lead, first, facts, WEIGHT.must);
  if (!leadObservation) {
    // The situation named a motif the facts do not carry. Say what we can prove.
    lead = fallbackLead(facts);
    leadObservation = observationFor(lead, undefined, facts, WEIGHT.must);
  }
  // Every fallback lead is constructible from the facts alone.
  if (!leadObservation) throw new Error(`planner: no observation for lead ${lead}`);

  const props: Proposition[] = [];

  // headline
  props.push({
    kind: 'verdict',
    role: 'orientation',
    slot: 'headline',
    args: {
      classification: facts.classification,
      san: facts.san,
      ply: facts.ply,
      color: facts.color,
      lead,
    },
    weight: WEIGHT.must,
  });

  // whatHappened
  props.push(leadObservation);
  if (second && second.severity >= 0.5 && second.kind !== lead) {
    const supporting = observationFor(second.kind, second, facts, WEIGHT.supporting, true);
    if (supporting && !sameProp(supporting, leadObservation)) props.push(supporting);
  }

  // whyItMatters
  props.push(...consequencesFor(facts, lead));

  // betterWas
  props.push(...betterWasFor(facts, lead, audience));

  // lesson
  props.push({
    kind: 'lesson',
    role: 'advice',
    slot: 'lesson',
    args: { concept: LESSON_BY_LEAD[lead], lead },
    weight: WEIGHT.must,
  });

  // define, beginners only, for the first technical term the note uses
  if (audience === 'beginner') {
    const define = defineFor(props);
    if (define) props.push(define);
  }

  return {
    facts,
    audience,
    classification: facts.classification,
    lead,
    props: orderProps(props),
    epLoss: facts.epLoss,
  };
}

/**
 * Drops the lowest-weight propositions until the plan's estimated length
 * (`WORDS_PER_PROP` per prop) fits the word budget. Weight-1 props are never
 * dropped, so a tiny budget still gets every required slot. Among equal
 * weights the later prop goes first. Pure: returns a new plan.
 */
export function fitPlan(plan: Plan, wordBudget: number): Plan {
  const props = [...plan.props];
  while (props.length * WORDS_PER_PROP > wordBudget) {
    let victim = -1;
    for (let i = 0; i < props.length; i++) {
      const p = props[i]!;
      if (p.weight >= WEIGHT.must) continue;
      if (victim === -1 || p.weight <= props[victim]!.weight) victim = i;
    }
    if (victim === -1) break;
    props.splice(victim, 1);
  }
  return { ...plan, props };
}

/** Estimated rendered length of a plan, in words. */
export function estimateWords(plan: Plan): number {
  return plan.props.length * WORDS_PER_PROP;
}

// ---------------------------------------------------------------------------
// Lead fallback

/** The lead when the situations module has nothing to say: by classification alone. */
export function fallbackLead(facts: MoveFacts): SituationKind {
  if (facts.san.endsWith('#')) return 'mate_delivered';
  switch (facts.classification) {
    case 'best':
    case 'brilliant':
    case 'great':
      return 'best';
    case 'excellent':
    case 'good':
    case 'book':
      return 'good';
    default:
      return 'quiet_loss';
  }
}

// ---------------------------------------------------------------------------
// Observations

type MotifOf<T extends Motif['type']> = Extract<Motif, { type: T }>;

function findMotif<T extends Motif['type']>(
  situation: Situation | undefined,
  facts: MoveFacts,
  type: T,
  where: (m: MotifOf<T>) => boolean = () => true,
): MotifOf<T> | undefined {
  const own = situation?.motif;
  if (own && own.type === type && where(own as MotifOf<T>)) return own as MotifOf<T>;
  const all = facts.motifs.filter((m): m is MotifOf<T> => m.type === type);
  return all.find(where) ?? (own && own.type === type ? (own as MotifOf<T>) : undefined);
}

function observation(
  kind: PropKind,
  slot: Slot,
  args: Record<string, Arg>,
  weight: number,
): Proposition {
  return { kind, role: 'observation', slot, args, weight };
}

/**
 * The proposition that states a situation. Null when the situation needs a
 * motif the facts do not carry; the caller then falls back.
 */
function observationFor(
  kind: SituationKind,
  situation: Situation | undefined,
  facts: MoveFacts,
  weight: number,
  supporting = false,
): Proposition | null {
  const slot: Slot = 'whatHappened';
  const say = (propKind: PropKind, args: Record<string, Arg>) =>
    observation(propKind, slot, args, weight);

  switch (kind) {
    case 'hung_piece': {
      const m =
        findMotif(situation, facts, 'hanging_piece', (h) => h.defenders.length === 0) ??
        findMotif(situation, facts, 'hanging_piece');
      if (!m) return null;
      return say(supporting ? 'attacked_by' : 'hangs', {
        target: m.target,
        attackers: m.attackers,
        defenders: m.defenders,
      });
    }
    case 'under_defended': {
      const m =
        findMotif(situation, facts, 'hanging_piece', (h) => h.defenders.length > 0) ??
        findMotif(situation, facts, 'hanging_piece');
      if (!m) return null;
      return say('under_defended', {
        target: m.target,
        attackers: m.attackers,
        defenders: m.defenders,
      });
    }
    case 'walked_into_fork': {
      const m =
        findMotif(situation, facts, 'fork', (f) => !f.byMover) ??
        findMotif(situation, facts, 'fork');
      if (!m) return null;
      return say('forked', { by: m.by, targets: m.targets });
    }
    case 'created_fork': {
      const m =
        findMotif(situation, facts, 'fork', (f) => f.byMover) ??
        findMotif(situation, facts, 'fork');
      if (!m) return null;
      return say('forks', { by: m.by, targets: m.targets });
    }
    case 'walked_into_pin': {
      const m = findMotif(situation, facts, 'pin');
      if (!m) return null;
      return say('pinned', {
        pinned: m.pinned,
        pinner: m.pinner,
        against: m.against,
        absolute: m.absolute,
      });
    }
    case 'walked_into_skewer': {
      const m = findMotif(situation, facts, 'skewer');
      if (!m) return null;
      return say('skewered', { front: m.front, behind: m.behind, by: m.by });
    }
    case 'created_discovered': {
      const m = findMotif(situation, facts, 'discovered_attack');
      if (!m) return null;
      return say('discovered', {
        mover: m.mover,
        attacker: m.attacker,
        target: m.target,
        check: m.check,
      });
    }
    case 'trapped_piece': {
      const m = findMotif(situation, facts, 'trapped_piece');
      if (!m) return null;
      return say('trapped', { target: m.target, attackers: m.attackers });
    }
    case 'missed_capture': {
      const m = findMotif(situation, facts, 'missed_capture');
      if (!m) return null;
      return say('missed_capture', { target: m.target, value: m.value });
    }
    case 'missed_mate': {
      const m = findMotif(situation, facts, 'missed_mate');
      const args: Record<string, Arg> = {
        line: m?.line ?? facts.bestMoveEffect.line,
        move: facts.bestMove,
      };
      if (facts.bestMoveEffect.mateIn !== undefined) args.mateIn = facts.bestMoveEffect.mateIn;
      return say('missed_mate', args);
    }
    case 'allowed_mate': {
      const line = mateThreatLine(situation, facts) ?? facts.playedLine;
      return say('mate_allowed', { line, move: facts.san });
    }
    case 'mate_delivered':
      return say('mate_delivered', { move: facts.san, color: facts.color });
    case 'ignored_threat': {
      const m = findMotif(situation, facts, 'opponent_threat');
      if (!m) return null;
      return say('ignored_threat', {
        kind: m.kind,
        by: m.by,
        targets: m.targets,
        line: m.line,
      });
    }
    case 'unsound_sacrifice':
    case 'sound_sacrifice': {
      const wantSound = kind === 'sound_sacrifice';
      const m =
        findMotif(situation, facts, 'sacrifice', (s) => s.sound === wantSound) ??
        findMotif(situation, facts, 'sacrifice');
      if (!m) return null;
      return say('sacrifice', { piece: m.piece, netMaterial: m.netMaterial, sound: m.sound });
    }
    case 'only_move': {
      const m = findMotif(situation, facts, 'only_move');
      if (!m) return null;
      return say('only_move', { margin: m.margin, move: facts.san });
    }
    case 'left_book':
      return say('left_book', openingArgs(facts));
    case 'book':
      return say('in_book', openingArgs(facts));
    case 'best':
      return say('best_does', { ...effectArgs(facts), move: facts.san, played: true });
    case 'good':
      // The same shape as `best`: what the move did, not a second copy of the
      // swing that whyItMatters already carries.
      return say('best_does', { ...effectArgs(facts), move: facts.san, played: true });
    case 'quiet_loss':
      return say('quiet_loss', {
        ...effectArgs(facts),
        materialGain: facts.bestMoveEffect.materialGain,
        move: facts.bestMove,
      });
    case 'back_rank': {
      const m = findMotif(situation, facts, 'back_rank_weak');
      if (!m) return null;
      return say('back_rank', { side: m.side });
    }
    case 'passed_pawn': {
      const m = findMotif(situation, facts, 'passed_pawn');
      if (!m) return null;
      return say('passed_pawn', {
        pawn: m.pawn,
        stepsToPromote: m.stepsToPromote,
        created: m.created,
      });
    }
    case 'promotion': {
      const m = findMotif(situation, facts, 'promotion');
      if (!m) return null;
      return say('promotion', { square: m.square, inBestLine: m.inBestLine });
    }
    case 'king_exposed': {
      const m = findMotif(situation, facts, 'king_safety');
      if (!m) return null;
      return say('king_exposed', {
        side: m.side,
        score: m.score,
        openFiles: m.openFiles,
        shieldMissing: m.shieldMissing,
        attackersInZone: m.attackersInZone,
      });
    }
    case 'overloaded': {
      const m = findMotif(situation, facts, 'overloaded_defender');
      if (!m) return null;
      return say('overloaded', { defender: m.defender, duties: m.duties });
    }
    case 'zugzwang': {
      const m = findMotif(situation, facts, 'zugzwang');
      if (!m) return null;
      return say('zugzwang', { side: m.side });
    }
    case 'fortress': {
      const m = findMotif(situation, facts, 'fortress');
      if (!m) return null;
      return say('fortress', { side: m.side, deficit: m.deficit, stablePlies: m.stablePlies });
    }
    case 'traded_behind': {
      const m = findMotif(situation, facts, 'traded_while_behind');
      if (!m) return null;
      return say('traded_behind', { deficit: m.deficit, captured: m.captured });
    }
  }
}

/** The line that mates after the played move, from either motif that can carry it. */
function mateThreatLine(situation: Situation | undefined, facts: MoveFacts): string[] | undefined {
  const threat = findMotif(situation, facts, 'mate_threat');
  if (threat) return threat.line;
  const reply = findMotif(situation, facts, 'opponent_threat', (t) => t.kind === 'mate');
  return reply?.line;
}

function openingArgs(facts: MoveFacts): Record<string, Arg> {
  const args: Record<string, Arg> = { move: facts.san };
  if (facts.opening) {
    args.name = facts.opening.name;
    args.eco = facts.opening.eco;
  }
  return args;
}

function swingArgs(facts: MoveFacts): Record<string, Arg> {
  // A praise move that cost nothing is "held", whatever the raw percentages
  // say: a four-point wobble on a good move is not a story.
  const held = !isLossMove(facts.classification) && facts.epLoss < 0.045;
  return { winBefore: facts.winBefore, winAfter: facts.winAfter, epLoss: facts.epLoss, held };
}

/** The best move's effect as args, without undefined values. */
function effectArgs(facts: MoveFacts): Record<string, Arg> {
  const e = facts.bestMoveEffect;
  const args: Record<string, Arg> = { check: e.check, line: e.line };
  if (e.captures) args.captures = e.captures;
  if (e.mateIn !== undefined) args.mateIn = e.mateIn;
  if (e.forks && e.forks.length > 0) args.forks = e.forks;
  return args;
}

function effectIsNotable(facts: MoveFacts): boolean {
  const e = facts.bestMoveEffect;
  return Boolean(e.captures) || e.check || e.mateIn !== undefined || (e.forks?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Consequences, counterfactuals, definitions

function consequencesFor(facts: MoveFacts, lead: SituationKind): Proposition[] {
  const slot: Slot = 'whyItMatters';
  const out: Proposition[] = [
    { kind: 'swing', role: 'consequence', slot, args: swingArgs(facts), weight: WEIGHT.must },
  ];

  // Material only means something when the move gave some away: on a praise
  // move the best-line-minus-played-line figure is exchange noise, and read
  // aloud it says "you win a piece" about a move that won nothing.
  const gain = facts.bestMoveEffect.materialGain;
  if (isLossMove(facts.classification) && Math.abs(gain) >= 1) {
    // A miss did not lose material, it declined to win some: the sentence
    // must say "could have won", not "gone".
    const missed =
      facts.classification === 'miss' || facts.motifs.some((m) => m.type === 'missed_capture');
    out.push({
      kind: 'material_delta',
      role: 'consequence',
      slot,
      args: { materialGain: gain, missed },
      // On a miss the material that was there to win is the whole point, so
      // no voice's budget may drop it.
      weight: missed ? 0.95 : WEIGHT.materialDelta,
    });
  }

  // Mate consequences are only real for losing moves, and only when the lead
  // observation has not already said them.
  if (isLossMove(facts.classification)) {
    if (lead !== 'allowed_mate') {
      const line = mateThreatLine(undefined, facts);
      if (line) {
        out.push({
          kind: 'mate_allowed',
          role: 'consequence',
          slot,
          args: { line, move: facts.san },
          weight: WEIGHT.mateConsequence,
        });
      }
    }
    if (lead !== 'missed_mate') {
      const missed = findMotif(undefined, facts, 'missed_mate');
      const mateIn = facts.bestMoveEffect.mateIn;
      if (missed || (mateIn !== undefined && mateIn > 0)) {
        const args: Record<string, Arg> = {
          line: missed?.line ?? facts.bestMoveEffect.line,
          move: facts.bestMove,
        };
        if (mateIn !== undefined) args.mateIn = mateIn;
        out.push({
          kind: 'missed_mate',
          role: 'consequence',
          slot,
          args,
          weight: WEIGHT.mateConsequence,
        });
      }
    }
  }

  return out;
}

function betterWasFor(
  facts: MoveFacts,
  lead: SituationKind,
  audience: MoveFacts['audience'],
): Proposition[] {
  const slot: Slot = 'betterWas';
  const playedBest = facts.san === facts.bestMove;
  const out: Proposition[] = [
    {
      kind: 'best_move',
      role: 'counterfactual',
      slot,
      args: { move: facts.bestMove, san: facts.san, played: playedBest, lead },
      weight: WEIGHT.must,
    },
  ];

  // When the played move is the best move the lead observation already says
  // what it does; repeating it as a counterfactual would be noise.
  if (!playedBest && lead !== 'best' && effectIsNotable(facts)) {
    out.push({
      kind: 'best_does',
      role: 'counterfactual',
      slot,
      args: { ...effectArgs(facts), move: facts.bestMove, played: false },
      weight: WEIGHT.bestDoes,
    });
  }

  if (audience === 'advanced') {
    const line = facts.bestLine.length > 0 ? facts.bestLine : facts.bestMoveEffect.line;
    out.push({
      kind: 'best_line',
      role: 'counterfactual',
      slot,
      args: { line: line.length > 0 ? line : [facts.bestMove], move: facts.bestMove },
      weight: WEIGHT.bestLine,
    });
  }

  return out;
}

/** The first technical term the props use, in slot order, as a definition prop in that slot. */
function defineFor(props: Proposition[]): Proposition | null {
  for (const p of orderProps(props)) {
    const term = termOf(p);
    if (!term) continue;
    return {
      kind: 'define',
      role: 'definition',
      slot: p.slot,
      args: { term, of: p.kind },
      weight: WEIGHT.define,
    };
  }
  return null;
}

/** The term a prop uses, if any. */
export function termOf(p: Proposition): DefinedTerm | undefined {
  const direct = TERM_BY_KIND[p.kind];
  if (direct) return direct;
  if (p.kind === 'ignored_threat' && p.args.kind === 'fork') return 'fork';
  if ((p.kind === 'best_does' || p.kind === 'quiet_loss') && Array.isArray(p.args.forks)) {
    return 'fork';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Ordering

/** Slot order, then weight descending; stable within a tie. */
export function orderProps(props: Proposition[]): Proposition[] {
  return props
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        SLOT_INDEX[a.p.slot] - SLOT_INDEX[b.p.slot] || b.p.weight - a.p.weight || a.i - b.i,
    )
    .map(({ p }) => p);
}

function sameProp(a: Proposition, b: Proposition): boolean {
  return a.kind === b.kind && JSON.stringify(a.args) === JSON.stringify(b.args);
}

/** Exported for tests and the realiser: the piece a prop is chiefly about, when it has one. */
export function subjectOf(p: Proposition): PieceRef | undefined {
  for (const key of ['target', 'pinned', 'front', 'piece', 'pawn', 'defender', 'by']) {
    const v = p.args[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return undefined;
}
