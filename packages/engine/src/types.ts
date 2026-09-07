/**
 * Frozen contracts, section 4 of docs/superpowers/specs/2026-09-03-greekgift-v1-design.md,
 * extended by section 2 of docs/superpowers/specs/2026-09-07-deterministic-coach-design.md.
 *
 * Everything else codes against these. Fields may be added to a package's own
 * internal types; these must not change.
 */

export type Color = 'w' | 'b';

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** Score from White's point of view. Exactly one of cp / mate is set. */
export interface Score {
  cp?: number;
  mate?: number;
}

export interface EngineLine {
  multipv: 1 | 2 | 3;
  score: Score;
  pv: string[]; // UCI moves
  depth: number;
  nodes: number;
}

/** Deterministic evaluation of one position. Cached by (fen, nodes, engineBuild). */
export interface PositionEval {
  fen: string;
  nodes: number; // node budget used, e.g. 1_000_000
  engineBuild: string; // e.g. "stockfish-18-single-nn-9067e33176e8"
  lines: EngineLine[]; // multipv 1..3, best first
}

export interface MoveAnalysis {
  ply: number; // 1-based half-move index
  color: Color; // who moved
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: PositionEval;
  evalAfter: PositionEval;
  winBefore: number; // mover's win% before the move
  winAfter: number; // mover's win% after the move
  epLoss: number; // expected points lost, >= 0
  moveAccuracy: number; // 0..100
  classification: Classification;
  forced: boolean;
  bestMove: string; // UCI, from evalBefore.lines[0]
  bestLine: string[]; // UCI
  opening?: { eco: string; name: string };
}

export interface KeyMoment {
  ply: number;
  kind: 'blunder' | 'mistake' | 'miss' | 'brilliant' | 'great' | 'left_book';
  severity: number; // 0..1, used for ordering; 1 = most important
}

export interface PlayerSummary {
  username: string;
  color: Color;
  rating?: number; // from chess.com PGN header
  accuracy: number;
  acpl: number;
  estimatedRating: number;
  estimatedRatingBand: number; // ± value
  counts: Record<Classification, number>;
}

export interface Review {
  gameId: string; // chess.com game id
  engineBuild: string;
  nodes: number;
  moves: MoveAnalysis[];
  keyMoments: KeyMoment[];
  white: PlayerSummary;
  black: PlayerSummary;
  opening?: { eco: string; name: string; lastBookPly: number };
}

/** A piece on a square. `piece` is upper-case: K Q R B N P. */
export interface PieceRef {
  piece: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
  square: string;
  color: Color;
}

export type Motif =
  | {
      type: 'hanging_piece';
      target: PieceRef;
      attackers: PieceRef[]; // named, cheapest first
      defenders: PieceRef[];
    }
  | { type: 'missed_capture'; target: PieceRef; value: number }
  | { type: 'fork'; by: PieceRef; targets: PieceRef[]; byMover: boolean }
  | {
      type: 'pin';
      pinned: PieceRef;
      pinner: PieceRef;
      against: PieceRef;
      absolute: boolean;
    }
  | { type: 'skewer'; front: PieceRef; behind: PieceRef; by: PieceRef }
  | {
      type: 'discovered_attack';
      mover: PieceRef;
      attacker: PieceRef;
      target: PieceRef;
      check: boolean;
    }
  | { type: 'mate_threat'; line: string[] }
  | { type: 'missed_mate'; line: string[] }
  | { type: 'back_rank_weak'; side: Color }
  | { type: 'trapped_piece'; target: PieceRef; attackers: PieceRef[] }
  | { type: 'sacrifice'; piece: PieceRef; netMaterial: number; sound: boolean }
  | { type: 'only_move'; margin: number } // expected points, not centipawns
  | {
      type: 'opponent_threat';
      kind: 'capture' | 'fork' | 'check' | 'mate' | 'promotion';
      by: PieceRef;
      targets: PieceRef[];
      line: string[]; // SAN, the reply that carries it
    }
  | { type: 'traded_while_behind'; deficit: number; captured: PieceRef }
  | { type: 'passed_pawn'; pawn: PieceRef; stepsToPromote: number; created: boolean }
  | { type: 'promotion'; square: string; inBestLine: boolean }
  | {
      type: 'king_safety';
      side: Color;
      score: number; // 0..1, >= 0.5 is worth saying
      openFiles: string[];
      shieldMissing: string[];
      attackersInZone: PieceRef[];
    }
  | { type: 'overloaded_defender'; defender: PieceRef; duties: PieceRef[] }
  | { type: 'zugzwang'; side: Color }
  | { type: 'fortress'; side: Color; deficit: number; stablePlies: number };

/** What the best move would have done, from a static read plus the best line. */
export interface BestMoveEffect {
  captures?: PieceRef;
  check: boolean;
  mateIn?: number;
  forks?: PieceRef[];
  /** Pawn units after the best line minus after the played line, mover's view. */
  materialGain: number;
  line: string[]; // SAN, from bestLine
}

export type SituationKind =
  | 'allowed_mate'
  | 'missed_mate'
  | 'hung_piece'
  | 'under_defended'
  | 'walked_into_fork'
  | 'walked_into_pin'
  | 'walked_into_skewer'
  | 'missed_capture'
  | 'ignored_threat'
  | 'created_fork'
  | 'created_discovered'
  | 'trapped_piece'
  | 'traded_behind'
  | 'unsound_sacrifice'
  | 'sound_sacrifice'
  | 'only_move'
  | 'left_book'
  | 'book'
  | 'best'
  | 'good'
  | 'quiet_loss'
  | 'back_rank'
  | 'passed_pawn'
  | 'promotion'
  | 'king_exposed'
  | 'overloaded'
  | 'zugzwang'
  | 'fortress'
  | 'mate_delivered';

export interface Situation {
  kind: SituationKind;
  severity: number; // 0..1, ordering only
  motif?: Motif; // the evidence, when there is one
}

/** Verified facts about one move. The coach may only mention what is here. */
export interface MoveFacts {
  ply: number;
  color: Color;
  san: string;
  classification: Classification;
  epLoss: number;
  winBefore: number;
  winAfter: number;
  moveAccuracy: number;
  forced: boolean;
  bestMove: string; // SAN
  bestLine: string[]; // SAN, max 5
  playedLine: string[]; // SAN, engine's reply line after the played move, max 5
  motifs: Motif[];
  materialAfterBestLine: number; // pawn units, mover's view
  materialAfterPlayedLine: number;
  bestMoveEffect: BestMoveEffect;
  situations: Situation[]; // ranked, best first
  phase: 'opening' | 'middlegame' | 'endgame';
  opening?: { eco: string; name: string };
  leftBook: boolean;
  audience: 'beginner' | 'intermediate' | 'advanced';
}

export interface CoachText {
  ply: number;
  headline: string; // <= 60 chars
  whatHappened: string; // 1–2 sentences
  whyItMatters: string; // 1–2 sentences
  betterWas: string; // 1–2 sentences, must name bestMove
  lesson: string; // 1 sentence
  source: 'rules' | 'llm' | 'template';
  model?: string;
}
