import type { PieceRef, SituationKind } from '@greekgift/engine';

import type {
  Frame,
  PersonaGrammar,
  Proposition,
  RenderContext,
  Slot,
} from '../contracts.ts';
import type { Trigger } from '../personas.ts';
import { neutralGrammar } from './neutral.ts';

/**
 * Sagar Shah — The Mentor, and the default voice.
 *
 * Built from the ten voice rules in the personas spec: orient before judging,
 * address the reader as "friends" or "you", ask a real question and answer it,
 * one technical term unpacked at once, at most two earned exclamation marks,
 * and end on something the reader can carry into the next game.
 *
 * Every chess token goes through `ctx.refer`, `ctx.square` or `ctx.move` so the
 * realiser owns referring expressions and the validator can trust the output.
 *
 * The planner's argument names are not part of the frozen contract, so each
 * accessor below tries the natural names first and then the first argument of
 * the right shape.
 */

type Args = Proposition['args'];

const isPiece = (v: unknown): v is PieceRef =>
  typeof v === 'object' && v !== null && 'piece' in v && 'square' in v;
const isPieceList = (v: unknown): v is PieceRef[] =>
  Array.isArray(v) && v.length > 0 && v.every(isPiece);
const isLine = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function pieceArg(args: Args, ...keys: string[]): PieceRef | undefined {
  for (const key of keys) {
    const v = args[key];
    if (isPiece(v)) return v;
    if (isPieceList(v)) return v[0];
  }
  for (const v of Object.values(args)) if (isPiece(v)) return v;
  return undefined;
}

function piecesArg(args: Args, ...keys: string[]): PieceRef[] {
  for (const key of keys) {
    const v = args[key];
    if (isPieceList(v)) return v;
    if (isPiece(v)) return [v];
  }
  for (const v of Object.values(args)) if (isPieceList(v)) return v;
  return [];
}

function strArg(args: Args, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function numArg(args: Args, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function boolArg(args: Args, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'boolean') return v;
  }
  return false;
}

function lineArg(args: Args, ...keys: string[]): string[] {
  for (const key of keys) {
    const v = args[key];
    if (isLine(v) && v.length > 0) return v;
  }
  return [];
}

/** "d7 and b7", "d7, b7 and f8". */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const squaresOf = (pieces: PieceRef[], ctx: RenderContext) =>
  joinList(pieces.map((p) => ctx.square(p.square)));
const piecesOf = (pieces: PieceRef[], ctx: RenderContext) =>
  joinList(pieces.map((p) => ctx.refer(p)));

const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Win percentages in words: Sagar never quotes a number at the reader. */
function describeWin(n: number): string {
  if (n >= 90) return 'almost completely winning';
  if (n >= 75) return 'clearly winning';
  if (n >= 60) return 'comfortably better';
  if (n >= 52) return 'a shade above even';
  if (n >= 48) return 'about even';
  if (n >= 40) return 'a shade below even';
  if (n >= 30) return 'clearly worse';
  if (n >= 20) return 'under a third';
  if (n >= 10) return 'under a fifth';
  return 'almost lost';
}

/** Material in words, never numbers. */
function describeMaterial(units: number): string {
  const n = Math.abs(Math.round(units));
  if (n === 0) return 'nothing in material';
  if (n === 1) return 'a pawn';
  if (n === 2) return 'two pawns';
  if (n <= 4) return 'a whole piece';
  if (n <= 6) return "a rook's worth";
  if (n <= 8) return 'two pieces';
  return "a queen's worth";
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const inWords = (n: number) => (n >= 0 && n < 10 ? SMALL[n]! : String(n));

// ---------------------------------------------------------------------------
// Situation groups

const LOSS_LEADS = new Set<SituationKind>([
  'allowed_mate', 'missed_mate', 'hung_piece', 'under_defended', 'walked_into_fork',
  'walked_into_pin', 'walked_into_skewer', 'missed_capture', 'ignored_threat',
  'trapped_piece', 'traded_behind', 'unsound_sacrifice', 'quiet_loss', 'back_rank',
  'king_exposed', 'overloaded', 'zugzwang',
]);

const PRAISE_LEADS = new Set<SituationKind>([
  'created_fork', 'created_discovered', 'sound_sacrifice', 'only_move', 'best', 'good',
  'passed_pawn', 'promotion', 'fortress', 'mate_delivered',
]);

// ---------------------------------------------------------------------------
// Headlines: orientation first. What is this position about?

const HEADLINES: Partial<Record<SituationKind, string[]>> = {
  walked_into_fork: [
    'One square, two of your pieces.',
    'What is this position about? One square.',
    'Notice the square, not only the move.',
  ],
  walked_into_pin: [
    'A piece that cannot move any more.',
    'What is happening here? A line, and a pin.',
    'Look at the line behind this piece.',
  ],
  walked_into_skewer: [
    'Two pieces on one line, friends.',
    'What is happening here? The line behind the piece.',
    'One line, two pieces, one attacker.',
  ],
  hung_piece: [
    'A piece is left without a defender.',
    'What is happening here? A piece has no guard.',
    'Notice the piece nobody is protecting.',
  ],
  under_defended: [
    'More attackers than defenders here.',
    'What is happening here? The count does not hold.',
    'One defender fewer than needed.',
  ],
  missed_capture: [
    'There was something to take here.',
    'What was on offer here? A free capture.',
    'A capture was waiting, friends.',
  ],
  missed_mate: [
    'There was a mate here, friends.',
    'What was available here? A mate.',
    'A forced mate was on the board.',
  ],
  allowed_mate: [
    'The king comes first here.',
    'What is this position about? The king.',
    'Notice the king before anything else.',
  ],
  ignored_threat: [
    'Your opponent asked a question first.',
    'What did the last move threaten?',
    'The threat came before the plan.',
  ],
  trapped_piece: [
    'A piece with nowhere to go.',
    'What is happening here? A piece is short of squares.',
    'Notice how few squares this piece has.',
  ],
  traded_behind: [
    'A trade while behind in material.',
    'What does this trade do for you?',
    'Fewer pieces, and the same deficit.',
  ],
  unsound_sacrifice: [
    'A brave idea that does not quite work.',
    'What does the sacrifice bring back?',
    'An interesting sacrifice, friends.',
  ],
  sound_sacrifice: [
    'A beautiful sacrifice!',
    'Look at this idea, friends!',
    'What a sacrifice this is.',
  ],
  created_fork: [
    'One move, two targets. Very nice!',
    'Look at this square, friends.',
    'Fantastic: one piece, two attacks.',
  ],
  created_discovered: [
    'Two attacks from one move. Very nice!',
    'Look at what moved, and what it uncovered.',
    'A discovered attack, beautifully done.',
  ],
  only_move: [
    'The only move, and you found it.',
    'What else was there? Nothing. Very nice.',
    'Exactly the right idea, friends.',
  ],
  mate_delivered: [
    'Checkmate, friends. Beautiful!',
    'Look at this finish!',
    'The game ends with a mate.',
  ],
  best: [
    'Very nice. Exactly the right idea.',
    'Look at this, friends: the best move.',
    'This is the move strong players find.',
  ],
  good: [
    'A good, healthy move.',
    'Very nice. Nothing wrong with this.',
    'A sound choice, friends.',
  ],
  book: [
    'Still in known territory.',
    'This is theory so far, friends.',
    'A book position, still.',
  ],
  left_book: [
    'On your own from here, friends.',
    'Here the theory ends and chess begins.',
    'The book closes here.',
  ],
  quiet_loss: [
    'A quiet move, and a quiet cost.',
    'What did this move give up? Something small.',
    'Nothing dramatic, but not the best.',
  ],
  back_rank: [
    'The back rank is the theme here.',
    'What is this position about? The king has no air.',
    'Notice the king and its back rank.',
  ],
  passed_pawn: [
    'A passed pawn is the story here.',
    'What is this position about? The passer.',
    'Look at this pawn, friends.',
  ],
  promotion: [
    'A pawn becomes a queen.',
    'Look at this pawn, friends!',
    'The passer arrives.',
  ],
  king_exposed: [
    'The king is out in the open.',
    'What is this position about? King safety.',
    'Notice the king and its shield.',
  ],
  overloaded: [
    'One piece with two jobs.',
    'What is happening here? A defender is overloaded.',
    'Notice the piece doing two things.',
  ],
  zugzwang: [
    'Every move makes it worse.',
    'What is this position about? Having to move.',
    'A position where passing would help.',
  ],
  fortress: [
    'A fortress holds here.',
    'What is this position about? A wall that holds.',
    'Nothing gets in, friends.',
  ],
};

// ---------------------------------------------------------------------------
// Lessons: a real question, then its answer, then something to carry.

const LESSONS: Record<string, string[]> = {
  check_landing_square: [
    'Before you place a piece, ask which square your opponent would most like to reach, and what it would attack from there. This is a pattern worth learning properly.',
    'What should you ask before a piece lands? Which square this leaves open for your opponent, and what it would touch from there.',
    'Friends, the square a piece leaves behind is as important as the square it goes to. Look at both before you commit.',
  ],
  count_attackers: [
    'Before you leave a piece somewhere, count once: how many attack it, how many defend it? If the attackers are more, it is not safe.',
    'The question to ask is simple, friends: who attacks this piece, and who defends it? Counting takes a second and saves a piece.',
    'You see, a piece is safe only when its defenders match its attackers. Make that count a habit.',
  ],
  look_for_captures: [
    'What should you look at first in any position? Captures, yours and theirs. The forcing moves tell you what the position is about.',
    'Friends, before anything quiet, look at every capture on the board. Most of them are bad, and the one that is not is the move.',
    'The idea is simple: list the captures first, then the checks, then everything else. Strong players do this without noticing, and so can you.',
  ],
  checks_first: [
    'Which moves should you look at first? Checks. A check forces the reply, and forcing moves are where the tactics live.',
    'Friends, the habit worth building is this: every check, every time, before you decide. It is the cheapest search there is.',
    'You see, a check narrows the replies to a handful. Look at those moves first and the rest of the position gets easier.',
  ],
  defend_back_rank: [
    'Where does your king breathe? If there is no escape square, the back rank is a target, and one small pawn step fixes it.',
    'Friends, give the king a breathing square before it needs one. A back-rank weakness is invisible until it is fatal.',
    'Notice the back rank whenever the rooks and queens are still on. One quiet pawn move buys your king air for the whole game.',
  ],
  see_their_threat: [
    'Before your own idea, ask what your opponent’s last move wants to do. Answer that first, and then play your plan.',
    'Friends, the habit is a single question after every move: what does this threaten? Your own plan can wait one move.',
    'You see, the opponent’s last move is a message. Read it before you reply, and most surprises disappear.',
  ],
  dont_trade_behind: [
    'When you are behind in material, ask: does this trade help me? Usually not, because fewer pieces means fewer chances to complicate.',
    'Friends, the side with less material wants pieces on the board. Keep them, and keep the game alive.',
    'The idea is that trades favour the side that is ahead. When you are behind, avoid the exchange and look for play instead.',
  ],
  push_the_passer: [
    'A passed pawn is a plan by itself, friends. Support it, push it, and make your opponent spend pieces stopping it.',
    'What does a passed pawn want? To run. Give it a rook behind it, friends, and let it run.',
    'Notice how a passed pawn ties your opponent’s pieces down. That is why strong players value it so highly.',
  ],
  keep_the_shield: [
    'The pawns in front of your king are its shield, friends. Move them only when you have counted what comes through the gap.',
    'What happens when a shield pawn moves? Files and diagonals open toward the king. Ask that before you push.',
    'You see, king safety is mostly the three pawns in front of it. Keep them together until the queens are gone.',
  ],
  one_defender_two_jobs: [
    'Friends, when one piece defends two things, ask what happens if it is forced to choose. An overloaded defender fails exactly when it matters.',
    'Friends, notice which piece has two jobs. That piece is the target, because it cannot be in two places.',
    'The idea is simple: a defender with two duties can only keep one. You will find that piece on both sides of the board.',
  ],
  keep_the_tension: [
    'Releasing the tension is a decision, friends. Ask what you gain by resolving it now, and if the answer is nothing, wait.',
    'What does the capture give you? If nothing concrete, keep the tension and let your opponent make the choice.',
    'You see, the side that keeps the tension keeps the options. Strong players hold it as long as they can.',
  ],
  book_ends_here: [
    'This is where the opening ends and your own thinking begins. Ask what the pawn structure wants, and play for that.',
    'Friends, leaving theory is not a problem, it is the game. Take one plan from the structure and follow it.',
    'Notice the structure once the book runs out. It tells you which side of the board to play on.',
  ],
  remember_this: [
    'Take this one idea with you into your next game, friends. One pattern, learned properly, is worth a hundred half-remembered.',
    'What is worth keeping from this moment? The pattern. Play it again, notice it again, and it becomes yours.',
    'You see, the point of a review is one idea you can practise. This is that idea.',
  ],
};

const LESSON_DEFAULT = [
  'What is worth keeping from this moment, friends? The pattern. Notice it once more and it becomes yours.',
  'Take one idea from this into your next game. That is how a pattern becomes practice.',
  'You see, every position teaches one thing. Find that one thing here and carry it with you.',
];

// ---------------------------------------------------------------------------
// Definitions: one technical term, immediately unpacked.

const DEFINITIONS: Record<string, string> = {
  fork: 'one piece attacking two at once, and what makes it so powerful is that your reply does not matter, the second piece falls anyway',
  pin: 'a piece that cannot move because something more valuable stands behind it on the same line',
  skewer: 'a pin in reverse: the valuable piece is in front, and when it moves, the piece behind it is taken',
  'discovered attack': 'one piece moving away to uncover an attack from the piece behind it, so one move makes two threats',
  zugzwang: 'a position where every move makes things worse, and you would love to pass, but chess does not allow it',
  fortress: 'a position that cannot be broken even with extra material, because every entry square is covered',
  'back rank': 'the row your king sits on; when its own pawns block the escape, a rook or queen arriving there is mate',
  'passed pawn': 'a pawn with no enemy pawn in front of it or beside it, so only a piece can stop it from promoting',
  overloaded: 'a defender with two jobs, which can keep one while the other falls',
};

const normaliseTerm = (term: string) => term.trim().toLowerCase().replace(/[_-]+/g, ' ');

// ---------------------------------------------------------------------------
// Frames

const verdict: Frame = (p, ctx) => {
  const lead = strArg(p.args, 'lead', 'situation', 'kind') as SituationKind | undefined;
  const move = strArg(p.args, 'move', 'san', 'played');
  const authored = lead ? HEADLINES[lead] : undefined;
  if (authored) return authored;
  const played = move ? ctx.move(move) : 'this move';
  return [
    `What is this position about after ${played}?`,
    `Let’s understand ${played} properly, friends.`,
    `A moment worth a closer look: ${played}.`,
  ];
};

const hangs: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece', 'hanging');
  const attackers = piecesArg(p.args, 'attackers', 'attacker', 'by');
  const defenders = piecesArg(p.args, 'defenders', 'defender');
  if (!target) {
    return [
      'A piece is left where it can be taken for nothing.',
      'What is happening here? A piece is attacked and nobody is guarding it.',
      'Notice the piece with no defender.',
    ];
  }
  const t = ctx.refer(target);
  const guard = defenders.length > 0 ? 'the defence does not hold' : 'nothing defends it';
  if (attackers.length === 0) {
    return [
      `${capitalise(t)} is left where it can be taken, and ${guard}.`,
      `Notice ${t}: it is attacked, and ${guard}.`,
      `What is happening to ${t}? It is under attack, and ${guard}.`,
    ];
  }
  const a = piecesOf(attackers, ctx);
  return [
    `${capitalise(t)} is left where ${a} can take it, and ${guard}.`,
    `Notice ${t}: ${a} attacks it, and ${guard}.`,
    `What is happening to ${t}? It is attacked by ${a}, and ${guard}.`,
  ];
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p.args, 'by', 'attacker', 'piece');
  const targets = piecesArg(p.args, 'targets', 'target');
  if (!by || targets.length === 0) {
    return [
      'One piece attacks two of yours at the same time, so only one can be saved.',
      'What is happening here? Two of your pieces are attacked at once.',
      'Look at this: a single move hits two pieces together.',
    ];
  }
  const b = ctx.refer(by);
  const squares = squaresOf(targets, ctx);
  const one = targets.length === 2 ? 'only one of the two can be saved' : 'only one of them can be saved';
  return [
    `${capitalise(b)} attacks ${squares} at the same time, so ${one}.`,
    `Look at this: ${b} hits ${squares} at once, and you can only move one piece.`,
    `What is happening here? ${capitalise(b)} is attacking ${piecesOf(targets, ctx)} together, and one of them must fall.`,
  ];
};

const swing: Frame = (p) => {
  const before = numArg(p.args, 'before', 'winBefore', 'from');
  const after = numArg(p.args, 'after', 'winAfter', 'to');
  if (before === undefined || after === undefined) {
    return [
      'This one move changed the assessment of the whole game.',
      'What did this move do to the position? It changed what the game is about.',
      'Notice how much the position changed on a single move.',
    ];
  }
  const a = describeWin(before);
  const b = describeWin(after);
  if (a === b) {
    return [
      `Your winning chances stayed ${a}, so the position is still what it was.`,
      `What did this move change? Very little: you were ${a} before it and ${a} after it.`,
      `Notice that the assessment did not move: ${a}, before and after.`,
    ];
  }
  if (after > before) {
    return [
      `Your winning chances went from ${a} to ${b}. That is what a good move does.`,
      `What did this move do? It carried you from ${a} to ${b}.`,
      `Notice the change, friends: from ${a} to ${b}, on one move.`,
    ];
  }
  return [
    `Your winning chances went from ${a} to ${b} on this one move.`,
    `What did this cost? Before the move you were ${a}; after it, ${b}.`,
    `Notice the size of it, friends: from ${a} to ${b}, in a single move.`,
  ];
};

const materialDelta: Frame = (p) => {
  const gain = numArg(p.args, 'gain', 'materialGain', 'delta', 'units', 'value') ?? 0;
  const m = describeMaterial(gain);
  return [
    `In material terms, the difference is ${m}.`,
    `What does it come to? ${capitalise(m)}, on one move.`,
    `That is ${m}, friends, and a piece is a lot of chess.`,
  ];
};

const bestMove: Frame = (p, ctx) => {
  const move = strArg(p.args, 'move', 'san', 'best', 'bestMove');
  if (!move) {
    return [
      'There was a better move here.',
      'What was the better move? A quieter one.',
      'Something better was available, friends.',
    ];
  }
  const m = ctx.move(move);
  return [
    `${m} was the move here.`,
    `Better was ${m}, friends.`,
    `The move to find was ${m}.`,
  ];
};

const bestDoes: Frame = (p, ctx) => {
  const move = strArg(p.args, 'move', 'san', 'best', 'bestMove');
  const captures = pieceArg(p.args, 'captures', 'capture', 'target');
  const forks = piecesArg(p.args, 'forks', 'targets');
  const check = boolArg(p.args, 'check', 'givesCheck');
  const mateIn = numArg(p.args, 'mateIn', 'mate');
  const effects: string[] = [];
  if (mateIn !== undefined && mateIn > 0) {
    effects.push(mateIn === 1 ? 'mates at once' : `mates in ${inWords(mateIn)}`);
  }
  if (captures) effects.push(`takes ${ctx.refer(captures)}`);
  if (forks.length > 1) effects.push(`attacks ${squaresOf(forks, ctx)} at the same time`);
  if (check) effects.push('comes with check');
  const m = move ? ctx.move(move) : 'the better move';
  if (effects.length === 0) {
    return [
      `The idea is that ${m} keeps everything protected.`,
      `Why ${m}? Because it holds the position together.`,
      `You see, ${m} keeps your pieces safe and your plan alive.`,
    ];
  }
  const does = joinList(effects);
  return [
    `The idea is that ${m} ${does}.`,
    `Why ${m}? Because it ${does}.`,
    `You see, ${m} ${does}, and that is what makes it the move.`,
  ];
};

const define: Frame = (p) => {
  const raw = strArg(p.args, 'term', 'concept', 'word') ?? 'pattern';
  const term = normaliseTerm(raw);
  const body = DEFINITIONS[term] ?? 'a pattern that comes up again and again once you have seen it once';
  return [
    `This is a ${term}: ${body}.`,
    `What is a ${term}? It is ${body}.`,
    `The term here is “${term}”, which means ${body}.`,
  ];
};

const lesson: Frame = (p) => {
  const concept = strArg(p.args, 'concept', 'id', 'key') ?? '';
  return LESSONS[concept] ?? LESSON_DEFAULT;
};

// ---------------------------------------------------------------------------
// Prosody

function reaction(epLoss: number, lead: SituationKind): string {
  if (PRAISE_LEADS.has(lead)) {
    if (lead === 'sound_sacrifice' || lead === 'mate_delivered') return 'Oh, this is beautiful!';
    if (lead === 'created_fork' || lead === 'created_discovered' || lead === 'only_move') {
      return 'Very nice.';
    }
    return '';
  }
  if (epLoss >= 0.2) return 'Ah. Okay, this is an important moment, so let’s understand it properly.';
  if (epLoss >= 0.08) return 'Not the best, but I can see what you were thinking here.';
  if (epLoss >= 0.045) return 'A small slip, and an interesting one.';
  return '';
}

const CLOSERS: Partial<Record<SituationKind, string>> = {
  walked_into_fork: 'Carry this into your next game: look at the square, not only the move.',
  walked_into_pin: 'Carry this into your next game: look along the line behind every piece.',
  walked_into_skewer: 'Carry this into your next game: look along the line behind every piece.',
  hung_piece: 'Next game, count attackers and defenders once before you commit.',
  under_defended: 'Next game, count attackers and defenders once before you commit.',
  trapped_piece: 'Next game, ask where a piece goes next before it arrives.',
  missed_capture: 'Next game, check the captures first. It takes a moment.',
  missed_mate: 'Next game, check every check first. It takes a moment.',
  allowed_mate: 'Next game, ask what the last move threatens against your king.',
  ignored_threat: 'Next game, read the opponent’s last move before you play your own.',
  back_rank: 'Next game, give your king a breathing square early.',
  traded_behind: 'Next game, when behind, keep the pieces on and keep fighting.',
  left_book: 'From here it is your chess, friends, and that is the interesting part.',
};

function closer(lead: SituationKind): string {
  const authored = CLOSERS[lead];
  if (authored) return authored;
  if (PRAISE_LEADS.has(lead)) return 'Keep this pattern, friends; it will come back in your next game.';
  return 'Take one idea from this into your next game.';
}

// ---------------------------------------------------------------------------
// Shape: soften, cap the exclamation marks, make sure something is carryable.

const CARRYABLE = /next game|next time|pattern|practice|practise|carry|remember|worth|from now on|every time|habit/i;
const SOFTEN: Array<[RegExp, string]> = [
  [/\ba (?:terrible|awful|horrible|bad) move\b/gi, 'not the best move'],
  [/\bterrible\b/gi, 'not the best'],
  [/\bawful\b/gi, 'not the best'],
  [/\bhorrible\b/gi, 'not the best'],
  [/\bdisaster\b/gi, 'a hard moment'],
  [/\bobviously\b/gi, 'clearly'],
  [/\bstupid\b/gi, 'hasty'],
  [/\bdumb\b/gi, 'hasty'],
];

function soften(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SOFTEN) out = out.replace(pattern, replacement);
  // "just" is banned as dismissive; drop it and mend the whitespace.
  out = out.replace(/\s+just\b/gi, '').replace(/\bjust\s+/gi, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:?!])/g, '$1').trim();
}

function shape(slots: Record<Slot, string>, _ctx: RenderContext): Record<Slot, string> {
  const out = { ...slots };
  for (const slot of Object.keys(out) as Slot[]) out[slot] = soften(out[slot] ?? '');

  // At most two earned exclamation marks across the whole note, in order.
  let spent = 0;
  for (const slot of ['headline', 'whatHappened', 'whyItMatters', 'betterWas', 'lesson'] as Slot[]) {
    out[slot] = out[slot].replace(/!/g, () => (++spent <= 2 ? '!' : '.'));
  }

  // The note addresses the reader somewhere; if nothing does, the lesson will.
  const all = Object.values(out).join(' ');
  if (!/\b(friends|you|your)\b/i.test(all) && out.lesson) {
    out.lesson = `Friends, ${out.lesson[0]!.toLowerCase()}${out.lesson.slice(1)}`;
  }

  // End on something the reader can carry into the next game.
  if (out.lesson && !CARRYABLE.test(out.lesson)) {
    out.lesson = `${out.lesson.trim()} That is a pattern worth carrying into your next game.`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events: the spec's line first, then two more in the same register.

const EVENT_EXTRAS: Record<Trigger, string[]> = {
  reviewStart: [
    'Friends, let’s look at this game together and see what it has to teach.',
    'Let’s go through the game move by move, friends, and see what was happening.',
  ],
  brilliant: [
    'Look at this, friends! This is the kind of move that makes you love the game.',
    'Fantastic. You have to see the idea behind this one.',
  ],
  great: [
    'Look at this. That is the move strong players find.',
    'Very nice, friends. This is the right idea, played at the right moment.',
  ],
  blunder: [
    'Okay. Something interesting happened here, so let’s slow down and see it.',
    'This is an important moment, friends. Let’s understand what the position wanted.',
  ],
  mistake: [
    'Not quite the best, but the idea behind it is a natural one.',
    'I can see the thought here, friends. There was something better.',
  ],
  miss: [
    'Friends, there was something beautiful here. Let’s see it together.',
    'Look at this position once more. Something special was waiting.',
  ],
  bookExit: [
    'The theory ends here, friends, and now it is your chess.',
    'From this move on you are thinking for yourself, which is the point.',
  ],
  comeback: [
    'You see what fighting does? The position came back to you.',
    'Very nice, friends. You kept going and the game rewarded it.',
  ],
  collapse: [
    'A winning position slipped here, friends. It happens, and it is worth understanding why.',
    'This is the hard part of chess: holding a win. Let’s see where it went.',
  ],
  highAccuracy: [
    'Friends, this is a well-played game. There is a lot of good chess in it.',
    'Very nice. You played this one with real care.',
  ],
  lowAccuracy: [
    'A hard game, friends, and hard games teach the most.',
    'There was a lot going on here. Every one of those moments is a lesson.',
  ],
  longGame: [
    'A long fight, friends. Staying sharp this long is its own skill.',
    'Games this long ask a lot of you. Well fought.',
  ],
  reviewEnd: [
    'That is the game, friends. Keep one pattern from it and practise it.',
    'And that is where it ends. Take one idea with you into the next game.',
  ],
  random: [
    'You see, every position has something to notice.',
    'Chess rewards attention, friends. Keep looking.',
  ],
};

// ---------------------------------------------------------------------------

function build(): PersonaGrammar {
  const base = neutralGrammar('sagar');
  const events: Partial<Record<Trigger, string[]>> = {};
  for (const [trigger, extras] of Object.entries(EVENT_EXTRAS) as [Trigger, string[]][]) {
    events[trigger] = [...(base.events[trigger] ?? []), ...extras];
  }

  return {
    ...base,
    lexicon: {
      ...base.lexicon,
      captureVerb: 'takes',
      address: 'friends',
      intensifiers: ['really', 'genuinely', 'very'],
      praise: ['brilliant', 'beautiful', 'fantastic', 'very nice', 'good'],
      blame: ['not the best', 'a slip', 'an important moment'],
      fillers: [],
      connectives: ['and', 'so', 'because', 'you see'],
    },
    syntax: {
      ...base.syntax,
      maxSentenceWords: 30,
      fragments: false,
      chainWithAnd: false,
      questionRate: 0.3,
      verdictFirst: false,
      preferHere: false,
      imperativeAdvice: true,
    },
    prosody: {
      ...base.prosody,
      exclamations: 2,
      capsPeak: false,
      reaction,
      closer,
      sentenceCase: true,
    },
    events,
    frames: {
      verdict,
      hangs,
      forked,
      swing,
      material_delta: materialDelta,
      best_move: bestMove,
      best_does: bestDoes,
      define,
      lesson,
    },
    shape,
  };
}

/** Sagar Shah, The Mentor: warm, orienting, one term unpacked, a question answered. */
export const sagar: PersonaGrammar = build();

/** Exposed for the voice tests; not part of the public API. */
export const sagarInternals = { describeWin, describeMaterial, LOSS_LEADS, PRAISE_LEADS };
