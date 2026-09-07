import type { PieceRef, SituationKind } from '@greekgift/engine';

import type {
  Arg,
  Frame,
  PersonaGrammar,
  Proposition,
  RenderContext,
  Slot,
} from '../contracts.ts';
import { neutralGrammar } from './neutral.ts';

/**
 * Ben Finegold — The Club Veteran.
 *
 * Built from `neutralGrammar('finegold')` and the ten voice rules in the
 * personas spec: units end with "Okay." and move on, every verdict is an
 * absolute, single words are complete sentences, a rule is stated in
 * maximum-authority form and then exempted for himself within a clause, the
 * reader is "you at home", no insult ever stands without its chess point,
 * hard truths get "the truth hurts", dead air gets "Nothing.", and there is
 * never an exclamation mark.
 */

type Args = Proposition['args'];

const PRAISE_LEADS: ReadonlySet<SituationKind> = new Set<SituationKind>([
  'sound_sacrifice',
  'created_fork',
  'created_discovered',
  'only_move',
  'best',
  'good',
  'book',
  'mate_delivered',
  'passed_pawn',
  'promotion',
]);

// ---------------------------------------------------------------------------
// Argument readers. The planner names its args after the motif fields; these
// accept the obvious spellings and never throw on an absent one.
// ---------------------------------------------------------------------------

const isPiece = (a: Arg | undefined): a is PieceRef =>
  typeof a === 'object' && a !== null && !Array.isArray(a) && 'square' in a && 'piece' in a;

function pieceArg(args: Args, ...keys: string[]): PieceRef | undefined {
  for (const key of keys) {
    const value = args[key];
    if (isPiece(value)) return value;
  }
  return undefined;
}

function piecesArg(args: Args, ...keys: string[]): PieceRef[] {
  for (const key of keys) {
    const value = args[key];
    if (Array.isArray(value) && value.every(isPiece)) return value;
  }
  return [];
}

function strArg(args: Args, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function numArg(args: Args, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function boolArg(args: Args, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const num = (n: number): string => SMALL[n] ?? String(n);

// ---------------------------------------------------------------------------
// Sentence helpers.
// ---------------------------------------------------------------------------

const splitSentences = (text: string): string[] =>
  text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 0);

/** A word that may safely take a capital: plain letters, never a square or SAN. */
const isPlainWord = (word: string): boolean => /^[a-z][a-z']*[,.!?]?$/.test(word);

const capitalise = (sentence: string): string => {
  const [first = '', ...rest] = sentence.split(' ');
  if (!isPlainWord(first)) return sentence;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
};

const sentenceCase = (text: string): string => splitSentences(text).map(capitalise).join(' ');

/** Frame output: every variant sentence-cased and free of "!" and "?". */
const v = (...variants: string[]): string[] => variants.map((s) => deadpan(sentenceCase(s)));

/** No exclamation marks, no questions. Deadpan is the whole instrument. */
const deadpan = (text: string): string => text.replace(/[!?]+/g, '.');

const endsWithOkay = (text: string): boolean => /\bokay\.\s*$/i.test(text);

const withOkay = (text: string): string => {
  // Collapse any run of closers first: the realiser appends the persona's
  // closer before shaping, and a lesson that already ends in one must not
  // come out as "Okay. Okay."
  const trimmed = text.trim().replace(/(?:\s*\bOkay\.)+\s*$/i, '');
  if (trimmed.length === 0) return text.trim();
  const terminal = /[.!?]$/.test(trimmed) ? '' : '.';
  return `${trimmed}${terminal} Okay.`;
};

const squares = (pieces: PieceRef[], ctx: RenderContext): string => {
  const list = pieces.map((p) => ctx.square(p.square));
  if (list.length === 0) return 'two pieces';
  if (list.length === 1) return list[0]!;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

// ---------------------------------------------------------------------------
// Frames.
// ---------------------------------------------------------------------------

const verdict: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san') ?? 'That');
  switch (strArg(p.args, 'classification')) {
    case 'blunder':
      return v(`${m}. Terrible.`, `Terrible. ${m}.`, `${m} is a blunder. Okay.`);
    case 'mistake':
      return v(`${m}. Incorrect.`, `Incorrect. ${m}.`, `${m} is not the move.`);
    case 'inaccuracy':
      return v(`${m}. Suspicious.`, `Suspicious. ${m}.`, `${m}. Played funny.`);
    case 'miss':
      return v(`${m}. You had better.`, `${m}. The truth hurts.`, `There was more than ${m}.`);
    case 'brilliant':
    case 'great':
      return v(
        `${m}. I'm as surprised as you are.`,
        `${m}. Correct. Don't get used to it.`,
        `${m}. Even this class finds one.`,
      );
    case 'book':
      return v(`${m}. Still theory.`, `Still theory. ${m}.`, `${m}. The book knows this one.`);
    default:
      return v(`${m}. Correct.`, `${m}. Fine.`, `Correct. ${m}.`);
  }
};

const hangs: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece');
  const attacker = piecesArg(p.args, 'attackers')[0] ?? pieceArg(p.args, 'attacker', 'by');
  const t = target ? ctx.refer(target) : 'that piece';
  return v(
    `${t} is hanging. Nothing defends it.`,
    attacker
      ? `${t} is attacked by ${ctx.refer(attacker)}. Nobody is defending it. Terrible.`
      : `${t} is attacked. Nobody is defending it. Terrible.`,
    `You at home left ${t} hanging. The truth hurts.`,
  );
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p.args, 'by', 'attacker');
  const b = by ? ctx.refer(by) : 'their piece';
  const name = by ? ctx.lexicon.pieceNames[by.piece] : 'piece';
  const targets = piecesArg(p.args, 'targets');
  const s = squares(targets, ctx);
  return v(
    `${b} attacks ${s}. One of them is leaving.`,
    `${num(Math.max(targets.length, 2))} targets, one ${name}, one square. ${s} are both attacked.`,
    `${b} hits ${s}. You at home can save one. Okay.`,
  );
};

const missedCapture: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece');
  const t = target ? ctx.refer(target) : 'a piece';
  return v(
    `${t} was free. You didn't take it. The truth hurts.`,
    `You could take ${t}. You didn't. Okay.`,
    `${t} was hanging. Even this class takes free pieces. Okay.`,
  );
};

const backRank: Frame = () =>
  v(
    `The back rank is weak. No escape square for the king. Okay.`,
    `No escape square for the king. Back rank problems. The truth hurts.`,
    `The king is stuck on the back rank. That's terrible. Okay.`,
  );

const quietLoss: Frame = () =>
  v(
    `Nothing hangs. The position is just worse now. Okay.`,
    `Played passively. No tactic, just a worse position. Okay.`,
    `That's played funny. Nothing dropped, but the position is worse. The truth hurts.`,
  );

const swing: Frame = (p) => {
  const before = numArg(p.args, 'winBefore', 'before');
  const after = numArg(p.args, 'winAfter', 'after');
  if (before === undefined || after === undefined) {
    return v(
      `The evaluation moved. A lot. Okay.`,
      `Big swing. The truth hurts.`,
      `The position changed. Not in your favour. Okay.`,
    );
  }
  const b = Math.round(before);
  const a = Math.round(after);
  if (a >= b) {
    return v(
      `${b} to ${a}. Correct. Don't get used to it.`,
      `From ${b} to ${a}. I'm as surprised as you are.`,
      `${b} before, ${a} after. Even this class does it sometimes.`,
    );
  }
  return v(
    `${b} to ${a}. That's the whole game. Okay.`,
    `From ${b} to ${a}. The truth hurts.`,
    `${b} before. ${a} after. Nothing else to say.`,
  );
};

const bestMove: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san', 'best') ?? 'The other move');
  return v(
    `${m}. That's the move. Okay.`,
    `${m} was correct. You at home played something else. Okay.`,
    `${m}. Nothing else. Okay.`,
  );
};

const bestDoes: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san', 'best') ?? 'The other move');
  const captures = pieceArg(p.args, 'captures', 'capture');
  const mateIn = numArg(p.args, 'mateIn');
  const forkTargets = piecesArg(p.args, 'forks', 'targets');
  const check = boolArg(p.args, 'check') ?? false;
  const gain = numArg(p.args, 'materialGain') ?? 0;
  let does: string;
  if (mateIn !== undefined) does = `is mate in ${num(mateIn)}`;
  else if (captures) does = `${ctx.lexicon.captureVerb} ${ctx.refer(captures)}`;
  else if (forkTargets.length > 0) does = `hits ${squares(forkTargets, ctx)}`;
  else if (check) does = `comes with check`;
  else if (gain > 0) does = `wins material`;
  else does = `keeps everything defended`;
  return v(
    `${m} ${does}. That's the move. Okay.`,
    `${m} ${does}. Even this class can see that. Okay.`,
    `${m} ${does}. You at home did not play it. The truth hurts.`,
  );
};

const LESSONS: Record<string, [string, string, string]> = {
  check_landing_square: [
    `Never leave a hole in your own position. I do, but I'm allowed. Okay.`,
    `Check where the piece lands before it lands there. Rules are for you at home, not me. Okay.`,
    `Every square you leave is a square they get. I leave squares all the time. Different rules. Okay.`,
  ],
  count_attackers: [
    `Count the attackers. Count the defenders. Never skip that. I skip it, but I'm allowed. Okay.`,
    `More attackers than defenders means the piece is lost. This is arithmetic. Even this class can do arithmetic. Okay.`,
    `Always count before you leave a piece somewhere. I don't count. I'm old. Okay.`,
  ],
  look_for_captures: [
    `Look at every capture, every move. I don't, but the rules are for you at home. Okay.`,
    `Free pieces get taken. That's the whole rule. Even this class knows that, I hope. Okay.`,
    `Captures first. Always. Unless I'm playing, then whatever I want. Okay.`,
  ],
  checks_first: [
    `Checks, captures, threats. In that order. Every move. I skip the order. You don't. Okay.`,
    `Look at every check before anything else. Not most checks. Every check. Okay.`,
    `Checks first. It has been the rule for two hundred years. Nobody at home follows it. Okay.`,
  ],
  defend_back_rank: [
    `Give the king an escape square. Always. I forget, but I'm allowed to forget. Okay.`,
    `A king with no luft is a king waiting to be mated. Make the luft. Okay.`,
    `Back rank first, ambitions second. I have no ambitions, so this is easy for me. Okay.`,
  ],
  see_their_threat: [
    `Ask what their move threatens before you play yours. Every time. I don't ask. Different rules. Okay.`,
    `Their last move had an idea. Find it. Then play. You at home did it backwards. Okay.`,
    `Look at their threat first. This is not advanced. It is the opposite of advanced. Okay.`,
  ],
  dont_trade_behind: [
    `Never trade pieces when you're behind. I do it constantly. I'm allowed. Okay.`,
    `Down material, keep the pieces on. Fewer pieces helps whoever is ahead. That's not you. Okay.`,
    `Trading while behind is giving up slowly. Keep the pieces. I'd resign, but I'm allowed. Okay.`,
  ],
  push_the_passer: [
    `Passed pawns must be pushed. Must. I let mine sit, but that's me. Okay.`,
    `A passed pawn is a future queen. Push it. Nothing else matters as much. Okay.`,
    `Push the passer. It's been the rule since before I was born, and I'm old. Okay.`,
  ],
  keep_the_shield: [
    `Never move the pawns in front of your king. I move them. You can't. Okay.`,
    `The king's pawns stay home. All of them. I break this rule, but I'm allowed. Okay.`,
    `Move a pawn near the king and the king gets mated. That's the rule for you at home. Okay.`,
  ],
  one_defender_two_jobs: [
    `One piece cannot do two jobs. Never. Except mine, apparently. Okay.`,
    `An overloaded defender is a target. Find it, pull it away. Even this class can do that. Okay.`,
    `If one piece defends two things, it defends nothing. The truth hurts. Okay.`,
  ],
  keep_the_tension: [
    `Don't release the tension unless it helps you. It never helps you at home. Okay.`,
    `Keep the tension. Let them make the mistake. I make it first, but I'm allowed. Okay.`,
    `Releasing tension is a favour to your opponent. Stop doing favours. Okay.`,
  ],
  book_ends_here: [
    `The book ends here. Now you at home have to think. I never do. Boo. Okay.`,
    `Still theory until this move. After it, nothing. Think. Okay.`,
    `Out of book. This is where it usually goes wrong. The truth hurts. Okay.`,
  ],
  remember_this: [
    `Remember this pattern. It comes back every game. I forget it, but I'm old. Okay.`,
    `Write this down. Nobody at home will write this down. Okay.`,
    `This pattern repeats. Learn it once. That's one more than most of you. Okay.`,
  ],
};

const LESSON_FALLBACK: [string, string, string] = [
  `Learn from it. I never do, but I'm allowed. Okay.`,
  `Nothing more to say. Learn it. I forgot it years ago. Okay.`,
  `The lesson is the same as always. Think. Rules are for you at home, not me. Okay.`,
];

const lesson: Frame = (p) => {
  const concept = strArg(p.args, 'concept', 'id') ?? '';
  return v(...(LESSONS[concept] ?? LESSON_FALLBACK)).map(withOkay);
};

// ---------------------------------------------------------------------------
// Prosody.
// ---------------------------------------------------------------------------

/** One absolute, then on with the lesson. Praise gets nothing; he was expecting nothing. */
function reaction(epLoss: number, lead: SituationKind): string {
  if (PRAISE_LEADS.has(lead)) return '';
  if (epLoss >= 0.2) return 'Terrible.';
  if (epLoss >= 0.1) return 'Incorrect.';
  if (epLoss >= 0.045) return 'Suspicious.';
  return '';
}

const closer = (): string => 'Okay.';

// ---------------------------------------------------------------------------
// Shape: strip "!" and "?", end whatHappened and lesson with "Okay.".
// ---------------------------------------------------------------------------

function shape(slots: Record<Slot, string>): Record<Slot, string> {
  const out = { ...slots };
  for (const slot of Object.keys(out) as Slot[]) {
    out[slot] = deadpan(out[slot]);
  }
  if (out.whatHappened) out.whatHappened = withOkay(out.whatHappened);
  if (out.lesson) out.lesson = withOkay(out.lesson);
  return out;
}

// ---------------------------------------------------------------------------
// The grammar.
// ---------------------------------------------------------------------------

const base = neutralGrammar('finegold');

export const finegold: PersonaGrammar = {
  ...base,
  lexicon: {
    ...base.lexicon,
    captureVerb: 'takes',
    address: 'you at home',
    intensifiers: [],
    praise: ["I'm as surprised as you are", 'correct', 'fine'],
    blame: ['terrible', 'incorrect', 'suspicious', 'silly'],
    fillers: [],
    connectives: ['and', 'so', 'but'],
  },
  syntax: {
    ...base.syntax,
    maxSentenceWords: 14,
    fragments: true,
    chainWithAnd: false,
    questionRate: 0,
    // The reaction already opens with an absolute; a verdict word on top of
    // it reads as "Terrible. Blunder."
    verdictFirst: false,
    preferHere: false,
    imperativeAdvice: true,
  },
  prosody: {
    ...base.prosody,
    exclamations: 0,
    capsPeak: false,
    reaction,
    closer,
    sentenceCase: true,
  },
  events: {
    reviewStart: [
      base.events.reviewStart?.[0] ?? 'Okay. Let’s see what you did. This should be quick.',
      'Okay. Another game. I have seen thousands. This is another one.',
      'Okay. Let’s go through it. I’m not expecting much.',
    ],
    brilliant: [
      base.events.brilliant?.[0] ?? 'That’s a good move. I’m as surprised as you are. Okay.',
      'Good move. Even this class finds one sometimes. Okay.',
      'That’s correct. I was expecting nothing. Okay.',
    ],
    great: [
      base.events.great?.[0] ?? 'Correct. Don’t get used to it.',
      'Correct. Somebody at home paid attention. Okay.',
      'That’s the move. I was expecting nothing. Okay.',
    ],
    blunder: [
      base.events.blunder?.[0] ?? 'Terrible. Okay, here’s why.',
      'Terrible. The truth hurts. Okay, here’s the lesson.',
      'That’s a blunder. I’ve played worse, but I’m old. Okay.',
    ],
    mistake: [
      base.events.mistake?.[0] ?? 'That’s not the move. It’s not the worst move. It’s not good either.',
      'Incorrect. Not terrible. Incorrect. Okay.',
      'Suspicious. You at home played funny here. Okay.',
    ],
    miss: [
      base.events.miss?.[0] ?? 'You had a win. You didn’t play it. The truth hurts.',
      'There was something better. You at home missed it. Okay.',
      'You had it. You didn’t find it. Nothing. Okay.',
    ],
    bookExit: [
      base.events.bookExit?.[0] ?? 'Now you’re on your own. This is where it usually goes wrong.',
      'Still theory until here. Now it’s you. Boo.',
      'Okay. The book is closed. Nothing good happens after this.',
    ],
    comeback: [
      base.events.comeback?.[0] ?? 'You were losing. Now you’re not. Your opponent is also terrible.',
      'You came back. I’m as surprised as you are. Okay.',
      'You were losing. Now you aren’t. Somebody else played worse. Okay.',
    ],
    collapse: [
      base.events.collapse?.[0] ?? 'You were winning. And then you weren’t. This happens to all of you.',
      'It was winning. Then it wasn’t. The truth hurts.',
      'You were winning. I’ve done this too, many times. Okay.',
    ],
    highAccuracy: [
      base.events.highAccuracy?.[0] ?? 'That’s a good game. I’ve seen worse. I’ve seen mine.',
      'Good game. Don’t get used to it. Okay.',
      'That’s accurate. Even this class does it sometimes. Okay.',
    ],
    lowAccuracy: [
      base.events.lowAccuracy?.[0] ??
        'Terrible. But you’re here looking at it, which is more than most people do.',
      'Terrible. I’ve had worse games. I don’t remember them, I’m old. Okay.',
      'Not good. The truth hurts. Okay.',
    ],
    longGame: [
      base.events.longGame?.[0] ?? 'Still going. I get paid by the hour, so this is fine.',
      'Long game. Long games are fine. I’m old, I have time. Okay.',
      'Still going. Nobody resigns anymore. Okay.',
    ],
    reviewEnd: [
      base.events.reviewEnd?.[0] ?? 'Okay. Class dismissed.',
      'That’s the game. Class dismissed. Okay.',
      'We’re done. Nothing more to say. Class dismissed.',
    ],
    random: [
      base.events.random?.[0] ?? 'Nothing.',
      'Okay. Nothing.',
      'Nothing. Class dismissed.',
    ],
  },
  frames: {
    verdict,
    hangs,
    forked,
    missed_capture: missedCapture,
    back_rank: backRank,
    quiet_loss: quietLoss,
    swing,
    best_move: bestMove,
    best_does: bestDoes,
    lesson,
  },
  shape,
};
