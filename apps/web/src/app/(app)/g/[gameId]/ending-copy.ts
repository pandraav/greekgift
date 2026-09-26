import type { Color, GameEnding, TerminationKind, Verdict } from '@greekgift/engine';

/**
 * How the game ended, in words (design §14.6). Pure, so the game-over card,
 * the notation's last row and the report headline all say the same thing.
 *
 * `userSide` decides the voice: "you" / "your opponent" for a member's own
 * game, White / Black when they played neither side.
 */

type Side = Color | null;

const NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const KIND_SAY: Record<TerminationKind, string> = {
  checkmate: 'by checkmate',
  resignation: 'by resignation',
  timeout: 'on time',
  timeout_vs_insufficient: 'on time against insufficient material',
  abandoned: 'by abandonment',
  agreement: 'by agreement',
  repetition: 'by repetition',
  stalemate: 'by stalemate',
  insufficient: 'by insufficient material',
  fifty_move: 'by the 50-move rule',
  unknown: '',
};

/** The loser, when there was one. */
export const loserOf = (e: GameEnding): Color | null => (e.winner ? other(e.winner) : null);

/** The move number the game ended on: the mating move for a board ending, the move the loser was on otherwise. */
export function endMove(e: GameEnding): number {
  return e.onBoard || e.kind === 'checkmate' ? Math.max(1, Math.ceil(e.atPly / 2)) : Math.floor(e.atPly / 2) + 1;
}

/** "1–0", "0–1", "½–½"; an unknown ending with no winner has no result. */
export function resultText(e: GameEnding): string {
  if (e.winner === 'w') return '1–0';
  if (e.winner === 'b') return '0–1';
  return e.kind === 'unknown' ? '—' : '½–½';
}

/** The notation's last row: "White lost on time", "drawn by agreement". Always White/Black. */
export function endingShort(e: GameEnding): string {
  if (!e.winner) return e.kind === 'unknown' ? 'game over' : `drawn ${KIND_SAY[e.kind]}`;
  const loser = NAME[other(e.winner)];
  switch (e.kind) {
    case 'timeout':
      return `${loser} lost on time`;
    case 'resignation':
      return `${loser} resigned`;
    case 'checkmate':
      return `${NAME[e.winner]} mated`;
    case 'abandoned':
      return `${loser} abandoned`;
    case 'unknown':
      return `${NAME[e.winner]} won`;
    default:
      return `${NAME[e.winner]} won ${KIND_SAY[e.kind]}`;
  }
}

/** Who: "you", "your opponent", or the colour. `capital` for the start of a sentence. */
function who(c: Color, userSide: Side, capital = false): string {
  const word = userSide === null ? NAME[c] : c === userSide ? 'you' : 'your opponent';
  return capital ? word[0]!.toUpperCase() + word.slice(1) : word;
}

/** The final position in words, from the member's side; neutral names the side it favours. */
export function verdictWords(e: GameEnding, userSide: Side): string {
  if (userSide !== null) {
    const v = e.verdictAtEnd[userSide];
    return { winning: 'winning', better: 'better for you', equal: 'equal', worse: 'worse for you', losing: 'lost' }[v];
  }
  const v: Verdict = e.verdictAtEnd.w;
  return {
    winning: 'winning for White',
    better: 'better for White',
    equal: 'equal',
    worse: 'better for Black',
    losing: 'winning for Black',
  }[v];
}

/** The card's title: "You lost on time at move 30." */
export function endingTitle(e: GameEnding, userSide: Side): string {
  const loser = loserOf(e);
  const n = endMove(e);
  switch (e.kind) {
    case 'timeout':
      if (!loser) return `Drawn on time at move ${n}.`;
      return loser === userSide
        ? `You lost on time at move ${n}.`
        : userSide === null
          ? `${NAME[loser]} lost on time at move ${n}.`
          : `Your opponent ran out of time at move ${n}.`;
    case 'timeout_vs_insufficient':
      return `Drawn on time at move ${n}: no mate was left.`;
    case 'resignation':
      return loser ? `${who(loser, userSide, true)} resigned.` : 'Game over.';
    case 'abandoned':
      return loser ? `${who(loser, userSide, true)} abandoned the game.` : 'The game was abandoned.';
    case 'checkmate':
      return 'Checkmate.';
    case 'stalemate':
      return 'Stalemate.';
    case 'unknown':
      return 'Game over.';
    default:
      return `Drawn ${KIND_SAY[e.kind]}.`;
  }
}

/**
 * The verdict sentence for an ending off the board: "The position was equal
 * when your clock ran out (+0.02)." Null for a board ending, where the board
 * already says it.
 */
export function endingSay(e: GameEnding, userSide: Side, evalText: string): string | null {
  if (e.onBoard || e.kind === 'checkmate' || e.kind === 'stalemate') return null;
  const loser = loserOf(e);
  let when: string;
  if (e.kind === 'timeout' || e.kind === 'timeout_vs_insufficient') {
    when = loser
      ? loser === userSide
        ? 'your clock ran out'
        : userSide === null
          ? `${NAME[loser]}'s clock ran out`
          : 'their clock ran out'
      : 'the clock ran out';
  } else if (e.kind === 'resignation' && loser) {
    when = loser === userSide ? 'you resigned' : userSide === null ? `${NAME[loser]} resigned` : 'they resigned';
  } else if (e.kind === 'abandoned') {
    when = 'the game was abandoned';
  } else if (e.kind === 'agreement') {
    when = 'the draw was agreed';
  } else {
    when = 'the game stopped';
  }
  return `The position was ${verdictWords(e, userSide)} when ${when} (${evalText}).`;
}

/**
 * The better move the loser still had, as a sentence: "30. Ng5 would have
 * held it." Only for the member's own loss or a neutral reader, and only
 * when the position was not already lost for them.
 */
export function holdSentence(e: GameEnding, userSide: Side, move: string | null): string | null {
  const loser = loserOf(e);
  if (!move || !loser || (userSide !== null && loser !== userSide)) return null;
  const v = e.verdictAtEnd[loser];
  if (v === 'losing') return null;
  if (v === 'winning' || v === 'better') return `${move} would have kept the advantage.`;
  if (v === 'equal') return `${move} would have held it.`;
  return `${move} was the best try.`;
}

/** The report's headline: "You lost on time at move 30 in an equal position." */
export function endingHeadline(e: GameEnding, userSide: Side): string {
  const loser = loserOf(e);
  const n = endMove(e);
  const v = userSide !== null ? e.verdictAtEnd[userSide] : null;
  const pos =
    v === null
      ? `with the position ${verdictWords(e, null)}`
      : { winning: 'from a winning position', better: 'while better', equal: 'in an equal position', worse: 'while worse', losing: 'in a lost position' }[v];

  if (e.kind === 'timeout' && loser) {
    if (loser === userSide) return `You lost on time at move ${n} ${pos}.`;
    if (userSide === null) return `${NAME[loser]} lost on time at move ${n}, ${pos}.`;
    return `Your opponent ran out of time at move ${n}; the position was ${verdictWords(e, userSide)}.`;
  }
  if (e.kind === 'resignation' && loser) {
    if (loser === userSide) return `You resigned at move ${n} ${pos}.`;
    if (userSide === null) return `${NAME[loser]} resigned at move ${n}, ${pos}.`;
    return `Your opponent resigned when the position was ${verdictWords(e, userSide)}.`;
  }
  if (e.kind === 'checkmate' && e.winner) {
    if (userSide === null) return `${NAME[e.winner]} won by checkmate on move ${n}.`;
    return e.winner === userSide ? `You won by checkmate on move ${n}.` : `You were checkmated on move ${n}.`;
  }
  if (e.kind === 'abandoned' && loser) {
    return `${who(loser, userSide, true)} abandoned the game at move ${n}.`;
  }
  if (e.kind === 'unknown') return `The game ended on move ${n}.`;
  return `The game was ${endingShort(e)} on move ${n}.`;
}

/** The card's accent from the member's side: a loss, a win, or neither. */
export function endingTone(e: GameEnding, userSide: Side): 'loss' | 'win' | 'neutral' {
  if (!e.winner || userSide === null) return 'neutral';
  return e.winner === userSide ? 'win' : 'loss';
}
