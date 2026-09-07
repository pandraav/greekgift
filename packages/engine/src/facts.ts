import { Chess, type Square } from 'chess.js';

import { discoveredAttack } from './detect/discovered.ts';
import { fortress } from './detect/fortress.ts';
import { kingSafety } from './detect/king-safety.ts';
import { opponentThreat } from './detect/opponent-threat.ts';
import { overloadedDefenders } from './detect/overload.ts';
import { pawnMotifs } from './detect/pawns.ts';
import { skewers } from './detect/skewer.ts';
import { tradedWhileBehind } from './detect/trade.ts';
import { trappedPieces } from './detect/trapped.ts';
import { zugzwang } from './detect/zugzwang.ts';
import {
  backRankWeak,
  captureValue,
  forkBy,
  hangingPieces,
  material,
  pieceRef,
  pinsAgainst,
} from './motifs.ts';
import { expectedPoints, fromMoverView, winPercent } from './scoring.ts';
import { rankSituations } from './situations.ts';
import type {
  BestMoveEffect,
  Color,
  Motif,
  MoveAnalysis,
  MoveFacts,
  Review,
} from './types.ts';

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
export function fenAfterLine(fen: string, uciLine: string[], limit = MAX_LINE): string {
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

  const landedOn = move.uci.slice(2, 4) as Square;
  const phase = phaseOf(move.fenAfter, move.ply);
  const replyLine = move.evalAfter.lines[0]?.pv ?? [];
  const moverView = (whiteView: number): number => (mover === 'w' ? whiteView : -whiteView);

  // A fork the mover just created, from the square the piece landed on.
  const own = forkBy(move.fenAfter, landedOn, true);
  if (own) found.push(own);

  // What the opponent can now do with the piece that just arrived, and with
  // whatever else they have — computed on the position the move created.
  const bestReply = move.evalAfter.lines[0]?.pv[0];
  if (bestReply) {
    const fork = forkBy(
      fenAfterUci(move.fenAfter, bestReply),
      bestReply.slice(2, 4) as Square,
      false,
    );
    if (fork) found.push(fork);
  }

  for (const hanging of hangingPieces(move.fenAfter, mover).slice(0, 2)) found.push(hanging);
  for (const pin of pinsAgainst(move.fenAfter, mover).slice(0, 1)) found.push(pin);

  // True on move 10 of almost every castled game, and useless there: the back
  // rank only becomes a theme once there are lines open to reach it.
  if (phase !== 'opening') {
    const weak = backRankWeak(move.fenAfter, mover);
    if (weak) found.push(weak);
  }

  // Did the move give something away? A sacrifice is the moved piece left
  // where it can be taken for less than it is worth, with the engine's own
  // line confirming the material really goes. Whether it was a good idea is a
  // different fact, and the eval already says which: sound when the win% did
  // not drop by more than two points (design §2). A piece dropped for nothing
  // with no capture and no check behind it, and a worse eval, is not a
  // sacrifice — it is a hung piece, and `hanging_piece` already says so.
  const gave = captureValue(move.fenBefore, move.uci);
  const materialBefore = moverView(material(move.fenBefore));
  const materialAfterPlayedLine = moverView(material(fenAfterLine(move.fenAfter, replyLine)));
  const netMaterial = materialAfterPlayedLine - materialBefore;
  const moved = pieceRef(new Chess(move.fenAfter), landedOn);
  const enPrise = hangingPieces(move.fenAfter, mover).some(
    (m) => m.type === 'hanging_piece' && m.target.square === landedOn,
  );
  if (moved && enPrise && netMaterial <= -1) {
    const sound = move.winAfter >= move.winBefore - 2;
    const hasPoint = gave > 0 || new Chess(move.fenAfter).inCheck();
    if (sound || hasPoint) {
      found.push({ type: 'sacrifice', piece: moved, netMaterial, sound });
    }
  }

  // A capture that was on the board and was not taken.
  const bestMove = move.evalBefore.lines[0]?.pv[0];
  if (bestMove && bestMove !== move.uci) {
    const missed = captureValue(move.fenBefore, bestMove);
    if (missed > 0) {
      const target = pieceRef(new Chess(move.fenBefore), bestMove.slice(2, 4) as Square);
      if (target) found.push({ type: 'missed_capture', target, value: missed });
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

  // "Only move" earns its place only when the alternative was genuinely worse,
  // measured in expected points from the mover's side.
  const first = move.evalBefore.lines[0];
  const second = move.evalBefore.lines[1];
  if ((move.classification === 'best' || move.classification === 'great') && first && second) {
    const moverIsWhite = mover === 'w';
    const epFirst = expectedPoints(winPercent(fromMoverView(first.score, moverIsWhite)));
    const epSecond = expectedPoints(winPercent(fromMoverView(second.score, moverIsWhite)));
    const margin = Math.max(0, epFirst - epSecond);
    if (margin >= 0.15) found.push({ type: 'only_move', margin });
  }

  // The detectors under ./detect, in the order the coach should meet them.
  if (bestReply) {
    const threat = opponentThreat(move.fenAfter, bestReply, toSan(move.fenAfter, replyLine));
    if (threat) found.push(threat);
  }

  const discovered = discoveredAttack(move.fenBefore, move.uci);
  if (discovered) found.push(discovered);

  found.push(...skewers(move.fenAfter, mover).slice(0, 1));
  found.push(...trappedPieces(move.fenAfter, mover).slice(0, 1));

  const traded = tradedWhileBehind(move.fenBefore, move.uci, materialBefore);
  if (traded) found.push(traded);

  found.push(...pawnMotifs(move.fenBefore, move.fenAfter, move.bestLine));

  if (phase !== 'opening') {
    const exposed = kingSafety(move.fenAfter, mover);
    if (exposed) found.push(exposed);
  }

  found.push(...overloadedDefenders(move.fenAfter, mover).slice(0, 1));

  return found;
}

export function fenAfterUci(fen: string, uci: string): string {
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

/**
 * What the best move would have done: a static read of the move itself plus
 * the material the engine's line ends with. This is the fact the coach needs
 * to say *why* the better move was better, not merely that it was.
 */
export function bestMoveEffect(
  move: MoveAnalysis,
  materialAfterBestLine: number,
  materialAfterPlayedLine: number,
): BestMoveEffect {
  const bestUci = move.bestLine[0] ?? move.evalBefore.lines[0]?.pv[0] ?? move.uci;
  const before = new Chess(move.fenBefore);
  const landing = bestUci.slice(2, 4) as Square;

  const captured = pieceRef(before, landing);
  const effect: BestMoveEffect = {
    check: false,
    materialGain: materialAfterBestLine - materialAfterPlayedLine,
    line: toSan(move.fenBefore, move.bestLine),
  };
  if (captured && captured.color !== move.color) effect.captures = captured;

  const after = new Chess(fenAfterUci(move.fenBefore, bestUci));
  effect.check = after.inCheck();

  const fork = forkBy(after.fen(), landing, true);
  if (fork && fork.type === 'fork') effect.forks = fork.targets;

  const mate = move.evalBefore.lines[0]?.score.mate;
  if (mate !== undefined) {
    const forMover = move.color === 'w' ? mate > 0 : mate < 0;
    if (forMover) effect.mateIn = Math.abs(mate);
  }

  return effect;
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
  const materialAfterBestLine = moverIsWhite ? afterBest : -afterBest;
  const materialAfterPlayedLine = moverIsWhite ? afterPlayed : -afterPlayed;

  const motifs = motifsFor(move);
  // Both need the game around the move, not just the move: zugzwang is judged
  // against the mover's standing before the opponent's last move, a fortress
  // against how long the evaluation has held still.
  const stuck = zugzwang(review, ply);
  if (stuck) motifs.push(stuck);
  const held = fortress(review, ply);
  if (held) motifs.push(held);

  const base: Omit<MoveFacts, 'situations'> = {
    ply: move.ply,
    color: move.color,
    san: move.san,
    classification: move.classification,
    epLoss: move.epLoss,
    winBefore: move.winBefore,
    winAfter: move.winAfter,
    moveAccuracy: move.moveAccuracy,
    forced: move.forced,
    bestMove: bestSan,
    bestLine: toSan(move.fenBefore, move.bestLine),
    playedLine: toSan(move.fenAfter, playedLineUci),
    motifs,
    materialAfterBestLine,
    materialAfterPlayedLine,
    bestMoveEffect: bestMoveEffect(move, materialAfterBestLine, materialAfterPlayedLine),
    phase: phaseOf(move.fenBefore, move.ply),
    ...(move.opening ? { opening: move.opening } : {}),
    leftBook: review.opening ? move.ply === review.opening.lastBookPly + 1 : false,
    audience: options.audience ?? audienceFor(options.rating),
  };

  return { ...base, situations: rankSituations(base) };
}
