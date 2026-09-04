/**
 * Frozen contracts, section 4 of docs/superpowers/specs/2026-09-03-greekgift-v1-design.md.
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

/** Verified facts about one move. The coach may only mention what is here. */
export interface MoveFacts {
  ply: number;
  san: string;
  classification: Classification;
  epLoss: number;
  winBefore: number;
  winAfter: number;
  bestMove: string; // SAN
  bestLine: string[]; // SAN, max 5
  playedLine: string[]; // SAN, engine's reply line after the played move, max 5
  motifs: Motif[];
  materialAfterBestLine: number; // pawn units, mover's view
  materialAfterPlayedLine: number;
  phase: 'opening' | 'middlegame' | 'endgame';
  opening?: { eco: string; name: string };
  leftBook: boolean;
  threatOfBestMove?: string[]; // SAN line found by null-move probe
  audience: 'beginner' | 'intermediate' | 'advanced';
}

export type Motif =
  | {
      type: 'hanging_piece';
      square: string;
      piece: string;
      side: Color;
      attackers: string[];
      defenders: string[];
    }
  | { type: 'missed_capture'; square: string; piece: string; value: number }
  | { type: 'fork'; by: string; targets: string[] }
  | {
      type: 'pin';
      pinned: string;
      pinner: string;
      against: string;
      absolute: boolean;
    }
  | {
      type: 'discovered_attack';
      mover: string;
      attacker: string;
      target: string;
    }
  | { type: 'mate_threat'; line: string[] }
  | { type: 'missed_mate'; line: string[] }
  | { type: 'back_rank_weak'; side: Color }
  | { type: 'trapped_piece'; square: string; piece: string }
  | { type: 'sacrifice'; piece: string; square: string; netMaterial: number }
  | { type: 'only_move'; secondBestEpLoss: number };

export interface CoachText {
  ply: number;
  headline: string; // <= 60 chars
  whatHappened: string; // 1–2 sentences
  whyItMatters: string; // 1–2 sentences
  betterWas: string; // 1–2 sentences, must name bestMove
  lesson: string; // 1 sentence
  source: 'llm' | 'template';
  model?: string;
}
