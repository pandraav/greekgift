import type { Classification, PieceRef, SituationKind } from '@greekgift/engine';

import type { Frame, PersonaGrammar, Plan, PropKind, Proposition, RenderContext } from '../contracts.ts';
import { list, num, pawns, pct, stripCheck } from './text.ts';

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
  allowed_mate: ['Walks into a forced mate.', 'The king cannot be saved after this.', 'Mate is now unstoppable.'],
  missed_mate: ['A forced mate went begging.', 'Checkmate was on the board.', 'The mate was there.'],
  hung_piece: ['A piece left hanging.', 'Drops a piece for nothing.', 'The piece is simply lost.'],
  under_defended: ['One defender short.', 'Attacked more than defended.', 'Not enough defenders.'],
  walked_into_fork: ['One square, two pieces.', 'Straight into a fork.', 'Drops a piece to a fork.'],
  walked_into_pin: ['Walks into a pin.', 'Pinned, and it costs.', 'The pin decides.'],
  walked_into_skewer: ['Walks into a skewer.', 'Two pieces on one line.', 'The skewer wins material.'],
  missed_capture: ['A free piece, missed.', 'There was something to take.', 'The capture was there.'],
  ignored_threat: ['The threat was not answered.', 'Their idea goes through.', 'The wrong problem got solved.'],
  created_fork: ['A fork, and it wins.', 'Two pieces hit at once.', 'A fork lands.'],
  created_discovered: ['A discovered attack.', 'The piece moves, the attack opens.', 'Uncovering a strong attack.'],
  trapped_piece: ['A piece with nowhere to go.', 'The piece is trapped.', 'No squares left.'],
  traded_behind: ['A trade while behind.', 'The wrong time to trade.', 'Trading into a lost endgame.'],
  unsound_sacrifice: ['A sacrifice that does not work.', 'Too much given away.', 'The sacrifice falls short.'],
  sound_sacrifice: ['A sacrifice that works.', 'Material given, position won.', 'A sound sacrifice.'],
  only_move: ['The only move, found.', 'One move held, and this was it.', 'Precisely the only move.'],
  left_book: ['Out of the book.', 'Theory ends here.', 'On your own from here.'],
  book: ['Still in the book.', 'A known position.', 'Theory so far.'],
  best: ['The best move.', 'Exactly right.', 'Nothing better here.'],
  good: ['A good move.', 'Solid and sensible.', 'A reasonable choice.'],
  quiet_loss: ['A quiet slip.', 'A small step backwards.', 'Nothing hangs, but it is worse.'],
  back_rank: ['A back-rank weakness.', 'The back rank is open.', 'No escape square.'],
  passed_pawn: ['A passed pawn.', 'The pawn is on its way.', 'A runner on the board.'],
  promotion: ['A new queen.', 'The pawn promotes.', 'Promotion decides.'],
  king_exposed: ['The king is exposed.', 'No shelter for the king.', 'An open king.'],
  overloaded: ['One piece, two jobs.', 'An overloaded defender.', 'The defender cannot do both.'],
  zugzwang: ['Every move makes it worse.', 'No good move left.', 'Forced to move, and it hurts.'],
  fortress: ['A fortress holds.', 'Material down, position safe.', 'Nothing gets through.'],
  mate_delivered: ['Checkmate.', 'The game ends with mate.', 'Mate delivered.'],
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
    'When a piece is stuck in front of a more valuable one on the same line, it is pinned.',
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

export function neutralFrames(plan: Plan, grammar: PersonaGrammar): Record<PropKind, Frame> {
  const facts = plan.facts;
  const banned = grammar.banned;
  const isBanned = (w: string) => banned.some((b) => b.toLowerCase() === w);
  const played = () => facts.san;
  const R = (ctx: RenderContext, pc: PieceRef | undefined): string =>
    pc ? ctx.refer(pc) : 'a piece';
  const owner = (color: string | undefined) => (color === facts.color ? 'your' : 'their');
  const captureWith = (ctx: RenderContext, target: PieceRef | undefined): string => {
    const verb = ctx.lexicon.captureVerb || 'takes';
    if (!target) return verb === 'wins' ? 'wins material' : `${verb} a piece`;
    if (/\bon$/.test(verb)) return `${verb} ${ctx.square(target.square)}`;
    return `${verb} ${ctx.refer(target)}`;
  };
  const you = (ctx: RenderContext) => ctx.lexicon.address || 'you';

  const verdict: Frame = (p, ctx) => {
    const c = (str(p, 'classification') as Classification | undefined) ?? plan.classification;
    const san = str(p, 'san', 'move') ?? played();
    const leadArg = str(p, 'lead', 'kind');
    const lead = (leadArg && LEADS.has(leadArg) ? leadArg : plan.lead) as SituationKind;
    const phrase = verdictPhrase(c, banned);
    const word = verdictWord(c, banned);
    const mv = ctx.move(san);
    const leadLines = LEAD_HEADLINES[lead] ?? LEAD_HEADLINES.good;

    if (p.role === 'observation' || p.slot !== 'headline') {
      return [
        `${mv} is ${phrase} here.`,
        `${mv} was ${phrase}.`,
        `The engine agrees: ${mv} is ${phrase}.`,
        ...(ctx.syntax.fragments ? [`${word}: ${mv}.`] : []),
      ];
    }
    if (ctx.syntax.verdictFirst) {
      return [`${word}: ${mv}.`, ...leadLines.map((l) => `${word}. ${l}`)];
    }
    return [...leadLines, `${mv} is ${phrase}.`, `${word}: ${mv}.`];
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
        `${R(ctx, a)} attacks both ${R(ctx, t1)} and ${R(ctx, t2)}, and neither is defended.`,
        `Both ${R(ctx, t1)} and ${R(ctx, t2)} are hanging to ${R(ctx, a)}.`,
        `${R(ctx, a)} can take either ${R(ctx, t1)} or ${R(ctx, t2)} for free.`,
      ];
    }
    const t = R(ctx, target);
    if (!a) {
      return [
        `${t} is left hanging: nothing defends it.`,
        `${t} is undefended and can simply be taken.`,
        `${t} hangs.`,
      ];
    }
    const undefended = defenders.length === 0;
    return [
      `${t} is hanging: ${R(ctx, a)} attacks it and ${undefended ? 'nothing defends it' : 'the defence is not enough'}.`,
      `${t} is left hanging to ${R(ctx, a)}.`,
      `${R(ctx, a)} can simply take ${t}.`,
      `${t} hangs to ${R(ctx, a)}.`,
      ...(ctx.syntax.fragments ? [`${t}, hanging.`] : []),
    ];
  };

  const attackedBy: Frame = (p, ctx) => {
    const target = piece(p, 'target', 'piece');
    const a = pieces(p, 'attackers', 'attacker', 'by')[0];
    const t = R(ctx, target);
    return [
      `${t} is attacked by ${R(ctx, a)}.`,
      `${R(ctx, a)} is hitting ${t}.`,
      `${R(ctx, a)} now attacks ${t}.`,
    ];
  };

  const underDefended: Frame = (p, ctx) => {
    const target = piece(p, 'target', 'piece');
    const attackers = pieces(p, 'attackers');
    const defenders = pieces(p, 'defenders');
    const t = R(ctx, target);
    const a = attackers[0];
    return [
      `${t} is attacked ${num(Math.max(attackers.length, 1))} ${attackers.length === 1 ? 'time' : 'times'} and defended only ${num(defenders.length)}.`,
      `${t} has more attackers than defenders.`,
      a
        ? `${R(ctx, a)} adds one attacker too many against ${t}.`
        : `One more attacker on ${t} than there are defenders.`,
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
          `${b} forks ${ts}.`,
          `${b} attacks ${ts} at the same time, and only one can move away.`,
          `With ${ctx.move(played())}, ${b} hits ${ts} at once.`,
          `${b} forks ${sqs}.`,
        ];
      }
      return [
        `${b} attacks ${ts} at the same time, so only one of the two can be saved.`,
        `${b} forks ${ts}.`,
        `${b} hits ${ts} at once.`,
        `${b} forks ${sqs}.`,
        ...(ctx.syntax.fragments ? [`A fork: ${b} against ${ts}.`] : []),
      ];
    };

  const pinned: Frame = (p, ctx) => {
    const pn = piece(p, 'pinned', 'target');
    const pr = piece(p, 'pinner', 'by');
    const ag = piece(p, 'against');
    const absolute = bool(p, 'absolute') ?? false;
    return [
      `${R(ctx, pn)} is pinned to ${R(ctx, ag)} by ${R(ctx, pr)}${absolute ? ', and it cannot legally move' : ''}.`,
      `${R(ctx, pr)} pins ${R(ctx, pn)} against ${R(ctx, ag)}.`,
      `${R(ctx, pn)} cannot move without exposing ${R(ctx, ag)} to ${R(ctx, pr)}.`,
      `${R(ctx, pr)} pins ${R(ctx, pn)}.`,
    ];
  };

  const skewered: Frame = (p, ctx) => {
    const f = piece(p, 'front', 'target');
    const h = piece(p, 'behind');
    const b = piece(p, 'by', 'attacker');
    return [
      `${R(ctx, b)} skewers ${R(ctx, f)}: once it moves, ${R(ctx, h)} falls.`,
      `${R(ctx, f)} has to move out of the line of ${R(ctx, b)}, and ${R(ctx, h)} is behind it.`,
      `${R(ctx, b)} lines up ${R(ctx, f)} and ${R(ctx, h)} on one line.`,
      `${R(ctx, f)} is skewered by ${R(ctx, b)}.`,
    ];
  };

  const discovered: Frame = (p, ctx) => {
    const m = piece(p, 'mover');
    const a = piece(p, 'attacker', 'by');
    const t = piece(p, 'target');
    const check = bool(p, 'check') ?? false;
    const tail = check ? ', with check' : '';
    return [
      `Moving ${R(ctx, m)} uncovers an attack from ${R(ctx, a)} on ${R(ctx, t)}${tail}.`,
      `${R(ctx, m)} steps aside and ${R(ctx, a)} now hits ${R(ctx, t)}${tail}.`,
      `A discovered ${check ? 'check' : 'attack'}: ${R(ctx, a)} hits ${R(ctx, t)} through the square ${R(ctx, m)} left.`,
      `${R(ctx, a)} now hits ${R(ctx, t)}${tail}.`,
    ];
  };

  const trapped: Frame = (p, ctx) => {
    const t = piece(p, 'target', 'piece');
    const a = pieces(p, 'attackers')[0];
    return [
      `${R(ctx, t)} has no safe square left.`,
      `${R(ctx, t)} is trapped: every escape square is covered.`,
      a
        ? `${R(ctx, a)} takes away the last square from ${R(ctx, t)}, and it is lost.`
        : `${R(ctx, t)} is trapped and will be lost.`,
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
        'This allows a forced mate.',
        'After this the king cannot be saved.',
        'The position is now lost to a forced mate.',
      ];
    }
    return [
      `This allows a forced mate, starting with ${ctx.move(first)}.`,
      `After ${ctx.move(first)} the king cannot be saved.`,
      `The reply ${ctx.move(first)} leads to checkmate.`,
    ];
  };

  const mateDelivered: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'san', 'move') ?? played());
    return [`${mv} is checkmate.`, `Checkmate, with ${mv}.`, `${mv} ends the game.`];
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
      `The threat was ${threat}, and ${mv} does nothing about it.`,
      `${threat.charAt(0).toUpperCase()}${threat.slice(1)} was coming, and that had to be dealt with first.`,
      `Their threat, ${threat}, is still there after ${mv}.`,
      `The threat of ${threat} stands.`,
    ];
  };

  const sacrifice: Frame = (p, ctx) => {
    const pc = piece(p, 'piece', 'target');
    const sound = bool(p, 'sound') ?? plan.lead === 'sound_sacrifice';
    if (sound) {
      return [
        `${R(ctx, pc)} is given up on purpose, and the position justifies it.`,
        `Giving up ${R(ctx, pc)} works here.`,
        `${R(ctx, pc)} goes, and what comes back is worth more.`,
      ];
    }
    return [
      `${R(ctx, pc)} is given up, but there is not enough for it.`,
      `The sacrifice of ${R(ctx, pc)} does not work.`,
      `Giving up ${R(ctx, pc)} costs more than it brings.`,
    ];
  };

  const onlyMove: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'san', 'move') ?? played());
    return [
      `${mv} was the only move that holds.`,
      `Everything else loses; ${mv} is the one move that keeps the position.`,
      `This was the only move, and ${you(ctx)} found it.`,
    ];
  };

  const swing: Frame = (p, ctx) => {
    const before = number(p, 'winBefore', 'before') ?? facts.winBefore;
    const after = number(p, 'winAfter', 'after') ?? facts.winAfter;
    const b = pct(before);
    const a = pct(after);
    const delta = (after <= 1 ? after * 100 : after) - (before <= 1 ? before * 100 : before);
    if (Math.abs(delta) < 2 || bool(p, 'held')) {
      return [
        `Your chances are about the same as before, around ${a.replace('about ', '')}.`,
        `The chances hold at ${a}.`,
        `Nothing changes in the assessment: still ${a}.`,
        `What did it cost? Nothing; the chances stay at ${a}.`,
      ];
    }
    if (delta > 0) {
      return [
        `Your winning chances went up from ${b} to ${a}.`,
        `That took ${you(ctx)} from ${b} to ${a}.`,
        `The chances rise from ${b} to ${a}.`,
        `Where did the chances go? Up, from ${b} to ${a}.`,
      ];
    }
    return [
      `Your winning chances went from ${b} to ${a}.`,
      `That took ${you(ctx)} from ${b} to ${a}.`,
      `One move, and the chances drop from ${b} to ${a}.`,
      `Your chances fell from ${b} to ${a}.`,
      `Where did the chances go? From ${b} down to ${a}.`,
    ];
  };

  const materialDelta: Frame = (p, ctx) => {
    const gain =
      number(p, 'materialGain', 'delta', 'material') ?? facts.bestMoveEffect.materialGain;
    const m = pawns(gain);
    if (bool(p, 'missed') && gain > 0) {
      return [
        `The better line wins ${m}.`,
        `There was ${m} of material to be had.`,
        `${you(ctx)} could have come out ${m} ahead.`,
        `What was on offer? About ${m} of material.`,
      ];
    }
    if (gain >= 0) {
      return [
        `The best line comes out ${m} better in material.`,
        `That is ${m} of material, gone.`,
        `${you(ctx)} end up ${m} worse off in material than ${you(ctx)} needed to be.`,
        `How much did it cost? About ${m} of material.`,
        ...(ctx.syntax.fragments ? [`${m} of material, gone.`] : []),
      ];
    }
    return [
      `The move comes out ${m} ahead in material.`,
      `That is ${m} of material won.`,
      `${you(ctx)} come out ${m} better in material.`,
      `How much does it win? About ${m} of material.`,
    ];
  };

  const bestDoes: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'move', 'san', 'bestMove') ?? facts.bestMove);
    const effect = facts.bestMoveEffect;
    const captures = isPiece(p.args.captures)
      ? p.args.captures
      : p.args.captures === undefined
        ? effect.captures
        : undefined;
    const check = bool(p, 'check') ?? effect.check;
    const mateIn = number(p, 'mateIn') ?? effect.mateIn;
    const forks = pieces(p, 'forks');
    const forkTargets = forks.length > 0 ? forks : (effect.forks ?? []);
    const clauses: string[] = [];
    if (mateIn) clauses.push(mateIn === 1 ? 'is checkmate' : `is mate in ${num(mateIn)}`);
    if (captures) clauses.push(captureWith(ctx, captures));
    if (forkTargets.length >= 2) clauses.push(`forks ${list(forkTargets.map((t) => ctx.refer(t)))}`);
    if (check && !mateIn) clauses.push('gives check');
    const played = bool(p, 'played') ?? false;
    if (clauses.length === 0) {
      return played
        ? [
            `${mv} is the best move here.`,
            `${mv} does everything the position asks for.`,
            `${mv} keeps everything defended.`,
          ]
        : [
            `${mv} keeps everything defended.`,
            `${mv} holds the position together.`,
            `Instead, ${mv} keeps the balance.`,
          ];
    }
    const does = list(clauses);
    if (played) {
      return [
        `${mv} ${does}.`,
        `${mv} ${does}, which is exactly the point.`,
        `The move ${does}, and that decides it.`,
      ];
    }
    return [
      `${mv} ${does}.`,
      `Instead, ${mv} ${does}.`,
      `Better was ${mv}, which ${does}.`,
      `${mv} ${does}, which is why it was the move.`,
    ];
  };

  const bestLine: Frame = (p, ctx) => {
    const line = lineOf(p, facts.bestLine).slice(0, 5);
    if (line.length === 0) {
      const mv = ctx.move(facts.bestMove);
      return [`The line starts with ${mv}.`, `It begins with ${mv}.`, `${mv}, and the rest follows.`];
    }
    const moves = line.map((m) => ctx.move(m));
    return [
      `The line runs ${moves.join(' ')}.`,
      `After ${moves.join(' ')} the position holds together.`,
      `Follow it through: ${moves.join(', ')}.`,
    ];
  };

  const bestMove: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'move', 'san', 'bestMove') ?? facts.bestMove);
    const isBest = ['best', 'book', 'brilliant', 'great'].includes(plan.classification);
    if (isBest && stripCheck(facts.san) === stripCheck(facts.bestMove)) {
      return [
        `${mv} was the move, and ${you(ctx)} played it.`,
        `${mv} is exactly what the engine wanted.`,
        `Nothing beats ${mv} here.`,
      ];
    }
    return [
      `${mv} was the move.`,
      `Better was ${mv}.`,
      `${mv} keeps everything together.`,
      ...(ctx.syntax.imperativeAdvice ? [`Play ${mv} instead.`] : []),
      ...(ctx.syntax.fragments ? [`${mv} instead.`] : []),
    ];
  };

  const leftBook: Frame = (p) => {
    const name = str(p, 'name', 'opening') ?? facts.opening?.name;
    const of = name ? `the ${name}` : 'the book';
    return [
      `This is where the game leaves ${of}.`,
      'Book ends here; from now on it is your own thinking.',
      `The last known move of ${of} was the one before this.`,
    ];
  };

  const inBook: Frame = (p) => {
    const name = str(p, 'name', 'opening') ?? facts.opening?.name;
    const of = name ? `the ${name}` : 'the opening';
    return [
      `Still in the book: this is a known position in ${of}.`,
      'Theory so far, and nothing to add.',
      `This is a standard move in ${of}.`,
    ];
  };

  const backRank: Frame = (p) => {
    const side = str(p, 'side');
    const whose = owner(side);
    return [
      `${whose === 'your' ? 'Your' : 'Their'} back rank is weak: the king has no escape square.`,
      `${whose === 'your' ? 'Your' : 'Their'} king is stuck on the back rank with no air.`,
      'A back-rank problem: nothing guards the first rank.',
    ];
  };

  const passedPawn: Frame = (p, ctx) => {
    const pawn = piece(p, 'pawn', 'piece');
    const steps = number(p, 'stepsToPromote', 'steps');
    const created = bool(p, 'created') ?? false;
    const n = steps ? `${num(steps)} ${steps === 1 ? 'step' : 'steps'}` : 'a few steps';
    return [
      `${R(ctx, pawn)} is a passed pawn, ${n} from promoting.`,
      `Nothing can stop ${R(ctx, pawn)} by pawns alone; it needs ${n} more.`,
      created
        ? `The move creates a passed pawn: ${R(ctx, pawn)}.`
        : `${R(ctx, pawn)} has a clear road to promotion.`,
    ];
  };

  const promotion: Frame = (p, ctx) => {
    const sq = str(p, 'square');
    const inBest = bool(p, 'inBestLine') ?? false;
    const on = sq ? ` on ${ctx.square(sq)}` : '';
    return [
      `A pawn promotes${on}.`,
      `The pawn reaches the last rank${on} and becomes a queen.`,
      inBest ? `The best line ends with a promotion${on}.` : `A new queen arrives${on}.`,
    ];
  };

  const kingExposed: Frame = (p, ctx) => {
    const side = str(p, 'side');
    const whose = owner(side);
    const files = strs(p, 'openFiles');
    const zone = pieces(p, 'attackersInZone');
    const fileText =
      files.length > 0
        ? `the ${list(files.map((f) => `${f}-file`))} ${files.length === 1 ? 'is' : 'are'} open`
        : 'the files nearby are open';
    return [
      `${whose === 'your' ? 'Your' : 'Their'} king is exposed: ${fileText}${zone.length ? ` and ${num(zone.length)} ${zone.length === 1 ? 'attacker is' : 'attackers are'} close` : ''}.`,
      `Too many pieces are near ${whose} king, and the pawn cover is gone.`,
      `${whose === 'your' ? 'Your' : 'Their'} king has lost its shelter.`,
      ...(zone[0] ? [`${R(ctx, zone[0])} is already inside the king's zone.`] : []),
    ];
  };

  const overloaded: Frame = (p, ctx) => {
    const d = piece(p, 'defender', 'piece');
    const duties = pieces(p, 'duties');
    const [a, b] = duties;
    const both = b ? `${R(ctx, a)} and ${R(ctx, b)}` : a ? `${R(ctx, a)} and more` : 'two things';
    return [
      `${R(ctx, d)} is overloaded: it defends both ${both}.`,
      `${R(ctx, d)} has two jobs, guarding ${both}, and cannot do both.`,
      `Ask ${R(ctx, d)} to do two things and it will fail at one of them.`,
      `${R(ctx, d)} is overloaded.`,
    ];
  };

  const zugzwang: Frame = () => {
    const base = [
      'Any move makes the position worse; it would be better not to move at all.',
      'There is no waiting move: every move gives something up.',
      'The problem is having to move, because every move loses something.',
    ];
    return isBanned('zugzwang')
      ? base
      : [...base, 'This is zugzwang: the obligation to move is what loses.'];
  };

  const fortress: Frame = (p) => {
    const deficit = number(p, 'deficit');
    const down = deficit ? `${pawns(deficit)} down` : 'down material';
    return [
      `Despite being ${down}, the position is a fortress and cannot be broken.`,
      'Material is down, but the defence holds: nothing gets through.',
      'This is a fortress; the extra material does not win.',
    ];
  };

  const tradedBehind: Frame = (p, ctx) => {
    const c = piece(p, 'captured', 'piece');
    const deficit = number(p, 'deficit');
    const down = deficit ? `${pawns(deficit)} down` : 'behind';
    return [
      `Trading ${R(ctx, c)} while ${down} only helps the side that is ahead.`,
      'When behind, trades bring the endgame closer, and the endgame is lost.',
      `Exchanging ${R(ctx, c)} here is a trade that favours the opponent.`,
    ];
  };

  const quietLoss: Frame = (p, ctx) => {
    const mv = ctx.move(str(p, 'bestMove', 'move') ?? facts.bestMove);
    return [
      `Nothing hangs, but the position slipped: the engine prefers ${mv}.`,
      'A quiet move that gives up a little.',
      `No tactic here, only a worse version of the position than after ${mv}.`,
    ];
  };

  const define: Frame = (p) => {
    const raw = (str(p, 'term', 'concept', 'word') ?? '').toLowerCase().replace(/_/g, ' ').trim();
    const key = raw.replace(/^(an?|the) /, '');
    const defs = DEFINITIONS[key];
    if (!defs) return GENERIC_DEFINITION;
    if (key === 'zugzwang' && isBanned('zugzwang')) {
      return [
        'The name for this is a German word; it means having to move when every move hurts.',
        'There is a term for a position where moving is the only problem, and every move hurts.',
        'Having to move when you would rather pass has its own name in chess.',
      ];
    }
    return defs;
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
  };
}

/** Every proposition kind, in contract order; used by tests and synthesis. */
export const PROP_KINDS: readonly PropKind[] = [
  'verdict', 'hangs', 'attacked_by', 'under_defended', 'forked', 'forks', 'pinned', 'skewered',
  'discovered', 'trapped', 'missed_capture', 'missed_mate', 'mate_allowed', 'mate_delivered',
  'ignored_threat', 'sacrifice', 'only_move', 'swing', 'material_delta', 'best_does',
  'best_line', 'best_move', 'left_book', 'in_book', 'back_rank', 'passed_pawn', 'promotion',
  'king_exposed', 'overloaded', 'zugzwang', 'fortress', 'traded_behind', 'quiet_loss',
  'define', 'lesson',
];
