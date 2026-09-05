import { Chess, type Square } from 'chess.js';

import {
  backRankWeak,
  captureValue,
  forkBy,
  hangingPieces,
  material,
  pieceName,
  pinsAgainst,
} from './motifs.ts';
import type { Color, Motif, MoveAnalysis, MoveFacts, Review } from './types.ts';

/**
 * Everything true about one move, and nothing else.
 *
 * This is the contract between the engine and the coach: the coach is handed
 * this object and may mention what is in it. It cannot invent a fork, a square
 * or an evaluation, because it is never told anything it could invent from.
 */

const MAX_LINE = 5;

/** UCI moves replayed into SAN, which is the only notation worth reading. */
export function toSan(fen: string, uciLine: string[], limit = MAX_LINE): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];

  for (const uci of uciLine.slice(0, limit)) {
    try {
      sans.push(
        chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci.length > 4 ? { promotion: uci[4] } : {}),
        }).san,
      );
    } catch {
      break; // A truncated or stale pv; what we have is still true.
    }
  }

  return sans;
}

/** The position at the end of a line, for weighing one against the other. */
function fenAfterLine(fen: string, uciLine: string[], limit = MAX_LINE): string {
  const chess = new Chess(fen);
  for (const uci of uciLine.slice(0, limit)) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {}),
      });
    } catch {
      break;
    }
  }
  return chess.fen();
}

/**
 * Opening, middlegame or endgame — by material, the way players actually mean
 * it. A queenless position on move 15 is an endgame whatever the move number.
 */
export function phaseOf(fen: string, ply: number): MoveFacts['phase'] {
  const chess = new Chess(fen);
  let heavy = 0;
  let minor = 0;

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.type === 'q' || cell.type === 'r') heavy++;
      if (cell.type === 'b' || cell.type === 'n') minor++;
    }
  }

  if (heavy + minor <= 6) return 'endgame';
  if (ply <= 20) return 'opening';
  return 'middlegame';
}

/**
 * Content depth, from the player's rating.
 *
 * This is the axis the persona does *not* control: someone can pick any voice
 * they like, and the depth still follows what they are rated. Voice and
 * difficulty are independent on purpose.
 */
export function audienceFor(rating: number | undefined): MoveFacts['audience'] {
  if (rating === undefined) return 'intermediate';
  if (rating < 1200) return 'beginner';
  if (rating < 1900) return 'intermediate';
  return 'advanced';
}

/**
 * The motifs worth naming for this move.
 *
 * Order matters: the coach reads down this list and the first entries are what
 * it leads with, so the thing that explains the move comes first.
 */
export function motifsFor(move: MoveAnalysis): Motif[] {
  const mover: Color = move.color;
  const opponent: Color = mover === 'w' ? 'b' : 'w';
  const found: Motif[] = [];

  // What the opponent can now do with the piece that just arrived, and with
  // whatever else they have — computed on the position the move created.
  const landedOn = move.uci.slice(2, 4) as Square;

  const bestReply = move.evalAfter.lines[0]?.pv[0];
  if (bestReply) {
    const fork = forkBy(fenAfterUci(move.fenAfter, bestReply), bestReply.slice(2, 4) as Square);
    if (fork) found.push(fork);
  }

  for (const hanging of hangingPieces(move.fenAfter, mover).slice(0, 2)) found.push(hanging);
  for (const pin of pinsAgainst(move.fenAfter, mover).slice(0, 1)) found.push(pin);

  // True on move 10 of almost every castled game, and useless there: the back
  // rank only becomes a theme once there are lines open to reach it.
  if (phaseOf(move.fenAfter, move.ply) !== 'opening') {
    const weak = backRankWeak(move.fenAfter, mover);
    if (weak) found.push(weak);
  }

  // Did the move give something away for nothing? A sacrifice the engine likes
  // is a different fact from one it does not, and the eval already says which.
  const gave = captureValue(move.fenBefore, move.uci);
  const swing = material(move.fenAfter) - material(move.fenBefore);
  const fromMover = mover === 'w' ? swing : -swing;
  if (gave === 0 && fromMover < 0) {
    const piece = new Chess(move.fenBefore).get(move.uci.slice(0, 2) as Square);
    if (piece) {
      found.push({
        type: 'sacrifice',
        piece: pieceName(piece.type),
        square: landedOn,
        netMaterial: fromMover,
      });
    }
  }

  // A capture that was on the board and was not taken.
  const bestMove = move.evalBefore.lines[0]?.pv[0];
  if (bestMove && bestMove !== move.uci) {
    const missed = captureValue(move.fenBefore, bestMove);
    if (missed > 0) {
      const square = bestMove.slice(2, 4);
      const target = new Chess(move.fenBefore).get(square as Square);
      if (target) {
        found.push({
          type: 'missed_capture',
          square,
          piece: pieceName(target.type),
          value: missed,
        });
      }
    }
  }

  // Mate, given or thrown away, outranks everything else that might be true.
  const afterBest = move.evalBefore.lines[0];
  if (afterBest?.score.mate !== undefined) {
    const mateForMover =
      mover === 'w' ? afterBest.score.mate > 0 : afterBest.score.mate < 0;
    if (mateForMover && bestMove !== move.uci) {
      found.unshift({ type: 'missed_mate', line: toSan(move.fenBefore, afterBest.pv) });
    }
  }
  const afterPlayed = move.evalAfter.lines[0];
  if (afterPlayed?.score.mate !== undefined) {
    const mateForOpponent =
      opponent === 'w' ? afterPlayed.score.mate > 0 : afterPlayed.score.mate < 0;
    if (mateForOpponent) {
      found.unshift({
        type: 'mate_threat',
        line: toSan(move.fenAfter, afterPlayed.pv),
      });
    }
  }

  // "Only move" earns its place only when the alternative was genuinely worse.
  const second = move.evalBefore.lines[1];
  if (move.classification === 'best' && second) {
    const gap = Math.abs((move.evalBefore.lines[0]?.score.cp ?? 0) - (second.score.cp ?? 0));
    if (gap > 150) {
      found.push({ type: 'only_move', secondBestEpLoss: gap / 1000 });
    }
  }

  return found;
}

function fenAfterUci(fen: string, uci: string): string {
  const chess = new Chess(fen);
  try {
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci[4] } : {}),
    });
  } catch {
    return fen;
  }
  return chess.fen();
}

export interface FactsOptions {
  /**
   * How much to explain. Set it directly when the reader has said what they
   * want; otherwise `rating` picks it.
   */
  audience?: MoveFacts['audience'];
  /** The reader's rating, used only when `audience` is not given. */
  rating?: number;
}

/** Assembles the facts for one move of a built review. */
export function factsFor(
  review: Review,
  ply: number,
  options: FactsOptions = {},
): MoveFacts {
  const move = review.moves.find((m) => m.ply === ply);
  if (!move) throw new Error(`No move at ply ${ply}`);

  const bestUci = move.bestLine[0] ?? move.uci;
  const bestSan = toSan(move.fenBefore, [bestUci], 1)[0] ?? move.san;

  const playedLineUci = move.evalAfter.lines[0]?.pv ?? [];
  const moverIsWhite = move.color === 'w';

  const afterBest = material(fenAfterLine(move.fenBefore, move.bestLine));
  const afterPlayed = material(fenAfterLine(move.fenAfter, playedLineUci));

  return {
    ply: move.ply,
    san: move.san,
    classification: move.classification,
    epLoss: move.epLoss,
    winBefore: move.winBefore,
    winAfter: move.winAfter,
    bestMove: bestSan,
    bestLine: toSan(move.fenBefore, move.bestLine),
    playedLine: toSan(move.fenAfter, playedLineUci),
    motifs: motifsFor(move),
    materialAfterBestLine: moverIsWhite ? afterBest : -afterBest,
    materialAfterPlayedLine: moverIsWhite ? afterPlayed : -afterPlayed,
    phase: phaseOf(move.fenBefore, move.ply),
    ...(move.opening ? { opening: move.opening } : {}),
    leftBook: review.opening ? move.ply === review.opening.lastBookPly + 1 : false,
    audience: options.audience ?? audienceFor(options.rating),
  };
}
