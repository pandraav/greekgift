import type { GameEnding } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import {
  endingHeadline,
  endingSay,
  endingShort,
  endingTitle,
  endingTone,
  endMove,
  holdSentence,
  resultText,
  verdictWords,
} from './ending-copy';

/** Reference game 184269442794: White (the member) flagged after 29…Ne5 at +0.02. */
const FLAG: GameEnding = {
  kind: 'timeout',
  winner: 'b',
  onBoard: false,
  atPly: 58,
  evalAtEnd: { cp: 2 },
  verdictAtEnd: { w: 'equal', b: 'equal' },
  clocks: { w: 0, b: 214_700 },
  finalThink: 48_100,
};

const end = (over: Partial<GameEnding>): GameEnding => ({ ...FLAG, ...over });

describe('the reference timeout', () => {
  it('names the move the loser was on, and the result', () => {
    expect(endMove(FLAG)).toBe(30);
    expect(resultText(FLAG)).toBe('0–1');
    expect(endingShort(FLAG)).toBe('White lost on time');
  });

  it('speaks to the member who flagged', () => {
    expect(endingTitle(FLAG, 'w')).toBe('You lost on time at move 30.');
    expect(endingSay(FLAG, 'w', '+0.02')).toBe('The position was equal when your clock ran out (+0.02).');
    expect(holdSentence(FLAG, 'w', '30. Ng5')).toBe('30. Ng5 would have held it.');
    expect(endingHeadline(FLAG, 'w')).toBe('You lost on time at move 30 in an equal position.');
    expect(endingTone(FLAG, 'w')).toBe('loss');
  });

  it('speaks to the opponent, who does not get the loser\'s better move', () => {
    expect(endingTitle(FLAG, 'b')).toBe('Your opponent ran out of time at move 30.');
    expect(endingSay(FLAG, 'b', '+0.02')).toBe('The position was equal when their clock ran out (+0.02).');
    expect(holdSentence(FLAG, 'b', '30. Ng5')).toBeNull();
    expect(endingTone(FLAG, 'b')).toBe('win');
  });

  it('is neutral with no member side', () => {
    expect(endingTitle(FLAG, null)).toBe('White lost on time at move 30.');
    expect(endingSay(FLAG, null, '+0.02')).toBe("The position was equal when White's clock ran out (+0.02).");
    expect(endingHeadline(FLAG, null)).toBe('White lost on time at move 30, with the position equal.');
    expect(endingTone(FLAG, null)).toBe('neutral');
    for (const s of [endingTitle(FLAG, null), endingSay(FLAG, null, '+0.02'), endingHeadline(FLAG, null)]) {
      expect(s).not.toMatch(/\byou/i);
    }
  });
});

describe('verdict words', () => {
  it('reads the member\'s own verdict', () => {
    const e = end({ verdictAtEnd: { w: 'winning', b: 'losing' } });
    expect(verdictWords(e, 'w')).toBe('winning');
    expect(verdictWords(e, 'b')).toBe('lost');
    expect(verdictWords(e, null)).toBe('winning for White');
    expect(endingHeadline(e, 'w')).toBe('You lost on time at move 30 from a winning position.');
    expect(holdSentence(e, 'w', '30. Ng5')).toBe('30. Ng5 would have kept the advantage.');
  });

  it('never offers a better move in a lost position', () => {
    const e = end({ verdictAtEnd: { w: 'losing', b: 'winning' } });
    expect(holdSentence(e, 'w', '30. Ng5')).toBeNull();
  });
});

describe('other endings', () => {
  it('resignation', () => {
    const e = end({ kind: 'resignation', clocks: undefined, finalThink: undefined });
    expect(endingTitle(e, 'b')).toBe('Your opponent resigned.');
    expect(endingTitle(e, 'w')).toBe('You resigned.');
    expect(endingSay(e, 'b', '+0.02')).toBe('The position was equal when they resigned (+0.02).');
    expect(endingHeadline(e, 'b')).toBe('Your opponent resigned when the position was equal.');
    expect(endingShort(e)).toBe('White resigned');
  });

  it('checkmate: the board says it, and the move is the mating one', () => {
    const e = end({ kind: 'checkmate', winner: 'w', onBoard: true, atPly: 57 });
    expect(endMove(e)).toBe(29);
    expect(endingTitle(e, 'w')).toBe('Checkmate.');
    expect(endingSay(e, 'w', 'M1')).toBeNull();
    expect(endingHeadline(e, 'w')).toBe('You won by checkmate on move 29.');
    expect(endingHeadline(e, 'b')).toBe('You were checkmated on move 29.');
    expect(resultText(e)).toBe('1–0');
    expect(endingShort(e)).toBe('White mated');
  });

  it('draws', () => {
    const agreed = end({ kind: 'agreement', winner: null });
    expect(resultText(agreed)).toBe('½–½');
    expect(endingShort(agreed)).toBe('drawn by agreement');
    expect(endingTitle(agreed, 'w')).toBe('Drawn by agreement.');
    expect(endingSay(agreed, 'w', '0.00')).toBe('The position was equal when the draw was agreed (0.00).');
    expect(endingTone(agreed, 'w')).toBe('neutral');

    const rep = end({ kind: 'repetition', winner: null, onBoard: true });
    expect(endingTitle(rep, null)).toBe('Drawn by repetition.');
    expect(endingSay(rep, null, '0.00')).toBeNull();

    const tvi = end({ kind: 'timeout_vs_insufficient', winner: null });
    expect(endingTitle(tvi, 'w')).toBe('Drawn on time at move 30: no mate was left.');
  });

  it('abandoned and unknown', () => {
    expect(endingTitle(end({ kind: 'abandoned' }), 'b')).toBe('Your opponent abandoned the game.');
    const unknown = end({ kind: 'unknown', winner: null });
    expect(resultText(unknown)).toBe('—');
    expect(endingTitle(unknown, 'w')).toBe('Game over.');
  });
});
