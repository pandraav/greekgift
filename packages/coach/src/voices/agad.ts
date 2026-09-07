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
 * agadmator — The Archivist.
 *
 * Built from the ten voice rules in the personas spec: "Hello everyone and
 * welcome to…", scene before analysis, "captures on" and never "takes" or "x",
 * clauses chained with "and", the pause-and-guess formula deployed and
 * subverted, load-bearing "uh" at roughly one per sixty words, the resignation
 * formula for lost positions, deadpan flourishes about pieces never players,
 * epithets, and never a call to action. No exclamation marks at all.
 *
 * Every chess token goes through `ctx.refer`, `ctx.square` or `ctx.move`. The
 * planner's argument names are not part of the frozen contract, so each
 * accessor tries the natural names first and then the first argument of the
 * right shape.
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

function boolArg(args: Args, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

function lineArg(args: Args, ...keys: string[]): string[] {
  for (const key of keys) {
    const v = args[key];
    if (isLine(v) && v.length > 0) return v;
  }
  for (const v of Object.values(args)) if (isLine(v) && v.length > 0 && !isPieceList(v)) return v;
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

// ---------------------------------------------------------------------------
// Numbers are said, not written: "fifty-two to eighteen", "move eighteen".

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberWords(value: number): string {
  const n = Math.round(value);
  if (n < 0) return `minus ${numberWords(-n)}`;
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]!;
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  }
  if (n === 100) return 'one hundred';
  return String(n);
}

/** Material in words. */
function describeMaterial(units: number): string {
  const n = Math.abs(Math.round(units));
  if (n === 0) return 'nothing at all';
  if (n === 1) return 'a pawn';
  if (n === 2) return 'two pawns';
  if (n <= 4) return 'a whole piece';
  if (n <= 6) return 'a rook';
  if (n <= 8) return 'two pieces';
  return 'a queen';
}

/**
 * The chant: "captures, captures, and knight to e4". The first capture in a run
 * names the piece and the square; the ones after it are simply "captures".
 */
function chant(line: string[], ctx: RenderContext): string {
  const parts: string[] = [];
  let inRun = false;
  for (const san of line) {
    const m = /^([KQRBN]?)[a-h]?[1-8]?x([a-h][1-8])/.exec(san);
    if (m) {
      const piece = ctx.lexicon.pieceNames[(m[1] || 'P') as PieceRef['piece']];
      parts.push(inRun ? 'captures' : `${piece} captures on ${ctx.square(m[2]!)}`);
      inRun = true;
    } else {
      parts.push(`${inRun ? 'and ' : ''}${ctx.move(san)}`);
      inRun = false;
    }
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Situation groups

const LOST_LEADS = new Set<SituationKind>([
  'allowed_mate',
  'hung_piece',
  'walked_into_fork',
  'walked_into_skewer',
  'trapped_piece',
  'unsound_sacrifice',
]);

const PRAISE_LEADS = new Set<SituationKind>([
  'created_fork', 'created_discovered', 'sound_sacrifice', 'only_move', 'best', 'good',
  'passed_pawn', 'promotion', 'fortress', 'mate_delivered',
]);

// ---------------------------------------------------------------------------
// Headlines: set the scene. Each takes an ", at move eighteen" suffix or ''.

const HEADLINES: Partial<Record<SituationKind, (at: string) => string[]>> = {
  walked_into_fork: (at) => [
    `A quiet square${at}.`,
    `And here${at}, a fork.`,
    `One square, two pieces${at}.`,
  ],
  walked_into_pin: (at) => [
    `A pin${at}.`,
    `And here${at}, a piece stops moving.`,
    `One line, one pin${at}.`,
  ],
  walked_into_skewer: (at) => [
    `A skewer${at}.`,
    `And here${at}, two pieces on one line.`,
    `One line, two pieces${at}.`,
  ],
  hung_piece: (at) => [
    `A piece left hanging${at}.`,
    `And here${at}, a piece is loose.`,
    `Nothing defends it${at}.`,
  ],
  under_defended: (at) => [
    `One defender short${at}.`,
    `And here${at}, the count does not hold.`,
    `More attackers than defenders${at}.`,
  ],
  missed_capture: (at) => [
    `A capture goes unplayed${at}.`,
    `And here${at}, something was free.`,
    `A free piece${at}.`,
  ],
  missed_mate: (at) => [
    `A mate was there${at}.`,
    `And here${at}, a mate goes unplayed.`,
    `Feel free to pause${at}.`,
  ],
  allowed_mate: (at) => [
    `And here${at}, the king falls.`,
    `A mating net${at}.`,
    `The end arrives${at}.`,
  ],
  ignored_threat: (at) => [
    `A threat goes unanswered${at}.`,
    `And here${at}, the reply was missed.`,
    `The other side had a threat${at}.`,
  ],
  trapped_piece: (at) => [
    `A piece with no squares${at}.`,
    `And here${at}, a piece is trapped.`,
    `Nowhere to go${at}.`,
  ],
  traded_behind: (at) => [
    `A trade while behind${at}.`,
    `And here${at}, pieces come off.`,
    `Fewer pieces, same deficit${at}.`,
  ],
  unsound_sacrifice: (at) => [
    `A sacrifice that does not work${at}.`,
    `And here${at}, a piece is given away.`,
    `A brave piece${at}.`,
  ],
  sound_sacrifice: (at) => [
    `An exquisite sacrifice${at}.`,
    `And here${at}, a piece is offered.`,
    `A remarkable idea${at}.`,
  ],
  created_fork: (at) => [
    `A fork${at}.`,
    `And here${at}, two pieces at once.`,
    `One square, two targets${at}.`,
  ],
  created_discovered: (at) => [
    `A discovered attack${at}.`,
    `And here${at}, one move, two threats.`,
    `The piece behind speaks${at}.`,
  ],
  only_move: (at) => [
    `The one and only move${at}.`,
    `And here${at}, the only move.`,
    `Nothing else works${at}.`,
  ],
  mate_delivered: (at) => [
    `Checkmate${at}.`,
    `And here${at}, the game ends.`,
    `The king has no squares${at}.`,
  ],
  best: (at) => [
    `An exquisite move${at}.`,
    `And here${at}, a remarkable idea.`,
    `A very fine move${at}.`,
  ],
  good: (at) => [
    `A fine move${at}.`,
    `And here${at}, a sensible choice.`,
    `A healthy move${at}.`,
  ],
  book: (at) => [
    `Still theory${at}.`,
    `Known territory${at}.`,
    `Book moves${at}.`,
  ],
  left_book: (at) => [
    `Out of theory${at}.`,
    `And here${at}, theory ends.`,
    `The real game begins${at}.`,
  ],
  quiet_loss: (at) => [
    `A quiet move, a quiet cost${at}.`,
    `And here${at}, a small slip.`,
    `Not the best${at}.`,
  ],
  back_rank: (at) => [
    `The back rank${at}.`,
    `And here${at}, the king has no air.`,
    `A weak back rank${at}.`,
  ],
  passed_pawn: (at) => [
    `A passed pawn${at}.`,
    `And here${at}, a pawn starts running.`,
    `The passer${at}.`,
  ],
  promotion: (at) => [
    `A new queen${at}.`,
    `And here${at}, the pawn arrives.`,
    `Promotion${at}.`,
  ],
  king_exposed: (at) => [
    `A king in the open${at}.`,
    `And here${at}, the shield is gone.`,
    `King safety${at}.`,
  ],
  overloaded: (at) => [
    `One piece, two jobs${at}.`,
    `And here${at}, a defender is overloaded.`,
    `Too much to defend${at}.`,
  ],
  zugzwang: (at) => [
    `Zugzwang${at}.`,
    `And here${at}, every move hurts.`,
    `Nobody wants to move${at}.`,
  ],
  fortress: (at) => [
    `A fortress${at}.`,
    `And here${at}, the wall holds.`,
    `Nothing gets in${at}.`,
  ],
};

// ---------------------------------------------------------------------------
// Lessons: declarative, never a call to action.

const LESSONS: Record<string, string[]> = {
  check_landing_square: [
    'It is always worth a couple of seconds to ask which square your opponent would most like to occupy, and what it would touch once they got there.',
    'The square a piece leaves behind is, you know, as important as the square it goes to, and both are worth a look.',
    'For those of you wondering, the whole thing comes down to one empty square, and a couple of seconds spent on it.',
  ],
  count_attackers: [
    'It is always worth counting once: how many pieces attack this square, and how many defend it, and of course the piece stays only if the numbers hold.',
    'A piece is safe when its defenders match its attackers, and, you know, not otherwise.',
    'For those of you wondering, this is simply arithmetic: attackers on one side, defenders on the other.',
  ],
  look_for_captures: [
    'Captures come first, of course, yours and your opponent’s, and the quiet moves come after.',
    'It is always worth a couple of seconds on every capture on the board, because one of them is usually the move.',
    'The forcing moves tell you what the position is about, and, you know, captures are the most forcing of all.',
  ],
  checks_first: [
    'Checks come first, and of course they narrow the replies to a handful, which makes everything after them easier.',
    'It is always worth a couple of seconds on every check, because the tactics live there.',
    'For those of you wondering, a check is a question the other side must answer, and that is why it goes first.',
  ],
  defend_back_rank: [
    'A king with no escape square is, you know, a target, and one quiet pawn move gives it air for the whole game.',
    'The back rank is invisible until it is fatal, and of course the cure is a single pawn step.',
    'It is always worth asking where the king breathes, especially while the rooks and queens are still on.',
  ],
  see_their_threat: [
    'The opponent’s last move is a message, and it is always worth reading it before the reply.',
    'Every move asks a question, and, you know, the question comes before your own plan.',
    'For those of you wondering, the whole thing is one question after every move: what does this threaten.',
  ],
  dont_trade_behind: [
    'Trades favour the side that is ahead, and of course the side that is behind wants pieces on the board.',
    'With less material, every exchange is, you know, a small resignation, and the pieces are worth keeping.',
    'For those of you wondering, fewer pieces means fewer chances to complicate, and complications are what the worse side lives on.',
  ],
  push_the_passer: [
    'A passed pawn is a plan by itself, and of course it wants a rook behind it and a clear road ahead.',
    'A passed pawn ties down the pieces sent to stop it, and, you know, that is where its value lies.',
    'For those of you wondering, the passer is the story, and everything else is, uh, supporting cast.',
  ],
  keep_the_shield: [
    'The pawns in front of the king are its shield, and of course every one that moves opens a file or a diagonal.',
    'King safety is mostly three pawns, and, you know, they are worth keeping together while the queens are on.',
    'For those of you wondering, a shield pawn that advances does not come back, and the king remembers.',
  ],
  one_defender_two_jobs: [
    'A defender with two jobs can keep only one, and of course that piece is the target on both sides of the board.',
    'One piece guarding two things is, you know, guarding neither, once it is asked to choose.',
    'For those of you wondering, the overloaded piece is the one to look for, and the rest follows.',
  ],
  keep_the_tension: [
    'Releasing the tension is a decision, and it is always worth asking what the release gives, because usually it is nothing.',
    'The side that keeps the tension keeps the options, and, you know, options are worth a lot.',
    'For those of you wondering, a capture that gains nothing concrete simply hands the choice to the other side.',
  ],
  book_ends_here: [
    'Theory ends here, and of course the pawn structure now says which side of the board the game is on.',
    'Out of book, the structure is the plan, and, you know, the structure is right there on the board.',
    'For those of you wondering, leaving theory is not a problem, it is simply where the game begins.',
  ],
  remember_this: [
    'One idea, seen properly once, is worth, you know, a hundred half-remembered ones.',
    'This is a pattern that comes back, and of course it is worth a couple of seconds now so it is recognised later.',
    'For those of you wondering, this is the moment to keep, and the rest of the game is context.',
  ],
};

const LESSON_DEFAULT = [
  'One idea from this position is worth keeping, and, you know, it will come back.',
  'It is always worth a couple of seconds on a moment like this, because the pattern returns.',
  'For those of you wondering, this is the moment to remember from the game.',
];

// ---------------------------------------------------------------------------
// Definitions: set the scene for the term.

const DEFINITIONS: Record<string, string> = {
  fork: 'one piece attacking two at the same moment, so that only one of them can be saved',
  pin: 'a piece that cannot move because something more valuable stands behind it on the same line',
  skewer: 'a pin in reverse, the valuable piece in front, and when it moves the piece behind it is captured',
  'discovered attack': 'one piece moving away to uncover an attack from the piece behind it, two threats from a single move',
  zugzwang: 'a position where every move makes things worse, and one would very much like to pass',
  fortress: 'a position that cannot be broken even with extra material, because every entry square is covered',
  'back rank': 'the row the king sits on, and when its own pawns block the escape, a rook or queen arriving there is mate',
  'passed pawn': 'a pawn with no enemy pawn in front of it or beside it, so that only a piece can stop it',
  overloaded: 'a defender with two jobs, which can keep one of them and not the other',
};

const normaliseTerm = (term: string) => term.trim().toLowerCase().replace(/[_-]+/g, ' ');

// ---------------------------------------------------------------------------
// Frames

function moveNumberOf(args: Args): number | undefined {
  const explicit = numArg(args, 'moveNumber', 'move_number', 'number');
  if (explicit !== undefined) return explicit;
  const ply = numArg(args, 'ply');
  return ply === undefined ? undefined : Math.ceil(ply / 2);
}

const verdict: Frame = (p, ctx) => {
  const lead = strArg(p.args, 'lead', 'situation', 'kind') as SituationKind | undefined;
  const n = moveNumberOf(p.args);
  const at = n === undefined ? '' : `, at move ${numberWords(n)}`;
  const authored = lead ? HEADLINES[lead] : undefined;
  if (authored) return authored(at);
  const move = strArg(p.args, 'move', 'san', 'played');
  const played = move ? ctx.move(move) : 'this move';
  return [
    `And here${at}, ${played}.`,
    `A quiet moment${at}.`,
    `${capitalise(played)}${at}.`,
  ];
};

const hangs: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece', 'hanging');
  const attackers = piecesArg(p.args, 'attackers', 'attacker', 'by');
  const defenders = piecesArg(p.args, 'defenders', 'defender');
  if (!target) {
    return [
      'And here a piece is left hanging, and nothing is defending it.',
      'A piece is loose, and, you know, nobody is looking after it.',
      'And here a piece is protected by absolutely nothing.',
    ];
  }
  const t = ctx.refer(target);
  const sq = ctx.square(target.square);
  const guard = defenders.length > 0 ? 'the defence does not hold' : 'nothing is defending it';
  if (attackers.length === 0) {
    return [
      `${capitalise(t)} is left hanging, and ${guard}.`,
      `And here ${t} is loose, and, you know, ${guard}.`,
      `${capitalise(t)} is protected by absolutely nothing, and it is attacked.`,
    ];
  }
  const a = piecesOf(attackers, ctx);
  return [
    `${capitalise(t)} is left where ${a} can capture on ${sq}, and ${guard}.`,
    `And here ${t} is hanging, ${a} can simply capture on ${sq}, and ${guard}.`,
    `${capitalise(t)} is protected by absolutely nothing, and ${a} sees it.`,
  ];
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p.args, 'by', 'attacker', 'piece');
  const targets = piecesArg(p.args, 'targets', 'target');
  if (!by || targets.length === 0) {
    return [
      'And here one piece attacks two at the same moment, and only one of them can be saved.',
      'A fork, and, you know, one of the two pieces is simply lost.',
      'And here a single move touches two pieces at once, and there is no move that saves both.',
    ];
  }
  const b = ctx.refer(by);
  const squares = squaresOf(targets, ctx);
  const one = targets.length === 2 ? 'only one of the two can be saved' : 'only one of them can be saved';
  return [
    `${capitalise(b)} attacks ${squares} at the same moment, and ${one}.`,
    `And here ${b} touches ${squares} at once, and, you know, one of them is simply lost.`,
    `None other than ${b} attacks ${piecesOf(targets, ctx)} together, and there is no move that saves both.`,
  ];
};

const swing: Frame = (p) => {
  const before = numArg(p.args, 'before', 'winBefore', 'from');
  const after = numArg(p.args, 'after', 'winAfter', 'to');
  if (before === undefined || after === undefined) {
    return [
      'And it was here that the game effectively turned, on a single move.',
      'The assessment changed here, and, you know, it changed quite a lot.',
      'And here the whole game turns, and of course the pieces have hardly moved.',
    ];
  }
  const a = numberWords(before);
  const b = numberWords(after);
  if (after > before) {
    return [
      `And here the winning chances rise from ${a} to ${b}, and the position is, you know, quite pleasant.`,
      `From ${a} to ${b}, and of course that is what a good move does.`,
      `The position was ${a} before this and ${b} after it, and the pieces have hardly moved.`,
    ];
  }
  if (after === before) {
    return [
      `The winning chances stay at ${a}, and, you know, nothing has really changed.`,
      `From ${a} to ${a}, and of course the position is what it was.`,
      `And here nothing moves, ${a} before and ${a} after.`,
    ];
  }
  return [
    `And it was here that the game effectively turned, the winning chances falling from ${a} to ${b}, on a single move.`,
    `The position was ${a} before this, you know, and ${b} after it, and that is the whole story.`,
    `From ${a} to ${b}, and of course the pieces did not move much, but the assessment did.`,
  ];
};

const materialDelta: Frame = (p) => {
  const gain = numArg(p.args, 'gain', 'materialGain', 'delta', 'units', 'value') ?? 0;
  const m = describeMaterial(gain);
  return [
    `And that is ${m}, gone.`,
    `In material, that is ${m}, and of course that is the game at this level.`,
    `${capitalise(m)}, for those of you counting.`,
  ];
};

const bestMove: Frame = (p, ctx) => {
  const move = strArg(p.args, 'move', 'san', 'best', 'bestMove');
  if (!move) {
    return [
      'And here there was a better move, and the position would hold.',
      'A better move was available, and, you know, a quieter one.',
      'Something better was there, of course.',
    ];
  }
  const m = ctx.move(move);
  return [
    `Better was ${m}, and here the position holds.`,
    `${m}, of course, and there is nothing to worry about.`,
    `And here ${m} was available, the one and only move.`,
  ];
};

const bestLine: Frame = (p, ctx) => {
  const line = lineArg(p.args, 'line', 'moves', 'bestLine');
  if (line.length === 0) {
    return [
      'The line holds, and of course the position stays together.',
      'For those of you who want the whole line, it simply holds.',
      'The line is quiet, and, you know, that is the point of it.',
    ];
  }
  const c = chant(line, ctx);
  return [
    `The line was ${c}, and the position holds.`,
    `For those of you who want the whole line: ${c}.`,
    `${capitalise(c)}, and of course everything is fine.`,
  ];
};

const sacrifice: Frame = (p, ctx) => {
  const piece = pieceArg(p.args, 'piece', 'sacrificed', 'target');
  const sound = boolArg(p.args, 'sound', 'works') ?? true;
  const ref = piece ? ctx.refer(piece) : 'a piece';
  if (sound) {
    return [
      `And here ${ref} is given away, and of course it is not a mistake, it is an exquisite sacrifice.`,
      `${capitalise(ref)} goes, and for those of you wondering, it comes back with interest.`,
      `A sacrifice: ${ref} is offered, and the position, you know, simply opens up.`,
    ];
  }
  return [
    `And here ${ref} is given away, and, uh, nothing comes back for it.`,
    `${capitalise(ref)} goes, and for those of you wondering, it does not return.`,
    `A sacrifice in name only: ${ref} is lost, and the attack is not there.`,
  ];
};

const missedMate: Frame = (p, ctx) => {
  const line = lineArg(p.args, 'line', 'moves', 'mateLine');
  if (line.length === 0) {
    return [
      'Feel free to pause here and find the mate, because it was there.',
      'I would ask you to pause and find the mate, but you guys already see it.',
      'And here there was a mate, and it goes unplayed.',
    ];
  }
  const c = chant(line, ctx);
  return [
    `Feel free to pause here and find the mate. ${capitalise(c)}, and it is over.`,
    `I would ask you to pause and find it, but you guys already see it: ${c}.`,
    `And here there was a mate, ${c}, and there would be nothing more to be done.`,
  ];
};

const mateAllowed: Frame = (p, ctx) => {
  const line = lineArg(p.args, 'line', 'moves', 'mateLine');
  if (line.length === 0) {
    return [
      'And here, uh, the king cannot escape, and there is nothing more to be done here.',
      'The mating net closes, and of course there is no way out.',
      'And here the king falls, and that is the game.',
    ];
  }
  const c = chant(line, ctx);
  return [
    `And here, uh, ${c}, and the king cannot escape.`,
    `${capitalise(c)}, and there is nothing more to be done here.`,
    `The mating net closes: ${c}.`,
  ];
};

const define: Frame = (p) => {
  const raw = strArg(p.args, 'term', 'concept', 'word') ?? 'pattern';
  const term = normaliseTerm(raw);
  const body = DEFINITIONS[term] ?? 'a pattern that comes back again and again once it has been seen';
  return [
    `For those of you who are new to this, a ${term} is ${body}, and it is a very old idea.`,
    `A ${term}, for those of you wondering, is ${body}.`,
    `Now, a ${term}. ${capitalise(body)}, and that is, uh, all there is to it.`,
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
    if (lead === 'sound_sacrifice' || lead === 'mate_delivered') {
      return 'And here, an absolutely spectacular move.';
    }
    if (lead === 'only_move') return 'A very fine move, and of course the only one that works.';
    if (lead === 'created_fork' || lead === 'created_discovered') return 'And here, a very fine move.';
    return '';
  }
  if (epLoss >= 0.2) return 'And it was here, uh, that things went wrong.';
  if (epLoss >= 0.08) return 'Not the best, but you know, an understandable choice.';
  if (epLoss >= 0.045) return 'And here, a small slip.';
  return '';
}

const RESIGNATION = 'There is nothing more to be done here.';

function closer(lead: SituationKind): string {
  if (LOST_LEADS.has(lead)) return RESIGNATION;
  if (lead === 'missed_mate') return 'I would ask you to pause and find it, but you guys already see it.';
  if (lead === 'left_book') return 'And from here, the real game begins.';
  return '';
}

// ---------------------------------------------------------------------------
// Shape: no exclamation marks, "captures on" never "takes", the filler rate.

const SLOT_ORDER: Slot[] = ['headline', 'whatHappened', 'whyItMatters', 'betterWas', 'lesson'];
const FILLER_EVERY = 60;

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const countUh = (s: string) => (s.match(/\buh\b/gi) ?? []).length;

function captureVerbs(text: string): string {
  return text
    .replace(/\btakes on\b/g, 'captures on')
    .replace(/\bTakes on\b/g, 'Captures on')
    // Only a chess capture becomes "captures on": "takes away the last
    // square" and "took a moment" are English, not moves.
    .replace(/\btakes\b(?!\s+(?:away|a\b|an\b|the\s+last|time|its|his|her|their|some|over|place|part))/g, 'captures on')
    .replace(/\bTakes\b(?!\s+(?:away|a\b|an\b|the\s+last|time|its|his|her|their|some|over|place|part))/g, 'Captures on')
    .replace(/\btook\b(?!\s+(?:away|a\b|an\b|the\s+last|time|its|his|her|their|some|over|place|part))/g, 'captured on')
    .replace(/\bTook\b(?!\s+(?:away|a\b|an\b|the\s+last|time|its|his|her|their|some|over|place|part))/g, 'Captured on');
}

/** "Nxe6" becomes "knight captures on e6"; the square stays sayable. */
function sanCaptures(text: string, ctx: RenderContext): string {
  return text
    .replace(/\b([KQRBN])x([a-h][1-8])(?:=[QRBN])?[+#]?/g, (_m, piece: string, sq: string) =>
      `${ctx.lexicon.pieceNames[piece as PieceRef['piece']]} captures on ${sq}`)
    .replace(/\b([a-h])x([a-h][1-8])(?:=[QRBN])?[+#]?/g, (_m, _file: string, sq: string) =>
      `${ctx.lexicon.pieceNames.P} captures on ${sq}`);
}

/** Insert one "uh" at the first clause boundary that does not already carry one. */
function injectUh(text: string): string | null {
  const at = text.search(/(?<!\buh), (?!uh\b|you know\b|of course\b)/);
  if (at >= 0) return `${text.slice(0, at)}, uh,${text.slice(at + 1)}`;
  const firstSpace = text.indexOf(' ');
  if (firstSpace > 0 && !/^uh\b/i.test(text)) {
    return `${text.slice(0, firstSpace)}, uh,${text.slice(firstSpace)}`;
  }
  return null;
}

function shape(slots: Record<Slot, string>, ctx: RenderContext): Record<Slot, string> {
  const out = { ...slots };
  for (const slot of SLOT_ORDER) {
    let text = (out[slot] ?? '').replace(/!/g, '.');
    text = captureVerbs(text);
    // The best move must stay in SAN so the note verifiably names it.
    if (slot !== 'betterWas') text = sanCaptures(text, ctx);
    out[slot] = text;
  }

  const total = SLOT_ORDER.reduce((n, slot) => n + countWords(out[slot]), 0);
  const have = SLOT_ORDER.reduce((n, slot) => n + countUh(out[slot]), 0);
  let deficit = Math.floor(total / FILLER_EVERY) - have;
  const targets: Slot[] = ['whatHappened', 'whyItMatters', 'lesson'];
  let progress = true;
  while (deficit > 0 && progress) {
    progress = false;
    for (const slot of targets) {
      if (deficit <= 0) break;
      const next = injectUh(out[slot]);
      if (next !== null && next !== out[slot]) {
        out[slot] = next;
        deficit -= 1;
        progress = true;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events: the spec's line first, then two more in the same register.

const EVENT_EXTRAS: Record<Trigger, string[]> = {
  reviewStart: [
    'Hello everyone, and welcome to a truly remarkable game.',
    'Hello everyone, and welcome to a game with, uh, quite a story in it.',
  ],
  brilliant: [
    'And here, none other than the move of the game. Exquisite.',
    'I would ask you to pause and find this, but you guys already see it. Incredible.',
  ],
  great: [
    'And here, a very fine move, and of course the position demands it.',
    'A remarkable choice, and, you know, the only one that holds.',
  ],
  blunder: [
    'And here, uh, the position turns, and not for the better.',
    'It was in this position that things, you know, started to go wrong.',
  ],
  mistake: [
    'Not the most precise, but of course a very human choice.',
    'And here, a small slip, and the position, uh, notices.',
  ],
  miss: [
    'While I give you a couple of seconds, there was something exquisite here.',
    'And here, for those of you looking, something remarkable was available.',
  ],
  bookExit: [
    'And here, as usual, theory ends and the players are on their own.',
    'This is where the book closes, and, you know, the real game begins.',
  ],
  comeback: [
    'And here, incredibly, the position is a game once more.',
    'Remarkable. The position was gone, and now, of course, it is not.',
  ],
  collapse: [
    'And it was here that a winning position, uh, slipped away entirely.',
    'The position was won, and here it is not, and there is nothing more to be done.',
  ],
  highAccuracy: [
    'A very fine game, and of course very few slips in it.',
    'An excellent game, you know, from start to finish.',
  ],
  lowAccuracy: [
    'A hard game, and, uh, quite a few lessons in it for everyone.',
    'Not the cleanest game, of course, but a very instructive one.',
  ],
  longGame: [
    'A very long battle, and, you know, both sides earned the rest.',
    'A long, long game, and of course the pieces are as tired as the players.',
  ],
  reviewEnd: [
    'So that is the game. Thank you all, and see you soon.',
    'And that is where it ends. Thank you all, as usual, and have a pleasant day.',
  ],
  random: [
    'As usual, sorry about that.',
    'You know, chess is a remarkable game.',
  ],
};

// ---------------------------------------------------------------------------

function build(): PersonaGrammar {
  const base = neutralGrammar('agad');
  const events: Partial<Record<Trigger, string[]>> = {};
  for (const [trigger, extras] of Object.entries(EVENT_EXTRAS) as [Trigger, string[]][]) {
    events[trigger] = [...(base.events[trigger] ?? []), ...extras];
  }

  return {
    ...base,
    lexicon: {
      ...base.lexicon,
      captureVerb: 'captures on',
      address: 'you guys',
      intensifiers: ['absolutely', 'quite', 'very'],
      praise: ['exquisite', 'incredible', 'remarkable', 'very fine', 'fine'],
      blame: ['not the best', 'an understandable choice', 'a slip'],
      fillers: ['uh', 'you know', 'of course'],
      // His frames already open with "And here"; a connective that repeats it
      // reads as "and here and".
      connectives: ['and', 'and of course'],
    },
    syntax: {
      ...base.syntax,
      maxSentenceWords: 40,
      fragments: true,
      chainWithAnd: true,
      questionRate: 0,
      verdictFirst: false,
      preferHere: true,
      imperativeAdvice: false,
    },
    prosody: {
      ...base.prosody,
      exclamations: 0,
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
      best_line: bestLine,
      sacrifice,
      missed_mate: missedMate,
      mate_allowed: mateAllowed,
      define,
      lesson,
    },
    shape,
  };
}

/** agadmator, The Archivist: scene first, "captures on", chained with "and", never a call to action. */
export const agad: PersonaGrammar = build();

/** Exposed for the voice tests; not part of the public API. */
export const agadInternals = { numberWords, chant, RESIGNATION, FILLER_EVERY, LOST_LEADS };
