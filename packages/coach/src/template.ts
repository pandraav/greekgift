import type { CoachText, Motif, MoveFacts } from '@greekgift/engine';

/**
 * The coach with no model behind it.
 *
 * Every generated line can fail — the key is missing, the provider is down, the
 * output names a square that is not on the board. When it does, this runs, and
 * it is built only from the facts, so it is always true. It is plainer than the
 * personas and it never pretends otherwise; `source` says `template` and the
 * card says so too.
 *
 * This existing is what lets the validator be strict. Rejecting a line costs a
 * little colour, not the explanation.
 */

const CLASS_PHRASE: Record<string, string> = {
  brilliant: 'a brilliant move',
  great: 'a strong move',
  best: 'the best move',
  excellent: 'an excellent move',
  good: 'a good move',
  book: 'still theory',
  inaccuracy: 'an inaccuracy',
  miss: 'a missed chance',
  mistake: 'a mistake',
  blunder: 'a blunder',
};

const moveNumber = (ply: number) => Math.floor((ply - 1) / 2) + 1;
const label = (facts: MoveFacts) =>
  `${moveNumber(facts.ply)}${facts.ply % 2 === 1 ? '.' : '…'} ${facts.san}`;

/** One sentence naming what the position actually contains. */
function describe(motif: Motif): string | null {
  switch (motif.type) {
    case 'fork':
      return `The piece on ${motif.by} attacks ${motif.targets.join(' and ')} at the same time, so only one of them can be saved.`;
    case 'hanging_piece':
      return motif.defenders.length === 0
        ? `The ${motif.piece} on ${motif.square} is attacked and nothing defends it.`
        : `The ${motif.piece} on ${motif.square} has more attackers than defenders.`;
    case 'pin':
      return motif.absolute
        ? `The piece on ${motif.pinned} cannot move: it is pinned to the king on ${motif.against}.`
        : `The piece on ${motif.pinned} is pinned against ${motif.against}.`;
    case 'missed_capture':
      return `The ${motif.piece} on ${motif.square} was there to be taken.`;
    case 'missed_mate':
      return `There was mate: ${motif.line.join(' ')}.`;
    case 'mate_threat':
      return `Mate is now on the board: ${motif.line.join(' ')}.`;
    case 'back_rank_weak':
      return 'The king has no escape square on the back rank.';
    case 'sacrifice':
      return `This gives up the ${motif.piece} on ${motif.square}.`;
    case 'trapped_piece':
      return `The ${motif.piece} on ${motif.square} has nowhere to go.`;
    case 'only_move':
      return 'It was the only move that held.';
    case 'discovered_attack':
      return `Moving from ${motif.mover} opened a line from ${motif.attacker} onto ${motif.target}.`;
    default:
      return null;
  }
}

const swing = (facts: MoveFacts) =>
  Math.max(0, facts.winBefore - facts.winAfter);

export function templateText(facts: MoveFacts): CoachText {
  const reasons = facts.motifs.map(describe).filter((s): s is string => s !== null);
  const lost = swing(facts);
  const good = ['brilliant', 'great', 'best', 'excellent', 'good', 'book'].includes(
    facts.classification,
  );

  const headline = good
    ? `${label(facts)} — ${CLASS_PHRASE[facts.classification] ?? 'played'}`
    : `${label(facts)} — ${CLASS_PHRASE[facts.classification] ?? 'an error'}`;

  const whatHappened = good
    ? `${facts.san} is ${CLASS_PHRASE[facts.classification] ?? 'sound'}.` +
      (reasons[0] ? ` ${reasons[0]}` : '')
    : reasons.length > 0
      ? reasons.slice(0, 2).join(' ')
      : `${facts.san} lets the position slip without an immediate tactic to point to.`;

  const whyItMatters = good
    ? `Your winning chances held at about ${Math.round(facts.winAfter)}%.`
    : `Your winning chances went from about ${Math.round(facts.winBefore)}% to about ${Math.round(facts.winAfter)}%, a swing of ${lost.toFixed(0)} points.`;

  const betterWas = good
    ? `The engine agrees, and follows up with ${facts.bestMove}.`
    : facts.bestLine.length > 1
      ? `${facts.bestMove} was the move, and the line runs ${facts.bestLine.join(' ')}.`
      : `${facts.bestMove} was the move.`;

  const lesson = lessonFor(facts, good);

  return {
    ply: facts.ply,
    headline: headline.slice(0, 60),
    whatHappened,
    whyItMatters,
    betterWas,
    lesson,
    source: 'template',
  };
}

function lessonFor(facts: MoveFacts, good: boolean): string {
  if (good) {
    return facts.phase === 'opening'
      ? 'Keep developing and the position keeps making sense.'
      : 'Worth remembering how this position was handled.';
  }

  const first = facts.motifs[0]?.type;
  switch (first) {
    case 'fork':
      return 'Before placing a piece, ask what an enemy knight would attack from the squares nearby.';
    case 'hanging_piece':
      return 'After every move, check what is now undefended — yours and theirs.';
    case 'pin':
      return 'A piece in front of something more valuable is not really free to move.';
    case 'missed_capture':
      return 'Look at every capture on the board before choosing a quiet move.';
    case 'missed_mate':
      return 'When the king is short of squares, count the checks before anything else.';
    case 'back_rank_weak':
      return 'Give the king a square before the back rank becomes the problem.';
    default:
      return facts.phase === 'endgame'
        ? 'In the endgame the pawns decide it; count them before you calculate.'
        : 'Check what your opponent threatens before improving your own position.';
  }
}
