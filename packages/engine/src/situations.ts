import type { Classification, Motif, MoveFacts, Situation, SituationKind } from './types.ts';

/**
 * Situation ranking, design §6.
 *
 * Maps motifs, classification and the best-move effect to ranked situations,
 * best first. The facts object is everything but the situations themselves.
 */

/** Pawn units. Kept local so this module stays a pure mapping over facts. */
const VALUE: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

const valueOf = (piece: string): number => VALUE[piece.toUpperCase()] ?? 0;

/** Severity, design §6. Kinds whose severity depends on a value are computed. */
const SEVERITY: Record<SituationKind, number> = {
  allowed_mate: 1.0,
  missed_mate: 0.98,
  mate_delivered: 0.97,
  sound_sacrifice: 0.9,
  walked_into_fork: 0.85,
  ignored_threat: 0.8,
  unsound_sacrifice: 0.8,
  created_fork: 0.8,
  trapped_piece: 0.75,
  created_discovered: 0.75,
  walked_into_skewer: 0.7,
  only_move: 0.7,
  walked_into_pin: 0.65,
  hung_piece: 0.6, // + 0.04 · value
  overloaded: 0.6,
  promotion: 0.6,
  king_exposed: 0.55,
  under_defended: 0.5,
  missed_capture: 0.5, // + 0.04 · value
  traded_behind: 0.45,
  back_rank: 0.4,
  passed_pawn: 0.4,
  quiet_loss: 0.35,
  zugzwang: 0.35,
  fortress: 0.3,
  left_book: 0.3,
  best: 0.2,
  good: 0.15,
  book: 0.1,
};

/** Praise: never said about a move that lost expected points. */
const PRAISE: ReadonlySet<SituationKind> = new Set<SituationKind>([
  'sound_sacrifice',
  'created_fork',
  'created_discovered',
  'only_move',
  'best',
  'good',
  'mate_delivered',
  'passed_pawn',
  'promotion',
]);

/** Loss: never said about a move the engine was happy with. */
const LOSS: ReadonlySet<SituationKind> = new Set<SituationKind>([
  'allowed_mate',
  'missed_mate',
  'hung_piece',
  'under_defended',
  'walked_into_fork',
  'walked_into_pin',
  'walked_into_skewer',
  'missed_capture',
  'ignored_threat',
  'trapped_piece',
  'traded_behind',
  'unsound_sacrifice',
  'quiet_loss',
  'back_rank',
  'king_exposed',
  'overloaded',
  'zugzwang',
  'fortress',
]);

const GOOD_MOVE: ReadonlySet<Classification> = new Set<Classification>([
  'best',
  'excellent',
  'good',
  'book',
  'brilliant',
  'great',
]);

/** Loss situations need `epLoss >= 0.045` before a quiet move is worth a word. */
const QUIET_LOSS_EP = 0.045;

export const isPraiseSituation = (kind: SituationKind): boolean => PRAISE.has(kind);
export const isLossSituation = (kind: SituationKind): boolean => LOSS.has(kind);

/** One motif to at most one situation. Severity comes from the table above. */
function fromMotif(motif: Motif): Situation | null {
  switch (motif.type) {
    case 'mate_threat':
      return { kind: 'allowed_mate', severity: SEVERITY.allowed_mate, motif };
    case 'missed_mate':
      return { kind: 'missed_mate', severity: SEVERITY.missed_mate, motif };
    case 'hanging_piece':
      return motif.defenders.length === 0
        ? {
            kind: 'hung_piece',
            severity: SEVERITY.hung_piece + 0.04 * valueOf(motif.target.piece),
            motif,
          }
        : { kind: 'under_defended', severity: SEVERITY.under_defended, motif };
    case 'fork':
      return motif.byMover
        ? { kind: 'created_fork', severity: SEVERITY.created_fork, motif }
        : { kind: 'walked_into_fork', severity: SEVERITY.walked_into_fork, motif };
    case 'pin':
      return { kind: 'walked_into_pin', severity: SEVERITY.walked_into_pin, motif };
    case 'skewer':
      return { kind: 'walked_into_skewer', severity: SEVERITY.walked_into_skewer, motif };
    case 'discovered_attack':
      return { kind: 'created_discovered', severity: SEVERITY.created_discovered, motif };
    case 'trapped_piece':
      return { kind: 'trapped_piece', severity: SEVERITY.trapped_piece, motif };
    case 'missed_capture':
      return {
        kind: 'missed_capture',
        severity: SEVERITY.missed_capture + 0.04 * motif.value,
        motif,
      };
    case 'opponent_threat':
      return {
        kind: 'ignored_threat',
        severity: motif.kind === 'mate' ? 0.95 : SEVERITY.ignored_threat,
        motif,
      };
    case 'sacrifice':
      return motif.sound
        ? { kind: 'sound_sacrifice', severity: SEVERITY.sound_sacrifice, motif }
        : { kind: 'unsound_sacrifice', severity: SEVERITY.unsound_sacrifice, motif };
    case 'only_move':
      return { kind: 'only_move', severity: SEVERITY.only_move, motif };
    case 'back_rank_weak':
      return { kind: 'back_rank', severity: SEVERITY.back_rank, motif };
    case 'passed_pawn':
      return { kind: 'passed_pawn', severity: SEVERITY.passed_pawn, motif };
    case 'promotion':
      return { kind: 'promotion', severity: SEVERITY.promotion, motif };
    case 'king_safety':
      return { kind: 'king_exposed', severity: SEVERITY.king_exposed, motif };
    case 'overloaded_defender':
      return { kind: 'overloaded', severity: SEVERITY.overloaded, motif };
    case 'zugzwang':
      return { kind: 'zugzwang', severity: SEVERITY.zugzwang, motif };
    case 'fortress':
      return { kind: 'fortress', severity: SEVERITY.fortress, motif };
    case 'traded_while_behind':
      return { kind: 'traded_behind', severity: SEVERITY.traded_behind, motif };
    default:
      return null;
  }
}

/** SAN without the check and mate marks, so "Qh7#" and "Qh7" compare equal. */
const bareSan = (san: string): string => san.replace(/[+#]+$/, '').trim();

/** The most a note can carry. */
const MAX_SITUATIONS = 6;

export function rankSituations(facts: Omit<MoveFacts, 'situations'>): Situation[] {
  const out: Situation[] = [];

  for (const motif of facts.motifs) {
    const situation = fromMotif(motif);
    if (situation) out.push(situation);
  }

  const goodMove = GOOD_MOVE.has(facts.classification);
  const playedTheBestMove = bareSan(facts.san) === bareSan(facts.bestMove);

  // Mate on the board, delivered by the move that was played.
  if (
    facts.classification === 'best' &&
    facts.bestMoveEffect.mateIn === 1 &&
    playedTheBestMove
  ) {
    out.push({ kind: 'mate_delivered', severity: SEVERITY.mate_delivered });
  }

  if (facts.classification === 'book') {
    out.push({ kind: 'book', severity: SEVERITY.book });
  }

  if (facts.leftBook) {
    out.push({ kind: 'left_book', severity: SEVERITY.left_book });
  }

  // A good move with nothing else to praise still gets its due.
  if (goodMove && facts.classification !== 'book' && !out.some((s) => PRAISE.has(s.kind))) {
    const kind: SituationKind =
      facts.classification === 'excellent' || facts.classification === 'good' ? 'good' : 'best';
    out.push({ kind, severity: SEVERITY[kind] });
  }

  // §6: a good move never carries a loss; a losing move never carries praise.
  const kept = out.filter((s) => (goodMove ? !LOSS.has(s.kind) : !PRAISE.has(s.kind)));

  // The quiet drift nobody can point at: only when nothing else was found.
  if (!goodMove && !kept.some((s) => LOSS.has(s.kind)) && facts.epLoss >= QUIET_LOSS_EP) {
    kept.push({ kind: 'quiet_loss', severity: SEVERITY.quiet_loss });
  }

  // Stable sort: equal severities keep motif order, then classification order.
  // A miss is defined by what was not taken: the missed tactic leads, ahead of
  // whatever incidental pin or weakness the position also shows.
  if (facts.classification === 'miss') {
    for (const s of kept) {
      if (s.kind === 'missed_capture' || s.kind === 'missed_mate') s.severity = Math.max(s.severity, 0.96);
    }
  }

  return kept.sort((a, b) => b.severity - a.severity).slice(0, MAX_SITUATIONS);
}
