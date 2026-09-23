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
  /** Absent when the game has no usable clocks (review-overhaul §14.2). */
  clock?: MoveClock;
}

/* ── time and termination (review-overhaul design §14.1) ───────────────
 * All times are milliseconds (integers). */

export interface MoveClock {
  /** On the mover's clock after the move (the %clk value). */
  left: number;
  /** Think time for this move, >= 0. */
  spent: number;
}

export interface TimeControl {
  /** Live: starting time; daily: time per move. */
  base: number;
  /** Added after each move; 0 for daily. */
  increment: number;
  daily: boolean;
}

export type TerminationKind =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'timeout_vs_insufficient'
  | 'abandoned'
  | 'agreement'
  | 'repetition'
  | 'stalemate'
  | 'insufficient'
  | 'fifty_move'
  | 'unknown';

export type Verdict = 'winning' | 'better' | 'equal' | 'worse' | 'losing';

export interface GameEnding {
  kind: TerminationKind;
  /** Null for a draw or unknown. */
  winner: Color | null;
  /** The board itself ended it (checkmate, stalemate, insufficient, fifty_move, repetition). */
  onBoard: boolean;
  /** Plies played; the game ended with `atPly` moves on the board. */
  atPly: number;
  /** Final position, White's view: evalAfter.lines[0] of the last move, else terminalScore. */
  evalAtEnd: Score;
  /** The same eval read from each side. Use `verdictAtEnd[userSide]`. */
  verdictAtEnd: Record<Color, Verdict>;
  /** Both clocks when the game ended, when the game has clocks. A flagged side reads 0. */
  clocks?: Record<Color, number>;
  /** timeout / timeout_vs_insufficient only: the unfinished think that ran out (the loser's last `left`). */
  finalThink?: number;
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
  /** Absent when TimeControl is missing or "-". */
  timeControl?: TimeControl;
  /** How the game ended. Required from SCORING_VERSION 's3'. */
  ending: GameEnding;
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
  /**
   * The reader's side: 'w' | 'b' for a member, null for a neutral reader.
   * Absent on legacy facts, where the reader is the mover.
   */
  perspective?: Color | null;
  /**
   * For inaccuracy, mistake, blunder and miss: the opponent's best reply and
   * what it did (review-overhaul design §13.1).
   */
  refutation?: Refutation;
  /** For the same classes: the best move and where it would have left the game. */
  betterLine?: BetterLine;
  /** Only when the review has clocks (review-overhaul §14.5). */
  clock?: MoveClockFacts;
  /** On the last ply's facts only. */
  ending?: GameEnding & { final: true };
}

/** A move's clock, as the coach may speak of it. Milliseconds. */
export interface MoveClockFacts {
  spent: number;
  left: number;
  /** The mover's clock before the move (their previous `left`, or the base). */
  leftBefore: number;
  /** leftBefore under the time-trouble threshold (report.ts `troubleThreshold`). */
  inTrouble: boolean;
  /** spent < FAST_FRACTION of the mover's median think and < FAST_MAX_MS. */
  fast: boolean;
  /** spent > LONG_FACTOR x the mover's median and >= LONG_MIN_MS. */
  longThink: boolean;
}

/** The tactic a refutation's first move creates, when a detector finds one. */
export type RefutationTactic =
  | { type: 'pin'; pinned: PieceRef; pinner: PieceRef; against: PieceRef; absolute: boolean }
  | { type: 'fork'; by: PieceRef; targets: PieceRef[] }
  | { type: 'skewer'; front: PieceRef; behind: PieceRef; by: PieceRef }
  | { type: 'discovered_attack'; mover: PieceRef; attacker: PieceRef; target: PieceRef; check: boolean }
  | { type: 'capture'; target: PieceRef; undefended: boolean }
  | { type: 'mate'; mateIn: number }
  | { type: 'check' };

export interface Refutation {
  /** SAN, the opponent's best reply first (evalAfter.lines[0].pv), 1–4 plies. */
  line: string[];
  /** The move number of line[0]. */
  moveNumber: number;
  tactic?: RefutationTactic;
  /** Pieces the mover won and lost over [played move, ...line], upper-case letters. */
  gained: PieceRef['piece'][];
  lost: PieceRef['piece'][];
  /** Net material over the same stretch, pawn units, mover's view (negative = the mover lost). */
  net: number;
  /** The reply actually played in the game, SAN, when there was one. */
  actual?: string;
}

export interface BetterLine {
  /** SAN, the best move first (evalBefore.lines[0].pv), up to 3 plies. */
  line: string[];
  /** The move number of line[0]. */
  moveNumber: number;
  /** evalBefore.lines[0].score, White's view. */
  score: Score;
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
