import type { Classification, Color, PieceRef, SituationKind } from '@greekgift/engine';
import { formatClock, formatMinutes } from '@greekgift/engine';

import type { Frame, PersonaGrammar, Plan, PropKind, Proposition, RenderContext } from '../contracts.ts';
import { list, num, pawns, pct, pctPoints, stripCheck } from './text.ts';

/**
 * The neutral frames: one per proposition kind, each with at least three
 * variants, filled from named args through the context's referring
 * expressions. They are built per note so they can fall back to the plan's
 * facts when an arg is missing and steer around a persona's banned words.
 *
 * Arg names mirror the motif fields the planner derives them from:
 *
 *   verdict         classification?, san?, lead?
 *   hangs           target, attackers[], defenders[]   (aggregated: targets[])
 *   attacked_by     target, attackers[]
 *   under_defended  target, attackers[], defenders[]
 *   forked / forks  by, targets[]
 *   pinned          pinned, pinner, against, absolute
 *   skewered        front, behind, by
 *   discovered      mover, attacker, target, check
 *   trapped         target, attackers[]
 *   missed_capture  target, value
 *   missed_mate     line[], mateIn?
 *   mate_allowed    line[]
 *   mate_delivered  san?
 *   ignored_threat  kind, by, targets[], line[]
 *   sacrifice       piece, netMaterial, sound
 *   only_move       margin, san?
 *   swing           winBefore?, winAfter?, epLoss?
 *   material_delta  materialGain | delta
 *   best_does       move?, captures?, check?, mateIn?, forks[]?
 *   best_line       line[]?
 *   best_move       move?
 *   left_book/in_book  name?, eco?
 *   back_rank       side
 *   passed_pawn     pawn, stepsToPromote, created
 *   promotion       square, inBestLine
 *   king_exposed    side, score, openFiles[], shieldMissing[], attackersInZone[]
 *   overloaded      defender, duties[]
 *   zugzwang        side
 *   fortress        side, deficit, stablePlies
 *   traded_behind   deficit, captured
 *   quiet_loss      epLoss?, bestMove?
 *   define          term
 *   lesson          concept
 *
 * Every reader is forgiving: a missing piece arg falls back to the first
 * PieceRef in the args, and a missing move or number to the facts.
 */

const isPiece = (v: unknown): v is PieceRef =>
  !!v && typeof v === 'object' && !Array.isArray(v) && 'piece' in v && 'square' in v;

function piece(p: Proposition, ...keys: string[]): PieceRef | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (isPiece(v)) return v;
    if (Array.isArray(v) && isPiece(v[0])) return v[0];
  }
  for (const v of Object.values(p.args)) if (isPiece(v)) return v;
  return undefined;
}

function pieces(p: Proposition, ...keys: string[]): PieceRef[] {
  for (const k of keys) {
    const v = p.args[k];
    if (Array.isArray(v) && v.every(isPiece)) return v as PieceRef[];
    if (isPiece(v)) return [v];
  }
  for (const v of Object.values(p.args)) {
    if (Array.isArray(v) && v.length > 0 && v.every(isPiece)) return v as PieceRef[];
  }
  return [];
}

function str(p: Proposition, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function strs(p: Proposition, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = p.args[k];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
    if (typeof v === 'string') return [v];
  }
  return [];
}

function number(p: Proposition, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function bool(p: Proposition, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

/** The verdict as a noun phrase, steering around a persona's banned words. */
export function verdictPhrase(c: Classification, banned: readonly string[]): string {
  const has = (w: string) => banned.some((b) => b.toLowerCase() === w);
  switch (c) {
    case 'blunder':
      return 'a blunder';
    case 'mistake':
      return 'a mistake';
    case 'inaccuracy':
      return has('inaccuracy') ? 'slightly off' : 'an inaccuracy';
    case 'miss':
      return 'a missed chance';
    case 'good':
      return 'a good move';
    case 'excellent':
      return 'an excellent move';
    case 'best':
      return 'the best move';
    case 'great':
      return 'a great move';
    case 'brilliant':
      return has('brilliant') ? 'a superb move' : 'a brilliant move';
    case 'book':
      return 'a book move';
    default:
      return 'a move';
  }
}

/** The verdict as one capitalised word, for verdict-first openers. */
export function verdictWord(c: Classification, banned: readonly string[]): string {
  const has = (w: string) => banned.some((b) => b.toLowerCase() === w);
  switch (c) {
    case 'blunder':
      return 'Blunder';
    case 'mistake':
      return 'Mistake';
    case 'inaccuracy':
      return has('inaccuracy') ? 'Slightly off' : 'Inaccuracy';
    case 'miss':
      return 'Missed chance';
    case 'good':
      return 'Good';
    case 'excellent':
      return 'Excellent';
    case 'best':
      return 'Best';
    case 'great':
      return 'Great';
    case 'brilliant':
      return has('brilliant') ? 'Superb' : 'Brilliant';
    case 'book':
      return 'Book';
    default:
      return 'Played';
  }
}

/** Lead-flavoured headlines, all well under 60 characters. */
const LEAD_HEADLINES: Record<SituationKind, string[]> = {
  allowed_mate: ['Walked into a forced mate.', 'The king could not be saved after this.', 'Mate was unstoppable after this.'],
  missed_mate: ['A forced mate went begging.', 'Checkmate was on the board.', 'The mate was there.'],
  hung_piece: ['A piece left hanging.', 'Dropped a piece for nothing.', 'The piece was simply lost.'],
  under_defended: ['One defender short.', 'Attacked more than defended.', 'Not enough defenders.'],
  walked_into_fork: ['One square, two pieces.', 'Straight into a fork.', 'Dropped a piece to a fork.'],
  walked_into_pin: ['Walked into a pin.', 'Pinned, and it cost.', 'The pin decided it.'],
  walked_into_skewer: ['Walked into a skewer.', 'Two pieces on one line.', 'The skewer won material.'],
  missed_capture: ['A free piece, missed.', 'There was something to take.', 'The capture was there.'],
  ignored_threat: ['The threat was not answered.', 'Their idea went through.', 'The wrong problem got solved.'],
  created_fork: ['A fork, and it won.', 'Two pieces hit at once.', 'A fork landed.'],
  created_discovered: ['A discovered attack.', 'The piece moved, the attack opened.', 'Uncovered a strong attack.'],
  trapped_piece: ['A piece with nowhere to go.', 'The piece was trapped.', 'No squares left.'],
  traded_behind: ['A trade while behind.', 'The wrong time to trade.', 'Traded into a lost endgame.'],
  unsound_sacrifice: ['A sacrifice that did not work.', 'Too much given away.', 'The sacrifice fell short.'],
  sound_sacrifice: ['A sacrifice that worked.', 'Material given, position won.', 'A sound sacrifice.'],
  only_move: ['The only move, found.', 'One move held, and this was it.', 'Precisely the only move.'],
  left_book: ['Out of the book.', 'Theory ended here.', 'On your own from here.'],
  book: ['Still in the book.', 'A known position.', 'Theory so far.'],
  best: ['The best move.', 'Exactly right.', 'Nothing better here.'],
  good: ['A good move.', 'Solid and sensible.', 'A reasonable choice.'],
  quiet_loss: ['A quiet slip.', 'A small step backwards.', 'Nothing hung, but it got worse.'],
  back_rank: ['A back-rank weakness.', 'The back rank was open.', 'No escape square.'],
  passed_pawn: ['A passed pawn.', 'The pawn was on its way.', 'A runner on the board.'],
  promotion: ['A new queen.', 'The pawn promoted.', 'Promotion decided it.'],
  king_exposed: ['The king was exposed.', 'No shelter for the king.', 'An open king.'],
  overloaded: ['One piece, two jobs.', 'An overloaded defender.', 'The defender could not do both.'],
  zugzwang: ['Every move made it worse.', 'No good move left.', 'Forced to move, and it hurt.'],
  fortress: ['A fortress held.', 'Material down, position safe.', 'Nothing got through.'],
  mate_delivered: ['Checkmate.', 'The game ended with mate.', 'Mate delivered.'],
};

const LEADS = new Set<string>(Object.keys(LEAD_HEADLINES));

/** The lesson concept the planner keys by lead kind; used when a plan has none. */
export function conceptFor(lead: SituationKind): string {
  switch (lead) {
    case 'hung_piece':
    case 'under_defended':
      return 'count_attackers';
    case 'walked_into_fork':
    case 'walked_into_pin':
    case 'walked_into_skewer':
    case 'trapped_piece':
      return 'check_landing_square';
    case 'missed_capture':
      return 'look_for_captures';
    case 'missed_mate':
    case 'allowed_mate':
    case 'mate_delivered':
      return 'checks_first';
    case 'back_rank':
      return 'defend_back_rank';
    case 'ignored_threat':
      return 'see_their_threat';
    case 'traded_behind':
      return 'dont_trade_behind';
    case 'passed_pawn':
    case 'promotion':
      return 'push_the_passer';
    case 'king_exposed':
      return 'keep_the_shield';
    case 'overloaded':
      return 'one_defender_two_jobs';
    case 'quiet_loss':
    case 'unsound_sacrifice':
    case 'good':
      return 'keep_the_tension';
    case 'left_book':
    case 'book':
      return 'book_ends_here';
    default:
      return 'remember_this';
  }
}

interface Lesson {
  imperative: string[];
  declarative: string[];
  question: string;
}

const LESSONS: Record<string, Lesson> = {
  check_landing_square: {
    imperative: [
      'Before you place a piece, ask which square your opponent would most like to reach and what it attacks from there.',
      'Check the square a piece lands on: who can attack it, and what else do they hit from there?',
      'Check the landing square first.',
    ],
    declarative: [
      'The square a piece lands on matters as much as the piece itself.',
      'Every landing square deserves one look at the replies it invites.',
    ],
    question: 'Before a piece lands, what will the other side hit from the squares nearby?',
  },
  count_attackers: {
    imperative: [
      'Count attackers and defenders before you leave a piece where it stands.',
      'Before every move, check which of your pieces are undefended.',
      'Count the attackers first.',
    ],
    declarative: [
      'A piece with more attackers than defenders is a piece about to be lost.',
      'Undefended pieces are how most games are decided.',
    ],
    question: 'How many pieces attack it, and how many defend it?',
  },
  look_for_captures: {
    imperative: [
      'Look at every capture first, even the ones that look wrong.',
      'Check checks, captures and threats, in that order, before anything quiet.',
      'Look at every capture first.',
    ],
    declarative: [
      'The forcing moves are always worth a look before the quiet ones.',
      'A free piece is easy to miss when you are following a plan.',
    ],
    question: 'What can you take, and what happens if you do?',
  },
  checks_first: {
    imperative: [
      'Look at every check before anything else; forced moves are the easiest to calculate.',
      'When the king is in reach, count the checks first.',
      'Count the checks first.',
    ],
    declarative: [
      'Checks come first because the reply is forced.',
      'Mating patterns are worth learning by heart.',
    ],
    question: 'What are all the checks, and where does the king go after each one?',
  },
  defend_back_rank: {
    imperative: [
      'Give your king an escape square before the back rank becomes a problem.',
      'Keep an eye on the back rank whenever the heavy pieces are still on.',
      'Give the king an escape square.',
    ],
    declarative: [
      'A back rank with no escape square is a mate waiting to happen.',
      'One pawn move, and the back rank stops being a weakness.',
    ],
    question: 'Where does your king go if a rook lands on the back rank?',
  },
  see_their_threat: {
    imperative: [
      "Before you make your own plan, ask what your opponent's last move threatens.",
      'Deal with the threat first; your own idea can wait one move.',
      'Answer their threat first.',
    ],
    declarative: [
      'Every move by the opponent is a question, and it has to be answered before you ask your own.',
      'The threat you ignore is the one that decides the game.',
    ],
    question: "What did your opponent's last move want to do?",
  },
  dont_trade_behind: {
    imperative: [
      'When you are behind in material, keep pieces on and look for complications.',
      'Avoid trades when you are down; the side ahead wants them.',
      'Keep pieces on when behind.',
    ],
    declarative: [
      'Trades favour the side with more material.',
      'Being behind means the endgame is the enemy.',
    ],
    question: 'Who benefits when pieces come off the board here?',
  },
  push_the_passer: {
    imperative: [
      'Push the passed pawn; every step forward ties the opponent down.',
      'Support the passer with pieces from behind.',
      'Push the passed pawn.',
    ],
    declarative: [
      'A passed pawn must be pushed.',
      'The further the passer goes, the more the opponent has to give.',
    ],
    question: 'What is stopping that pawn from running?',
  },
  keep_the_shield: {
    imperative: [
      'Keep the pawns in front of your king where they are unless there is a concrete reason.',
      'Before moving a pawn near your king, ask what it uncovers.',
      "Keep the king's pawns at home.",
    ],
    declarative: [
      'The pawns in front of the king are its shelter, and they do not come back.',
      'An open king costs more than a tempo.',
    ],
    question: 'What does that pawn protect, and what happens once it has moved?',
  },
  one_defender_two_jobs: {
    imperative: [
      'When one piece defends two things, ask what happens if it is forced to choose.',
      'Look for the piece with two jobs; that is where a tactic hides.',
      'Find the piece with two jobs.',
    ],
    declarative: [
      'A piece can defend two things only until it is made to choose.',
      'Overloaded defenders are the source of many combinations.',
    ],
    question: 'Which piece is doing two jobs here?',
  },
  keep_the_tension: {
    imperative: [
      'Keep the tension when nothing forces you to resolve it.',
      'Improve your worst piece before committing to anything.',
      'Keep the tension.',
    ],
    declarative: [
      'Quiet positions are lost slowly, one small concession at a time.',
      'Patience is a skill, and it is trained one move at a time.',
    ],
    question: 'Was there anything that forced the decision here?',
  },
  watch_pins: {
    imperative: [
      'Next time, before you move a piece onto a line with your king or queen, check what can pin it there.',
      'Next time, look along every line from your king and queen before you put a piece on it.',
      'Check the lines to your king before you move.',
    ],
    declarative: [
      'A piece standing in front of its own king or queen is one move away from being pinned.',
      'Pins come from lines you did not look along.',
    ],
    question: 'Next time, which enemy bishop, rook or queen could line up on the piece you just moved?',
  },
  watch_forks: {
    imperative: [
      'Next time, before you move, check every square an enemy knight or queen can reach that hits two of your pieces.',
      'Next time, look for the knight jump or queen move that attacks two things at once.',
      'Check the fork squares first.',
    ],
    declarative: [
      'Two loose pieces a knight or queen can reach together are a fork waiting to happen.',
      'Forks land on squares nobody checked.',
    ],
    question: 'Next time, which square lets their knight or queen hit two of your pieces at once?',
  },
  watch_skewers: {
    imperative: [
      'Next time, keep your king and queen off the same line as a piece behind them.',
      'Next time, before you move, check the lines your most valuable pieces stand on.',
      'Keep the big pieces off one line.',
    ],
    declarative: [
      'A valuable piece with another behind it on one line is a skewer waiting for a bishop, rook or queen.',
      'Skewers punish pieces lined up behind each other.',
    ],
    question: 'Next time, what stands behind your king or queen on the line they are on?',
  },
  watch_discoveries: {
    imperative: [
      'Next time, watch the enemy pieces standing in front of their bishops, rooks and queen: when they move, the line opens.',
      'Next time, ask what line opens when their front piece steps aside.',
      'Watch the piece in front of the line.',
    ],
    declarative: [
      'A discovered attack comes from the piece that does not move.',
      'Every piece in front of a line piece is a discovered attack in waiting.',
    ],
    question: 'Next time, which of their pieces is hiding a bishop, rook or queen behind it?',
  },
  watch_mate: {
    imperative: [
      'Next time, before every move, check every check your opponent has against your king.',
      'Next time, count the checks against your own king first.',
      'Check their checks first.',
    ],
    declarative: [
      'Mating attacks start with checks you did not count.',
      'The king needs a free square and a defender, every move.',
    ],
    question: 'Next time, what are all the checks they have, and where does your king go after each one?',
  },
  watch_captures: {
    imperative: [
      'Next time, before you let go of a piece, count what attacks it and what defends it.',
      'Next time, check every capture your opponent has after your move.',
      'Count attackers and defenders first.',
    ],
    declarative: [
      'A piece with more attackers than defenders will be taken.',
      'Their captures come first; check them before your plan.',
    ],
    question: 'Next time, after your move, what can they take, and is it defended?',
  },
  punish_it: {
    imperative: [
      'When your opponent slips, look for the move that makes it cost them.',
      'After their mistake, look at every check and capture before anything quiet.',
      'Make their slip cost them.',
    ],
    declarative: [
      'A mistake only costs what the other side makes it cost.',
      "An opponent's slip is a chance, and a chance needs a forcing move to cash it.",
      'The move after their mistake is the one that decides whether it mattered.',
    ],
    question: 'What does their last move leave open, and how do you make it cost them?',
  },
  book_ends_here: {
    imperative: [
      'Learn one move past where your knowledge ends, and the lines will start to make sense.',
      'When the book ends, slow down and find the plan behind the moves.',
      'Learn one move further.',
    ],
    declarative: [
      'Opening theory is only a set of plans someone else has already found.',
      'The moves after the book are the ones that matter.',
    ],
    question: 'What is the plan behind the last few book moves?',
  },
  remember_this: {
    imperative: [
      'Remember this pattern; it will come up again.',
      'Keep this position in mind for the next game.',
      'Remember this shape.',
    ],
    declarative: [
      'This is a pattern worth learning properly.',
      'Patterns like this repeat across thousands of games.',
    ],
    question: 'Will you recognise this shape the next time it appears?',
  },
};

const GENERIC_LESSON: Lesson = {
  imperative: [
    'Take one idea from this move into the next game.',
    'Slow down at moments like this one; they decide games.',
    'Look one move further next time.',
  ],
  declarative: [
    'Moments like this are where games are decided.',
    'One extra look at the position would have changed the move.',
  ],
  question: 'What would one more look at the position have shown?',
};

const DEFINITIONS: Record<string, string[]> = {
  fork: [
    'A fork is one piece attacking two things at once, so only one can be saved.',
    'When one move attacks two pieces at the same time, that is a fork.',
    'A fork: one attacker, two targets, and only one reply.',
  ],
  pin: [
    'A pin is when a piece cannot move because something more valuable stands behind it.',
    'A piece stuck in front of a more valuable one on the same line is in a pin.',
    'A pin freezes a piece in place, because moving it exposes what is behind.',
  ],
  skewer: [
    'A skewer is a pin in reverse: the valuable piece is in front, and when it moves the piece behind it falls.',
    'When the more valuable piece stands in front and has to move, exposing the one behind, that is a skewer.',
    'A skewer attacks through one piece to the piece behind it.',
  ],
  'discovered attack': [
    'A discovered attack is when moving one piece opens a line for another piece to attack.',
    'When a piece steps aside and uncovers an attack from the piece behind it, that is a discovered attack.',
    'A discovered attack: one piece moves, and a different piece does the attacking.',
  ],
  zugzwang: [
    'Zugzwang means having to move when every move makes things worse.',
    'When the only problem is that you must move, and every move hurts, that is zugzwang.',
    'Zugzwang is a position where passing would be best, but passing is not allowed.',
  ],
  fortress: [
    'A fortress is a position that holds despite being down material, because nothing can break through.',
    'When the side with less material has a setup that cannot be broken, that is a fortress.',
    'A fortress: fewer pieces, but a wall the extra material cannot get past.',
  ],
  'back rank': [
    'The back rank is the row your king starts on; when the pawns in front have not moved, a rook or queen arriving there can be mate.',
    'A back-rank weakness means the king has no escape square from a check along its first rank.',
    'The back rank is where the king lives, and without an escape square a single check there can end the game.',
  ],
  'passed pawn': [
    'A passed pawn has no enemy pawns in front of it or beside it to stop it promoting.',
    'When nothing but pieces can stop a pawn reaching the last rank, it is a passed pawn.',
    'A passed pawn is one with a clear road to promotion.',
  ],
  overloaded: [
    'An overloaded piece is defending two things at once and cannot keep doing both.',
    'When one defender has two jobs, it is overloaded: force it to do one and the other fails.',
    'Overloaded means one piece, two duties, and a tactic waiting for it.',
  ],
};

const GENERIC_DEFINITION = [
  'This is a named pattern, and it is worth knowing the name.',
  'The idea has a name, and the name makes it easier to spot next time.',
  'Learn this pattern by name; it repeats.',
];

/** Second person, and on the opponent's move the mover's "they": what a fixed line may not say off the mover's side. */
const SECOND_PERSON = /\b(?:you|your|yours|yourself|you['’](?:re|ve|ll|d))\b/i;
const THIRD_PERSON = /\b(?:they|them|their|theirs)\b/i;

const colorName = (c: string | undefined): string => (c === 'b' ? 'Black' : 'White');

export function neutralFrames(plan: Plan, grammar: PersonaGrammar): Record<PropKind, Frame> {
  const facts = plan.facts;
  const banned = grammar.banned;
  const isBanned = (w: string) => banned.some((b) => b.toLowerCase() === w);
  const played = () => facts.san;
  const R = (ctx: RenderContext, pc: PieceRef | undefined): string =>
    pc ? ctx.refer(pc) : 'a piece';
  const voice = plan.voice ?? 'self';
  const self = voice === 'self';
  const viewer = plan.viewer === undefined ? facts.color : plan.viewer;
  const moverName = colorName(facts.color);
  const otherName = colorName(facts.color === 'w' ? 'b' : 'w');
  /**
   * Fixed lines written for the reader who moved. Off the mover's side, the
   * ones that say "you" (or, on the opponent's move, "their" for the mover's
   * opponent) are set aside; every list keeps at least one that is not.
   */
  const voiced = (lines: string[]): string[] => {
    if (self) return lines;
    const ok = lines.filter(
      (l) => !SECOND_PERSON.test(l) && (voice === 'neutral' || !THIRD_PERSON.test(l)),
    );
    return ok.length > 0 ? ok : lines;
  };
  /** A side's pieces, from the reader's seat: "your" / "their", or "White's" / "Black's". */
  const owner = (color: string | undefined) =>
    viewer === null ? `${colorName(color)}'s` : color === viewer ? 'your' : 'their';
  const Owner = (color: string | undefined) => {
    const o = owner(color);
    return `${o.charAt(0).toUpperCase()}${o.slice(1)}`;
  };
  /** The capture verb in the past ("took") or as a might-have-been ("would have taken"). */
  const captureWith = (
    ctx: RenderContext,
    target: PieceRef | undefined,
    mode: 'past' | 'would' = 'past',
  ): string => {
    const verb = ctx.lexicon.captureVerb || 'takes';
    const PAST: Record<string, [string, string]> = {
      takes: ['took', 'would have taken'],
      'captures on': ['captured on', 'would have captured on'],
      wins: ['won', 'would have won'],
    };
    const [past, would] = PAST[verb] ?? ['took', 'would have taken'];
    const v = mode === 'past' ? past : would;
    if (!target) return /won$/.test(v) ? `${v} material` : `${v} a piece`;
    if (/\bon$/.test(v)) return `${v} ${ctx.square(target.square)}`;
    return `${v} ${ctx.refer(target)}`;
  };
  const you = (ctx: RenderContext) => ctx.mover();

  const verdict: Frame = (p, ctx) => {
    const c = (str(p, 'classification') as Classification | undefined) ?? plan.classification;
    const san = str(p, 'san', 'move') ?? played();
    const leadArg = str(p, 'lead', 'kind');
    const lead = (leadArg && LEADS.has(leadArg) ? leadArg : plan.lead) as SituationKind;
    const phrase = verdictPhrase(c, banned);
    const word = verdictWord(c, banned);
    const mv = ctx.move(san);
    const leadLines = voiced(LEAD_HEADLINES[lead] ?? LEAD_HEADLINES.good);

    if (p.role === 'observation' || p.slot !== 'headline') {
      return [
        `${mv} was ${phrase} here.`,
        `${mv} was ${phrase}.`,
        `The engine agreed: ${mv} was ${phrase}.`,
        ...(ctx.syntax.fragments ? [`${word}: ${mv}.`] : []),
      ];
    }
    if (ctx.syntax.verdictFirst) {
      return [`${word}: ${mv}.`, ...leadLines.map((l) => `${word}. ${l}`)];
    }
    return [...leadLines, `${mv} was ${phrase}.`, `${word}: ${mv}.`];
  };

  const hangs: Frame = (p, ctx) => {
    const targets = pieces(p, 'targets');
    const target = piece(p, 'target', 'piece') ?? targets[0];
    const attackers = pieces(p, 'attackers', 'attacker', 'by');
    const defenders = pieces(p, 'defenders');
    const a = attackers[0];
    if (targets.length >= 2) {
      const [t1, t2] = targets;
      return [
        `${R(ctx, a)} attacked both ${R(ctx, t1)} and ${R(ctx, t2)}, and neither was defended.`,
        `Both ${R(ctx, t1)} and ${R(ctx, t2)} were left hanging to ${R(ctx, a)}.`,
        `${R(ctx, a)} could take either ${R(ctx, t1)} or ${R(ctx, t2)} for free.`,
      ];
    }
    const t = R(ctx, target);
    if (!a) {
      return [
        `${t} was left hanging: nothing defended it.`,
        `${t} was undefended and could simply be taken.`,
        `${t} was left hanging.`,
      ];
    }
    const undefended = defenders.length === 0;
    return [
      `${t} was left hanging: ${R(ctx, a)} attacked it and ${undefended ? 'nothing defended it' : 'the defence was not enough'}.`,
      `${t} was left hanging to ${R(ctx, a)}.`,
      `${R(ctx, a)} could simply take ${t}.`,
      `${t} was there for ${R(ctx, a)} to take.`,
      ...(ctx.syntax.fragments ? [`${t}, left hanging.`] : []),
    ];
  };

  const attackedBy: Frame = (p, ctx) => {
    const target = piece(p, 'target', 'piece');
    const a = pieces(p, 'attackers', 'attacker', 'by')[0];
    const t = R(ctx, target);
    return [
      `${t} was attacked by ${R(ctx, a)}.`,
      `${R(ctx, a)} was hitting ${t}.`,
      `${R(ctx, a)} attacked ${t}.`,
    ];
  };

  const underDefended: Frame = (p, ctx) => {
    const target = piece(p, 'target', 'piece');
    const attackers = pieces(p, 'attackers');
    const defenders = pieces(p, 'defenders');
    const t = R(ctx, target);
    const a = attackers[0];
    return [
      `${t} was attacked ${num(Math.max(attackers.length, 1))} ${attackers.length === 1 ? 'time' : 'times'} and defended only ${num(defenders.length)}.`,
      `${t} had more attackers than defenders.`,
      a
        ? `${R(ctx, a)} added one attacker too many against ${t}.`
        : `There was one more attacker on ${t} than there were defenders.`,
    ];
  };

  const forkFrame =
    (mine: boolean): Frame =>
    (p, ctx) => {
      const by = piece(p, 'by', 'attacker', 'piece');
      const targets = pieces(p, 'targets');
      const [t1, t2] = targets;
      const b = R(ctx, by);
      const ts = t2 ? `${R(ctx, t1)} and ${R(ctx, t2)}` : `${R(ctx, t1)} and more`;
      const sqs =
        t1 && t2 ? `${ctx.square(t1.square)} and ${ctx.square(t2.square)}` : t1 ? ctx.square(t1.square) : 'two pieces';
      if (mine) {
        return [
          `${b} forked ${ts}.`,
          `${b} attacked ${ts} at the same time, and only one could move away.`,
          `With ${ctx.move(played())}, ${b} hit ${ts} at once.`,
          `${b} forked ${sqs}.`,
        ];
      }
      return [
        `${b} attacked ${ts} at the same time, so only one of the two could be saved.`,
        `${b} forked ${ts}.`,
        `${b} hit ${ts} at once.`,
        `${b} forked ${sqs}.`,
        ...(ctx.syntax.fragments ? [`A fork: ${b} against ${ts}.`] : []),
      ];
    };

  const pinned: Frame = (p, ctx) => {
    const pn = piece(p, 'pinned', 'target');
    const pr = piece(p, 'pinner', 'by');
    const ag = piece(p, 'against');
    const absolute = bool(p, 'absolute') ?? false;
    return [
      `${R(ctx, pn)} was pinned to ${R(ctx, ag)} by ${R(ctx, pr)}${absolute ? ', and it could not legally move' : ''}.`,
      `${R(ctx, pr)} pinned ${R(ctx, pn)} against ${R(ctx, ag)}.`,
      `${R(ctx, pn)} could not move without exposing ${R(ctx, ag)} to ${R(ctx, pr)}.`,
      `${R(ctx, pr)} pinned ${R(ctx, pn)}.`,
    ];
  };

  const skewered: Frame = (p, ctx) => {
    const f = piece(p, 'front', 'target');
    const h = piece(p, 'behind');
    const b = piece(p, 'by', 'attacker');
    return [
      `${R(ctx, b)} skewered ${R(ctx, f)}: once it moved, ${R(ctx, h)} fell.`,
      `${R(ctx, f)} had to move out of the line of ${R(ctx, b)}, and ${R(ctx, h)} stood behind it.`,
      `${R(ctx, b)} lined up ${R(ctx, f)} and ${R(ctx, h)} on one line.`,
      `${R(ctx, f)} was skewered by ${R(ctx, b)}.`,
    ];
  };

  const discovered: Frame = (p, ctx) => {
    const m = piece(p, 'mover');
    const a = piece(p, 'attacker', 'by');
    const t = piece(p, 'target');
    const check = bool(p, 'check') ?? false;
    const tail = check ? ', with check' : '';
    return [
      `Moving ${R(ctx, m)} uncovered an attack from ${R(ctx, a)} on ${R(ctx, t)}${tail}.`,
      `${R(ctx, m)} stepped aside and ${R(ctx, a)} hit ${R(ctx, t)}${tail}.`,
      `A discovered ${check ? 'check' : 'attack'}: ${R(ctx, a)} hit ${R(ctx, t)} through the square ${R(ctx, m)} left.`,
      `${R(ctx, a)} hit ${R(ctx, t)}${tail}.`,
    ];
  };

  const trapped: Frame = (p, ctx) => {
    const t = piece(p, 'target', 'piece');
    const a = pieces(p, 'attackers')[0];
    return [
      `${R(ctx, t)} had no safe square left.`,
      `${R(ctx, t)} was trapped: every escape square was covered.`,
      a
        ? `${R(ctx, a)} took away the last square from ${R(ctx, t)}, and it was lost.`
        : `${R(ctx, t)} was trapped and would be lost.`,
    ];
  };

  const missedCapture: Frame = (p, ctx) => {
    const t = piece(p, 'target', 'piece');
    const v = number(p, 'value');
    const worth = v && v >= 1 ? ` worth ${pawns(v)}` : '';
    return [
      `${R(ctx, t)} could have been taken for free.`,
      `${R(ctx, t)}${worth} was there for the taking.`,
      `${you(ctx)} could have won ${R(ctx, t)}.`,
    ];
  };

  const lineOf = (p: Proposition, fallback: string[]) => {
    const line = strs(p, 'line', 'moves');
    return line.length > 0 ? line : fallback;
  };

  const missedMate: Frame = (p, ctx) => {
    const line = lineOf(p, facts.bestLine);
    const first = line[0] ?? facts.bestMove;
    const mateIn = number(p, 'mateIn') ?? facts.bestMoveEffect.mateIn;
    const inN = mateIn ? `Mate in ${num(mateIn)}` : 'A forced mate';
    return [
      `There was a forced mate here, starting with ${ctx.move(first)}.`,
      `${inN} was on the board, beginning with ${ctx.move(first)}.`,
      `${ctx.move(first)} would have led to checkmate.`,
    ];
  };

  const mateAllowed: Frame = (p, ctx) => {
    const line = lineOf(p, facts.playedLine);
    const first = line[0];
    if (!first) {
      return [
        'This allowed a forced mate.',
        'After this the king could not be saved.',
        'From here the position was lost to a forced mate.',
      ];
    }
    return [
      `This allowed a forced mate, starting with ${ctx.move(first)}.`,
      `After ${ctx.move(first)} the king could not be saved.`,
      `The reply ${ctx.move(first)} led to checkmate.`,
    ];
  };

  const mateDelivered: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'san', 'move') ?? played());
    return [`${mv} was checkmate.`, `Checkmate, with ${mv}.`, `${mv} ended the game.`];
  };

  const ignoredThreat: Frame = (p, ctx) => {
    const kind = str(p, 'kind', 'threat') ?? 'capture';
    const by = piece(p, 'by', 'attacker');
    const targets = pieces(p, 'targets', 'target');
    const t = targets[0];
    const verb =
      kind === 'fork'
        ? 'forking'
        : kind === 'check'
          ? 'checking'
          : kind === 'mate'
            ? 'mating'
            : kind === 'promotion'
              ? 'promoting past'
              : 'taking';
    const threat =
      kind === 'mate' && !t
        ? `${R(ctx, by)} delivering mate`
        : `${R(ctx, by)} ${verb} ${t ? R(ctx, t) : 'a piece'}`;
    const mv = ctx.move(played());
    return [
      `The threat was ${threat}, and ${mv} did nothing about it.`,
      `${threat.charAt(0).toUpperCase()}${threat.slice(1)} was coming, and that had to be dealt with first.`,
      `${self ? 'Their' : voice === 'opponent' ? 'Your' : `${otherName}'s`} threat, ${threat}, was still there after ${mv}.`,
      `The threat of ${threat} still stood.`,
    ];
  };

  const sacrifice: Frame = (p, ctx) => {
    const pc = piece(p, 'piece', 'target');
    const sound = bool(p, 'sound') ?? plan.lead === 'sound_sacrifice';
    if (sound) {
      return [
        `${R(ctx, pc)} was given up on purpose, and the position justified it.`,
        `Giving up ${R(ctx, pc)} worked here.`,
        `${R(ctx, pc)} went, and what came back was worth more.`,
      ];
    }
    return [
      `${R(ctx, pc)} was given up, but there was not enough for it.`,
      `The sacrifice of ${R(ctx, pc)} did not work.`,
      `Giving up ${R(ctx, pc)} cost more than it brought.`,
    ];
  };

  const onlyMove: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'san', 'move') ?? played());
    return [
      `${mv} was the only move that held.`,
      `Everything else lost; ${mv} was the one move that kept the position.`,
      `This was the only move, and ${you(ctx)} found it.`,
    ];
  };

  const swing: Frame = (p, ctx) => {
    const before = number(p, 'winBefore', 'before') ?? facts.winBefore;
    const after = number(p, 'winAfter', 'after') ?? facts.winAfter;
    const b = pct(before);
    const a = pct(after);
    const delta = (after <= 1 ? after * 100 : after) - (before <= 1 ? before * 100 : before);
    if (voice === 'opponent') {
      // The reader's chances, not the mover's: 100 − w, said as a chance
      // when the opponent erred.
      const mb = pctPoints(ctx.memberWin(before));
      const ma = pctPoints(ctx.memberWin(after));
      if (Math.abs(delta) < 2 || bool(p, 'held')) {
        return [
          `Your chances stayed about where they were, at ${ma}.`,
          `Nothing changed for you: still ${ma}.`,
          `Your chances held at ${ma}.`,
        ];
      }
      const epLoss = number(p, 'epLoss') ?? facts.epLoss;
      if (epLoss >= 0.05) {
        return [
          `That handed you a chance: your winning chances went from ${mb} to ${ma}.`,
          `A chance for you: your winning chances went from ${mb} to ${ma}.`,
          `That opened a door for you, from ${mb} to ${ma}.`,
        ];
      }
      return [
        `Your chances went from ${mb} to ${ma}.`,
        `For you, that was ${mb} before and ${ma} after.`,
        `Your winning chances moved from ${mb} to ${ma}.`,
      ];
    }
    if (voice === 'neutral') {
      const nb = pctPoints(before);
      const na = pctPoints(after);
      if (Math.abs(delta) < 2 || bool(p, 'held')) {
        return [
          `${moverName}'s chances held at ${na}.`,
          `Nothing changed in the assessment: ${moverName} was still at ${na}.`,
          `${moverName}'s chances stayed about the same, around ${na.replace('about ', '')}.`,
        ];
      }
      return [
        `${moverName}'s winning chances went from ${nb} to ${na}.`,
        `That took ${moverName} from ${nb} to ${na}.`,
        `${moverName}'s chances ${delta > 0 ? 'rose' : 'went'} from ${nb} to ${na}.`,
      ];
    }
    if (Math.abs(delta) < 2 || bool(p, 'held')) {
      return [
        `Your chances stayed about the same, around ${a.replace('about ', '')}.`,
        `The chances held at ${a}.`,
        `Nothing changed in the assessment: still ${a}.`,
        `What did it cost? Nothing; the chances stayed at ${a}.`,
      ];
    }
    if (delta > 0) {
      return [
        `Your winning chances went up from ${b} to ${a}.`,
        `That took ${you(ctx)} from ${b} to ${a}.`,
        `The chances rose from ${b} to ${a}.`,
        `Where did the chances go? Up, from ${b} to ${a}.`,
      ];
    }
    return [
      `Your winning chances went from ${b} to ${a}.`,
      `That took ${you(ctx)} from ${b} to ${a}.`,
      `One move, and the chances dropped from ${b} to ${a}.`,
      `Your chances fell from ${b} to ${a}.`,
      `Where did the chances go? From ${b} down to ${a}.`,
    ];
  };

  const materialDelta: Frame = (p, ctx) => {
    const gain =
      number(p, 'materialGain', 'delta', 'material') ?? facts.bestMoveEffect.materialGain;
    const m = pawns(gain);
    if (!self && gain > 0) {
      // Off the mover's side, "gone" would read as the reader's material.
      const them = voice === 'opponent' ? 'them' : moverName;
      if (bool(p, 'missed')) {
        return [
          `${you(ctx)} could have come out ${m} ahead.`,
          `The better line would have won ${m} for ${them}.`,
          `The better line was worth ${m} of material to ${them}.`,
        ];
      }
      return [
        `${you(ctx)} gave up ${m} more than the best line did.`,
        `The best line would have kept ${m} more for ${them}.`,
        `That cost ${them} about ${m} of material.`,
      ];
    }
    if (bool(p, 'missed') && gain > 0) {
      return [
        `The better line would have won ${m}.`,
        `The better line was worth ${m} of material.`,
        `${you(ctx)} could have come out ${m} ahead.`,
        `What was on offer? About ${m} of material.`,
      ];
    }
    if (gain >= 0) {
      return [
        `The best line would have come out ${m} better in material.`,
        `That was ${m} of material, gone.`,
        self
          ? `${you(ctx)} ended up ${m} worse off in material than ${you(ctx)} needed to be.`
          : `${you(ctx)} gave up ${m} more than the best line did.`,
        `How much did it cost? About ${m} of material.`,
        ...(ctx.syntax.fragments ? [`${m} of material, gone.`] : []),
      ];
    }
    return [
      `The move came out ${m} ahead in material.`,
      `That was ${m} of material won.`,
      `${you(ctx)} came out ${m} better in material.`,
      `How much did it win? About ${m} of material.`,
    ];
  };

  const bestDoes: Frame = (p, ctx) => {
    const san = str(p, 'move', 'san', 'bestMove') ?? facts.bestMove;
    const mv = ctx.move(san);
    // The best move's effect belongs to the best move only; a different
    // played move gets nothing from it but what its own SAN says.
    const effect =
      stripCheck(san) === stripCheck(facts.bestMove)
        ? facts.bestMoveEffect
        : { check: /\+$/.test(san), line: [], materialGain: 0 };
    const captures = isPiece(p.args.captures)
      ? p.args.captures
      : p.args.captures === undefined
        ? effect.captures
        : undefined;
    const check = bool(p, 'check') ?? effect.check;
    const mateIn = number(p, 'mateIn') ?? effect.mateIn;
    const forks = pieces(p, 'forks');
    const forkTargets = forks.length > 0 ? forks : (effect.forks ?? []);
    const played = bool(p, 'played') ?? false;
    // What the played move did, in the past; what the best move would have done.
    const clauses: string[] = [];
    if (mateIn) {
      clauses.push(
        played
          ? mateIn === 1 ? 'was checkmate' : `was mate in ${num(mateIn)}`
          : mateIn === 1 ? 'would have been checkmate' : `would have been mate in ${num(mateIn)}`,
      );
    }
    if (captures) clauses.push(captureWith(ctx, captures, played ? 'past' : 'would'));
    if (forkTargets.length >= 2) {
      clauses.push(`${played ? 'forked' : 'would have forked'} ${list(forkTargets.map((t) => ctx.refer(t)))}`);
    }
    if (check && !mateIn) clauses.push(played ? 'gave check' : 'would have given check');
    if (clauses.length === 0) {
      return played
        ? [
            `${mv} was the best move here.`,
            `${mv} did everything the position asked for.`,
            `${mv} kept everything defended.`,
          ]
        : [
            `${mv} would have kept everything defended.`,
            `${mv} would have held the position together.`,
            `Instead, ${mv} would have kept the balance.`,
          ];
    }
    const does = list(clauses);
    if (played) {
      return [
        `${mv} ${does}.`,
        `${mv} ${does}, which was exactly the point.`,
        `The move ${does}, and that decided it.`,
      ];
    }
    return [
      `${mv} ${does}.`,
      `Instead, ${mv} ${does}.`,
      `${mv} was better: it ${does}.`,
      `${mv} ${does}, which is why it was the move.`,
    ];
  };

  const bestLine: Frame = (p, ctx) => {
    const line = lineOf(p, facts.bestLine).slice(0, 5);
    if (line.length === 0) {
      const mv = ctx.move(facts.bestMove);
      return [`The line started with ${mv}.`, `It began with ${mv}.`, `${mv}, and the rest followed.`];
    }
    const moves = line.map((m) => ctx.move(m));
    return [
      `The line ran ${moves.join(' ')}.`,
      `After ${moves.join(' ')} the position would have held together.`,
      `Follow it through: ${moves.join(', ')}.`,
    ];
  };

  const bestMove: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'move', 'san', 'bestMove') ?? facts.bestMove);
    const isBest = ['best', 'book', 'brilliant', 'great'].includes(plan.classification);
    if (isBest && stripCheck(facts.san) === stripCheck(facts.bestMove)) {
      return [
        `${mv} was the move, and ${you(ctx)} played it.`,
        `${mv} was exactly what the engine wanted.`,
        `Nothing beat ${mv} here.`,
      ];
    }
    if (voice === 'opponent') {
      return [`Their best was ${mv}.`, `${mv} was their best move.`, `The stronger move for them was ${mv}.`];
    }
    if (voice === 'neutral') {
      return [
        `Better for ${moverName} was ${mv}.`,
        `${mv} was ${moverName}'s best move.`,
        `${moverName} should have played ${mv}.`,
      ];
    }
    return [
      `${mv} was the move.`,
      `${mv} was the better move.`,
      `${mv} would have kept everything together.`,
      ...(ctx.syntax.imperativeAdvice ? [`${mv} was the move to play.`] : []),
      ...(ctx.syntax.fragments ? [`${mv} instead.`] : []),
    ];
  };

  const leftBook: Frame = (p, ctx) => {
    const name = str(p, 'name', 'opening') ?? facts.opening?.name;
    const of = name ? `the ${name}` : 'the book';
    return [
      `This was where the game left ${of}.`,
      `Book ended here; from then on it was ${ctx.moverPossessive()} own thinking.`,
      `The last known move of ${of} was the one before this.`,
    ];
  };

  const inBook: Frame = (p) => {
    const name = str(p, 'name', 'opening') ?? facts.opening?.name;
    const of = name ? `the ${name}` : 'the opening';
    return [
      `Still in the book: this was a known position in ${of}.`,
      'Theory so far, and nothing to add.',
      `This was a standard move in ${of}.`,
    ];
  };

  const backRank: Frame = (p) => {
    const side = str(p, 'side');
    return [
      `${Owner(side)} back rank was weak: the king had no escape square.`,
      `${Owner(side)} king was stuck on the back rank with no air.`,
      'A back-rank problem: nothing guarded the first rank.',
    ];
  };

  const passedPawn: Frame = (p, ctx) => {
    const pawn = piece(p, 'pawn', 'piece');
    const steps = number(p, 'stepsToPromote', 'steps');
    const created = bool(p, 'created') ?? false;
    const n = steps ? `${num(steps)} ${steps === 1 ? 'step' : 'steps'}` : 'a few steps';
    return [
      `${R(ctx, pawn)} was a passed pawn, ${n} from promoting.`,
      `No pawn could stop ${R(ctx, pawn)}; it needed ${n} more.`,
      created
        ? `The move created a passed pawn: ${R(ctx, pawn)}.`
        : `${R(ctx, pawn)} had a clear road to promotion.`,
    ];
  };

  const promotion: Frame = (p, ctx) => {
    const sq = str(p, 'square');
    const inBest = bool(p, 'inBestLine') ?? false;
    const on = sq ? ` on ${ctx.square(sq)}` : '';
    return [
      `A pawn promoted${on}.`,
      `The pawn reached the last rank${on} and became a queen.`,
      inBest ? `The best line ended with a promotion${on}.` : `A new queen arrived${on}.`,
    ];
  };

  const kingExposed: Frame = (p, ctx) => {
    const side = str(p, 'side');
    const whose = owner(side);
    const files = strs(p, 'openFiles');
    const zone = pieces(p, 'attackersInZone');
    const fileText =
      files.length > 0
        ? `the ${list(files.map((f) => `${f}-file`))} ${files.length === 1 ? 'was' : 'were'} open`
        : 'the files nearby were open';
    return [
      `${Owner(side)} king was exposed: ${fileText}${zone.length ? ` and ${num(zone.length)} ${zone.length === 1 ? 'attacker was' : 'attackers were'} close` : ''}.`,
      `Too many pieces were near ${whose} king, and the pawn cover was gone.`,
      `${Owner(side)} king had lost its shelter.`,
      ...(zone[0] ? [`${R(ctx, zone[0])} was already inside the king's zone.`] : []),
    ];
  };

  const overloaded: Frame = (p, ctx) => {
    const d = piece(p, 'defender', 'piece');
    const duties = pieces(p, 'duties');
    const [a, b] = duties;
    const both = b ? `${R(ctx, a)} and ${R(ctx, b)}` : a ? `${R(ctx, a)} and more` : 'two things';
    return [
      `${R(ctx, d)} was overloaded: it defended both ${both}.`,
      `${R(ctx, d)} had two jobs, guarding ${both}, and could not do both.`,
      `Asked to do two things, ${R(ctx, d)} was bound to fail at one of them.`,
      `${R(ctx, d)} was overloaded.`,
    ];
  };

  const zugzwang: Frame = () => {
    const base = [
      'Any move made the position worse; it would have been better not to move at all.',
      'There was no waiting move: every move gave something up.',
      'The problem was having to move, because every move lost something.',
    ];
    return isBanned('zugzwang')
      ? base
      : [...base, 'This was zugzwang: the obligation to move was what lost.'];
  };

  const fortress: Frame = (p) => {
    const deficit = number(p, 'deficit');
    const down = deficit ? `${pawns(deficit)} down` : 'down material';
    return [
      `Despite being ${down}, the position was a fortress and could not be broken.`,
      'Material was down, but the defence held: nothing got through.',
      'This was a fortress; the extra material did not win.',
    ];
  };

  const tradedBehind: Frame = (p, ctx) => {
    const c = piece(p, 'captured', 'piece');
    const deficit = number(p, 'deficit');
    const down = deficit ? `${pawns(deficit)} down` : 'behind';
    return [
      `Trading ${R(ctx, c)} while ${down} only helped the side that was ahead.`,
      'Behind in material, every trade brought a lost endgame closer.',
      `Exchanging ${R(ctx, c)} here was a trade that favoured ${self ? 'the opponent' : 'the side that was ahead'}.`,
    ];
  };

  const quietLoss: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'bestMove', 'move') ?? facts.bestMove);
    return [
      `Nothing was left hanging, but the position slipped: the engine preferred ${mv}.`,
      'A quiet move that gave up a little.',
      `No tactic here, only a worse version of the position than after ${mv}.`,
    ];
  };

  const define: Frame = (p) => {
    const raw = (str(p, 'term', 'concept', 'word') ?? '').toLowerCase().replace(/_/g, ' ').trim();
    const key = raw.replace(/^(an?|the) /, '');
    const defs = DEFINITIONS[key];
    if (!defs) return voiced(GENERIC_DEFINITION);
    if (key === 'zugzwang' && isBanned('zugzwang')) {
      return voiced([
        'The name for this is a German word; it means having to move when every move hurts.',
        'There is a term for a position where moving is the only problem, and every move hurts.',
        'Having to move when you would rather pass has its own name in chess.',
      ]);
    }
    return voiced(defs);
  };

  // -------------------------------------------------------------------------
  // The line that explains an error (§13.2)

  const mover = facts.color;
  const replier = mover === 'w' ? 'b' : 'w';
  const pieceName = (ctx: RenderContext, pc: PieceRef['piece']) =>
    ctx.lexicon.pieceNames[pc] ?? pc.toLowerCase();
  /** "your rook on d5" / "their rook on d5" / "Black's rook on d5", said in full. */
  // The square is written out, never "here" or "that square": the line is
  // quoted exactly, and every square in it is a fact.
  const owned = (ctx: RenderContext, pc: PieceRef) =>
    `${owner(pc.color)} ${pieceName(ctx, pc.piece)} on ${pc.square}`;
  /** "24.Qc4" / "24…Kh8", numbering on from `n` for whoever moves first. */
  const numbered = (ctx: RenderContext, sans: string[], n: number, first: 'w' | 'b'): string[] => {
    let num = n;
    let side = first;
    return sans.map((san) => {
      const text = side === 'w' ? `${num}.${ctx.move(san)}` : `${num}…${ctx.move(san)}`;
      if (side === 'b') num += 1;
      side = side === 'w' ? 'b' : 'w';
      return text;
    });
  };
  /** "a rook for a pawn" / "a rook" / "three pawns". */
  const deficit = (ctx: RenderContext, lost: PieceRef['piece'][], gained: PieceRef['piece'][], net: number) => {
    const a = (pc: PieceRef['piece']) => `a ${pieceName(ctx, pc)}`;
    if (lost.length === 1 && gained.length === 1 && lost[0] !== gained[0]) return `${a(lost[0]!)} for ${a(gained[0]!)}`;
    if (lost.length === 1 && gained.length === 0) return a(lost[0]!);
    return pawns(-net);
  };

  const refutationFrame: Frame = (p, ctx) => {
    const r = facts.refutation;
    if (!r || r.line.length === 0) {
      return [
        `${otherName} had a strong reply.`,
        `The reply was strong, and the position paid for it.`,
        `${otherName} had an answer to it.`,
      ];
    }
    const [first, ...rest] = numbered(ctx, r.line, r.moveNumber, replier);
    const had = voice === 'opponent' ? 'That gave you' : `${otherName} had`;
    const t = r.tactic;
    const timed = str(p, 'clockKind') !== undefined;
    // The tactic twice over: as a participle for the long sentence, and as a
    // past-tense clause for the short one.
    let how = '';
    let did = '';
    if (t?.type === 'pin') {
      how = `, pinning ${owned(ctx, t.pinned)} to ${owned(ctx, t.against)}`;
      did = `It pinned ${owned(ctx, t.pinned)} to ${owned(ctx, t.against)}.`;
    } else if (t?.type === 'skewer') {
      how = `, skewering ${owned(ctx, t.front)} in front of ${owned(ctx, t.behind)}`;
      did = `It skewered ${owned(ctx, t.front)} in front of ${owned(ctx, t.behind)}.`;
    } else if (t?.type === 'fork') {
      const ts = list(t.targets.map((x) => owned(ctx, x)));
      how = `, forking ${ts}`;
      did = `It forked ${ts}.`;
    } else if (t?.type === 'discovered_attack') {
      how = `, uncovering an attack on ${owned(ctx, t.target)}${t.check ? ' with check' : ''}`;
      did = `It uncovered an attack on ${owned(ctx, t.target)}${t.check ? ' with check' : ''}.`;
    } else if (t?.type === 'capture') {
      how = `, taking ${owned(ctx, t.target)}${t.undefended ? ', which nothing defended' : ''}`;
      did = `It took ${owned(ctx, t.target)}${t.undefended ? ', which nothing defended' : ''}.`;
    } else if (t?.type === 'check') {
      how = ', with check';
      did = 'It came with check.';
    }

    const loser = self ? 'you were' : voice === 'opponent' ? 'they were' : `${moverName} was`;
    const down = r.lost.length > 0 && r.net <= -1 ? deficit(ctx, r.lost, r.gained, r.net) : '';
    const actual = r.actual && stripCheck(r.actual) !== stripCheck(r.line[0]!) ? r.actual : undefined;
    const went = actual
      ? voice === 'opponent'
        ? `You went for ${numbered(ctx, [actual], r.moveNumber, replier)[0]} instead.`
        : `${otherName} played ${numbered(ctx, [actual], r.moveNumber, replier)[0]} instead.`
      : r.actual
        ? (voice === 'opponent' ? 'You made them pay for it.' : `${otherName} found it.`)
        : '';

    if (t?.type === 'mate') {
      const mate = `${had} a forced mate in ${num(t.mateIn)}, starting with ${first}.`;
      return [`${mate} ${went}`.trim(), mate, `${had} ${first}. It started a forced mate in ${num(t.mateIn)}.`];
    }
    if (timed) {
      // The clock and the line in one: the time first, then what it missed.
      const which = did ? `, which ${did.replace(/^It /, '').replace(/\.$/, '')}` : '';
      const lostTail = down ? ` In the end ${loser} ${down} down.` : '';
      return [
        `${clockLead(p, ctx, first!, which)}.${lostTail}`,
        `${clockLead(p, ctx, first!, which)}.`,
        `${clockLead(p, ctx, first!)}.`,
      ];
    }
    const after = rest.length > 0 && down ? `; after ${rest.join(' ')} ${loser} ${down} down` : '';
    const long = `${had} ${first}${how}${after}.`;
    // Compact: the key facts in two short sentences, for the voices that cut
    // long sentences or keep only two per slot.
    const last = rest.length > 0 ? rest[rest.length - 1]! : first;
    const lostIt = down ? (rest.length > 0 ? `after ${last} ${loser} ${down} down` : `${loser} ${down} down`) : '';
    const compact = did
      ? `${did.replace(/^It /, `${first} `).replace(/\.$/, '')}${lostIt ? `, and ${lostIt}` : ''}.`
      : `${had} ${first}${lostIt ? `, and ${lostIt}` : ''}.`;
    return [`${long} ${went}`.trim(), long, compact];
  };

  /** Where the better move would have left the game, from the mover's side. */
  const keptPhrase = (): { phrase: string; number: string } => {
    const score = facts.betterLine?.score ?? {};
    const moverView = (v: number) => (mover === 'w' ? v : -v);
    if (score.mate !== undefined) {
      const forMover = moverView(score.mate) > 0;
      return { phrase: forMover ? 'kept a forced mate' : 'was the most stubborn defence', number: '' };
    }
    const cp = score.cp ?? 0;
    const m = moverView(cp) / 100;
    const phrase =
      m >= 3 ? 'kept a winning position' : m >= 1 ? 'kept the advantage' : m > -1 ? 'kept the game level' : m >= -3 ? 'held on to a playable game' : 'was the most stubborn defence';
    const w = cp / 100;
    const number = `${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(1)}`;
    return { phrase, number };
  };

  // -------------------------------------------------------------------------
  // The clock (§14.5). Every figure is formatClock / formatMinutes of a fact,
  // so the validator's invented_time can prove it.

  const mvNumbered = (ctx: RenderContext) =>
    numbered(ctx, [facts.san], Math.ceil(facts.ply / 2), mover)[0]!;

  /**
   * The clock half of a merged refutation sentence, ending on the reply the
   * move missed: "You spent 1:09 on 22.Nxd4 and still missed 22…cxb3".
   */
  const clockLead = (p: Proposition, ctx: RenderContext, reply: string, which = ''): string | null => {
    const kind = str(p, 'clockKind');
    if (!kind) return null;
    const mv = mvNumbered(ctx);
    const who = self ? 'you' : ctx.mover();
    const whose = ctx.moverPossessive();
    const spent = formatClock(number(p, 'spent') ?? 0);
    if (kind === 'long') return `${who} spent ${spent} on ${mv} and still missed ${reply}${which}`;
    if (kind === 'trouble') {
      return `with ${formatClock(number(p, 'leftBefore') ?? 0)} left, ${who} went for ${mv} and missed ${reply}${which}`;
    }
    // The time and the miss first, so a voice that cuts long sentences keeps
    // "You played 15.Bb2 in 3 seconds and missed 15…cxb3." whole.
    return `${who} played ${mv} in ${spent} and missed ${reply}${which}. That was with ${formatClock(number(p, 'left') ?? 0)} on ${whose} clock`;
  };

  const clockFrame: Frame = (p, ctx) => {
    const kind = str(p, 'kind') ?? 'fast';
    const spent = formatClock(number(p, 'spent') ?? facts.clock?.spent ?? 0);
    const leftMs = number(p, 'left') ?? facts.clock?.left ?? 0;
    const left = formatClock(leftMs);
    const leftMin = formatMinutes(leftMs);
    const before = formatClock(number(p, 'leftBefore') ?? facts.clock?.leftBefore ?? 0);
    const mv = mvNumbered(ctx);
    // "you", never the persona's address: "friends played 15.Bb2" is wrong.
    const who = self ? 'you' : ctx.mover();
    const whose = ctx.moverPossessive();
    const loss = bool(p, 'loss') ?? true;
    if (kind === 'trouble') {
      return loss
        ? [
            `With ${before} left, ${who} went for ${mv}.`,
            `${who} had ${before} on the clock for ${mv}, and it showed.`,
            `Time was short: ${mv} came with ${before} left.`,
          ]
        : [
            `With only ${before} left, ${who} still found ${mv}.`,
            `${mv} came with ${before} on the clock, and it was right.`,
            `Time was short, ${before}, and ${mv} was still the move.`,
          ];
    }
    if (kind === 'long') {
      const r = facts.refutation;
      const reply = r ? numbered(ctx, [r.line[0]!], r.moveNumber, replier)[0] : undefined;
      const phrase = verdictPhrase(plan.classification, banned);
      return reply
        ? [
            `${who} spent ${spent} on ${mv} and still missed the reply ${reply}.`,
            `${spent} of thought went into ${mv}, and the reply ${reply} was still missed.`,
            `${who} thought for ${spent} here and still missed ${reply}.`,
          ]
        : [
            `${who} spent ${spent} on ${mv}, and it was still ${phrase}.`,
            `${spent} of thought went into ${mv}, and it was still ${phrase}.`,
            `${who} thought for ${spent} here, and it still went wrong.`,
          ];
    }
    const withLeft = leftMin ? [`${who} played ${mv} in ${spent}, with ${leftMin} left.`] : [];
    return [
      `${who} played ${mv} in ${spent}, with ${left} on ${whose} clock.`,
      ...withLeft,
      `${mv} took ${spent}, with ${left} still on ${whose} clock.`,
    ];
  };

  /** "you" / "your opponent" / "White", for a side that may not be the mover. */
  const sideName = (c: Color, possessive = false): string => {
    if (viewer === null) return possessive ? `${colorName(c)}'s` : colorName(c);
    if (c === viewer) return possessive ? 'your' : 'you';
    return possessive ? "your opponent's" : 'your opponent';
  };
  const cap = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  const VERDICT_FOR: Record<string, string> = {
    winning: 'winning',
    better: 'better',
    equal: 'equal',
    worse: 'worse',
    losing: 'lost',
  };
  /** White's view, one decimal, signed; "0.0" when level. */
  const evalText = (score: { cp?: number; mate?: number }): string => {
    if (score.mate !== undefined) return `mate in ${num(Math.abs(score.mate))}`;
    const w = (score.cp ?? 0) / 100;
    if (Math.abs(w) < 0.05) return '0.0';
    return `${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(1)}`;
  };

  const gameOverFrame: Frame = (_p, ctx) => {
    const e = facts.ending;
    if (!e) return ['That was the end of the game.', 'The game ended here.', 'And that was the game.'];
    const loser: Color | null = e.winner === null ? null : e.winner === 'w' ? 'b' : 'w';
    // The position when it ended, read from the reader's side (the loser's
    // for a neutral reader).
    const seat: Color | null = viewer ?? loser;
    const verdict = seat ? e.verdictAtEnd[seat] : e.verdictAtEnd.w;
    const said = VERDICT_FOR[verdict] ?? verdict;
    const forWhom =
      verdict === 'equal' ? '' : seat === null ? '' : viewer === null ? ` for ${colorName(seat)}` : ' for you';
    const position = `the position was ${said}${forWhom} (${evalText(e.evalAtEnd)})`;
    const last = mvNumbered(ctx);
    const next = facts.playedLine[0];
    const nextNum = next ? numbered(ctx, [next], Math.ceil((facts.ply + 1) / 2), replier)[0] : undefined;

    switch (e.kind) {
      case 'timeout':
      case 'timeout_vs_insufficient': {
        const whose = loser ? sideName(loser, true) : 'the';
        const atMove = Math.ceil((e.atPly + 1) / 2);
        const thought = e.finalThink !== undefined && e.finalThink >= 1000 ? ` after ${formatClock(e.finalThink)} of thought` : '';
        const ran = `${cap(whose)} clock ran out on move ${atMove}${thought}.`;
        const draw = e.kind === 'timeout_vs_insufficient' ? ' There was not enough material left to win, so it was a draw.' : '';
        const good = verdict === 'winning' || verdict === 'better' || verdict === 'equal';
        const held =
          nextNum && loser && seat === loser
            ? good
              ? ` ${nextNum} would have held it.`
              : ` ${nextNum} was the best try.`
            : '';
        return [
          `${ran} At that point ${position}.${held}${draw}`,
          `${ran} ${cap(position)}.${held}${draw}`,
          `${ran}${draw} ${cap(position)}, so the clock decided it.`,
          `${cap(whose)} clock ran out; ${position}.${draw}`,
        ];
      }
      case 'resignation': {
        const who = loser ? sideName(loser) : 'nobody';
        const still = verdict === 'equal' || verdict === 'better' || verdict === 'winning';
        const tail = still && seat === loser ? ' It was still playable.' : '';
        return [
          `${cap(who)} resigned after ${last}; ${position}.${tail}`,
          `The game ended by resignation after ${last}: ${position}.${tail}`,
          `${cap(who)} resigned here, and ${position}.${tail}`,
        ];
      }
      case 'abandoned': {
        const who = loser ? sideName(loser) : 'a player';
        return [
          `${cap(who)} left the game after ${last}; ${position}.`,
          `The game was abandoned after ${last}, and ${position}.`,
          `${cap(who)} abandoned the game here; ${position}.`,
        ];
      }
      case 'agreement':
        return [
          `The game was drawn by agreement after ${last}; ${position}.`,
          `A draw was agreed here, and ${position}.`,
          `Both sides agreed a draw after ${last}; ${position}.`,
        ];
      case 'repetition':
        return ['The game was drawn by repetition.', 'The same position came back three times, and it was a draw.', 'A draw by repetition ended it.'];
      case 'stalemate':
        return ['It ended in stalemate: no legal move, and no check.', 'Stalemate ended the game in a draw.', 'The game ended in stalemate.'];
      case 'insufficient':
        return ['Neither side had enough material left to mate, so it was a draw.', 'The game was drawn: not enough material to mate.', 'Too little material was left, and it was a draw.'];
      case 'fifty_move':
        return ['The game was drawn by the fifty-move rule.', 'Fifty moves passed without a capture or a pawn move, and it was a draw.', 'The fifty-move rule ended it in a draw.'];
      default:
        return ['That was the end of the game.', 'The game ended here.', 'And that was the game.'];
    }
  };

  const betterLineFrame: Frame = (p, ctx) => {
    const b = facts.betterLine;
    const san = str(p, 'move') ?? facts.bestMove;
    const [mv] = b ? numbered(ctx, [san], b.moveNumber, mover) : [ctx.move(san)];
    const { phrase, number } = keptPhrase();
    const n = number ? ` (${number})` : '';
    const say = phrase.replace(/^was /, 'been ');
    if (voice === 'opponent') {
      return [
        `Their best was ${mv}; it would have ${say} for them${n}.`,
        `${mv} would have ${say} for them${n}.`,
        `Their best was ${mv}${n}.`,
      ];
    }
    const who = voice === 'neutral' ? `${moverName}'s` : '';
    return [
      `${mv} would have ${say}${n}.`,
      who ? `${who} better move was ${mv}; it would have ${say}${n}.` : `${mv} was better; it would have ${say}${n}.`,
      `${mv} was the move: it would have ${say}${n}.`,
    ];
  };

  const lesson: Frame = (p, ctx) => {
    const concept = str(p, 'concept', 'id', 'key', 'lesson') ?? conceptFor(plan.lead);
    const l = LESSONS[concept] ?? GENERIC_LESSON;
    return ctx.syntax.imperativeAdvice
      ? [...l.imperative, l.question]
      : [...l.declarative, l.question, l.imperative[l.imperative.length - 1]!];
  };

  return {
    verdict,
    hangs,
    attacked_by: attackedBy,
    under_defended: underDefended,
    forked: forkFrame(false),
    forks: forkFrame(true),
    pinned,
    skewered,
    discovered,
    trapped,
    missed_capture: missedCapture,
    missed_mate: missedMate,
    mate_allowed: mateAllowed,
    mate_delivered: mateDelivered,
    ignored_threat: ignoredThreat,
    sacrifice,
    only_move: onlyMove,
    swing,
    material_delta: materialDelta,
    best_does: bestDoes,
    best_line: bestLine,
    best_move: bestMove,
    left_book: leftBook,
    in_book: inBook,
    back_rank: backRank,
    passed_pawn: passedPawn,
    promotion,
    king_exposed: kingExposed,
    overloaded,
    zugzwang,
    fortress,
    traded_behind: tradedBehind,
    quiet_loss: quietLoss,
    define,
    lesson,
    refutation: refutationFrame,
    better_line: betterLineFrame,
    clock: clockFrame,
    game_over: gameOverFrame,
  };
}

/** Every proposition kind, in contract order; used by tests and synthesis. */
export const PROP_KINDS: readonly PropKind[] = [
  'verdict', 'hangs', 'attacked_by', 'under_defended', 'forked', 'forks', 'pinned', 'skewered',
  'discovered', 'trapped', 'missed_capture', 'missed_mate', 'mate_allowed', 'mate_delivered',
  'ignored_threat', 'sacrifice', 'only_move', 'swing', 'material_delta', 'best_does',
  'best_line', 'best_move', 'left_book', 'in_book', 'back_rank', 'passed_pawn', 'promotion',
  'king_exposed', 'overloaded', 'zugzwang', 'fortress', 'traded_behind', 'quiet_loss',
  'define', 'lesson', 'refutation', 'better_line', 'clock', 'game_over',
];
