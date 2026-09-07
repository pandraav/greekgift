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
 * Eric Rosen — The Trap Enthusiast.
 *
 * Built from `neutralGrammar('rosen')` and the ten voice rules in the personas
 * spec: four-to-twelve-word sentences that end in a decision, candidate →
 * hedge → commit before every move, "Let's" doing the driving, "yeah" and
 * "okay" as fillers placed *before* the decision, "oh" as the chassis of every
 * reaction, quieter under pressure, anthropomorphised pieces, "fun" as the
 * highest praise, and never a word against the opponent.
 */

type Args = Proposition['args'];

const MAX_WORDS = 12;

const ROSEN_FILLERS = ['yeah', 'okay', 'oh', 'hmm', 'um'];

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

const words = (sentence: string): string[] => sentence.trim().split(/\s+/).filter(Boolean);

/**
 * Split one over-long sentence at the connective nearest its middle. The
 * connective is dropped; the second half becomes its own sentence. Returns the
 * sentence unchanged when no connective sits far enough from either end.
 */
function splitLong(sentence: string, connectives: string[]): string[] {
  const tokens = words(sentence);
  if (tokens.length <= MAX_WORDS) return [sentence];
  const set = new Set(connectives.map((c) => c.toLowerCase()));
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 2; i < tokens.length - 2; i++) {
    const bare = (tokens[i] ?? '').toLowerCase().replace(/[,;]$/, '');
    if (!set.has(bare)) continue;
    const distance = Math.abs(i - tokens.length / 2);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  if (best < 0) return [sentence];
  const head = tokens.slice(0, best).join(' ').replace(/[,;]$/, '');
  const tail = tokens.slice(best + 1).join(' ');
  const terminal = /[.!?]$/.test(head) ? '' : '.';
  return [...splitLong(head + terminal, connectives), ...splitLong(capitalise(tail), connectives)];
}

const shorten = (text: string, connectives: string[]): string =>
  splitSentences(text)
    .flatMap((s) => splitLong(s, connectives))
    .join(' ');

const startsWithFiller = (text: string): boolean => {
  const first = words(text)[0]?.toLowerCase().replace(/[,.!?]$/, '') ?? '';
  return ROSEN_FILLERS.includes(first) || first === 'ooh';
};

/** Frame output: every variant sentence-cased. */
const v = (...variants: string[]): string[] => variants.map(sentenceCase);

const pieceName = (piece: PieceRef, ctx: RenderContext): string =>
  ctx.lexicon.pieceNames[piece.piece];

const squares = (pieces: PieceRef[], ctx: RenderContext): string => {
  const list = pieces.map((p) => ctx.square(p.square));
  if (list.length === 0) return 'two things';
  if (list.length === 1) return list[0]!;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

// ---------------------------------------------------------------------------
// Frames.
// ---------------------------------------------------------------------------

const verdict: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san') ?? 'that');
  switch (strArg(p.args, 'classification')) {
    case 'blunder':
      return v(`Oh no, ${m}.`, `Oh. ${m} was so so bad.`, `Oh no. Not ${m}.`);
    case 'mistake':
      return v(`Hmm, ${m}. Maybe not.`, `Hmm. Maybe not ${m}.`, `Okay, ${m} is a little dubious.`);
    case 'inaccuracy':
      return v(
        `Hmm, ${m}. Not quite.`,
        `Okay, ${m} is a bit loose.`,
        `Hmm. ${m} is playable, but not best.`,
      );
    case 'miss':
      return v(
        `Oh, ${m}. There was something here.`,
        `Oh wow, there was something better than ${m}.`,
        `Hmm, ${m}. Someone call an ambulance.`,
      );
    case 'brilliant':
      return v(`Oh wow, ${m}. That's fun.`, `Ooh. ${m}. That's really nice.`, `Oh yeah, ${m}. No mercy.`);
    case 'great':
      return v(`Yeah, ${m}. That's the move.`, `Oh nice, ${m}. Good spot.`, `Yeah, ${m}. Good spot.`);
    case 'book':
      return v(`Okay, ${m}. Still book.`, `Yeah, ${m}. Theory so far.`, `Okay, ${m}. We're still in the book.`);
    default:
      return v(`Yeah, ${m}. Nice.`, `Okay, ${m}. Yeah, that works.`, `Yeah, ${m} is the idea.`);
  }
};

const hangs: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece');
  const attacker = piecesArg(p.args, 'attackers')[0] ?? pieceArg(p.args, 'attacker', 'by');
  const t = target ? ctx.refer(target) : 'that piece';
  return v(
    `${t} is just hanging now. Poor thing.`,
    attacker
      ? `Yeah, ${ctx.refer(attacker)} hits ${t}. Nothing defends it.`
      : `Yeah, ${t} is hanging. Nothing defends it.`,
    `Hmm. ${t} lived a good life. It's hanging.`,
  );
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p.args, 'by', 'attacker');
  const b = by ? ctx.refer(by) : 'their piece';
  const s = squares(piecesArg(p.args, 'targets'), ctx);
  return v(
    `${b} hits ${s} at once. Sad for us.`,
    `Yeah, ${b} is hitting ${s}. Lovely square for them.`,
    `Hmm. ${b} forks ${s}. Sad for us, but nice by them.`,
  );
};

const forks: Frame = (p, ctx) => {
  const by = pieceArg(p.args, 'by', 'piece');
  const b = by ? ctx.refer(by) : 'that piece';
  const s = squares(piecesArg(p.args, 'targets'), ctx);
  return v(
    `Oh nice. ${b} hits ${s}. Fun.`,
    `Yeah, ${b} forks ${s}. Tricky.`,
    `Okay, ${b} attacks ${s} at once. Very fun.`,
  );
};

const trapped: Frame = (p, ctx) => {
  const target = pieceArg(p.args, 'target', 'piece');
  const t = target ? ctx.refer(target) : 'that piece';
  return v(
    `${t} has nowhere to go. Poor thing.`,
    `Yeah, ${t} is stuck. It lived a good life.`,
    `Hmm. ${t} is trapped. Sad for us, honestly.`,
  );
};

const sacrifice: Frame = (p, ctx) => {
  const piece = pieceArg(p.args, 'piece', 'target');
  const t = piece ? ctx.refer(piece) : 'the piece';
  const name = piece ? pieceName(piece, ctx) : 'piece';
  const sound = boolArg(p.args, 'sound') ?? true;
  if (sound) {
    return v(
      `Oh wow. ${t} just goes. That's fun.`,
      `Yeah, ${t} goes, and it works. Very fun.`,
      `Okay, so ${t} is a sacrifice. And it's sound. Nice.`,
    );
  }
  return v(
    `Hmm. ${t} goes, and I think it's dubious.`,
    `Oh no. My beautiful ${name}. It lived a good life.`,
    `Okay, so ${t} is a sacrifice. Yeah, a bit dubious.`,
  );
};

const onlyMove: Frame = () =>
  v(
    `Yeah, this was the only move. Good spot.`,
    `Okay, so nothing else works here. Nice find.`,
    `Hmm, everything else loses. Yeah, that's the one.`,
  );

const swing: Frame = (p) => {
  const before = numArg(p.args, 'winBefore', 'before');
  const after = numArg(p.args, 'winAfter', 'after');
  if (before === undefined || after === undefined) {
    return v(
      `Okay, so the evaluation moved a lot. Yeah.`,
      `That's a big swing. Sad for us.`,
      `Hmm. The evaluation moved. That one hurts a little.`,
    );
  }
  const b = Math.round(before);
  const a = Math.round(after);
  if (a >= b) {
    return v(
      `Oh nice, ${b} up to ${a}. Fun.`,
      `Yeah, ${b} to ${a}. That's the good stuff.`,
      `Okay, so ${b} to ${a}. Very fun.`,
    );
  }
  return v(
    `Okay, so we go from ${b} to ${a}. Yeah.`,
    `That's ${b} to ${a}. Sad for us.`,
    `Hmm. ${b} down to ${a}. That one hurts a little.`,
  );
};

const bestMove: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san', 'best') ?? 'that');
  return v(
    `${m}, maybe. Yeah, actually. Let's play ${m}.`,
    `The idea is ${m}. Yeah, I think so. Let's play ${m}.`,
    `Hmm, ${m}. Okay, yeah. Let's play ${m}.`,
  );
};

const bestDoes: Frame = (p, ctx) => {
  const m = ctx.move(strArg(p.args, 'move', 'san', 'best') ?? 'that');
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
  else does = `keeps everything safe`;
  return v(
    `${m} ${does}, maybe. Yeah, actually. Let's play ${m}.`,
    `Considering ${m}. It ${does}. Okay, so yeah. Let's play ${m}.`,
    `Hmm, ${m} ${does}. Yeah, I think so. Let's play ${m}.`,
  );
};

const LESSONS: Record<string, [string, string, string]> = {
  check_landing_square: [
    `Okay, before a piece moves, let's check the squares around it.`,
    `Yeah, empty squares in your own camp deserve a quick look.`,
    `Hmm, let's ask what lands there before we commit a piece.`,
  ],
  count_attackers: [
    `Okay, let's count attackers and defenders before leaving a piece there.`,
    `Yeah, if they attack it more than we defend it, it's hanging.`,
    `Hmm, let's count. More attackers than defenders means trouble.`,
  ],
  look_for_captures: [
    `Okay, let's always check the captures first. Even the funny ones.`,
    `Yeah, every move, let's look at what we can take.`,
    `Hmm, free stuff is fun. Let's look for captures every move.`,
  ],
  checks_first: [
    `Okay, checks first. Always. Then captures, then everything else.`,
    `Yeah, let's look at every check before anything else.`,
    `Hmm, a check can change everything. Let's look at those first.`,
  ],
  defend_back_rank: [
    `Okay, let's give the king a little breathing room early.`,
    `Yeah, a back rank with no escape square is tricky.`,
    `Hmm, let's make a luft before the rooks come knocking.`,
  ],
  see_their_threat: [
    `Okay, before we move, let's ask what they want to do.`,
    `Yeah, their last move had an idea. Let's find it first.`,
    `Hmm, let's always check their threat before playing our own.`,
  ],
  dont_trade_behind: [
    `Okay, when we're down material, let's keep pieces on the board.`,
    `Yeah, trading while behind just makes their extra piece bigger.`,
    `Hmm, fewer pieces helps whoever is ahead. Let's avoid trades.`,
  ],
  push_the_passer: [
    `Okay, a passed pawn wants to run. Let's push it.`,
    `Yeah, passed pawns are fun. Let's give this one some love.`,
    `Hmm, let's push the passer before they can blockade it.`,
  ],
  keep_the_shield: [
    `Okay, the pawns in front of the king are its house. Let's keep them.`,
    `Yeah, let's keep the king's pawn cover unless there's a real reason.`,
    `Hmm, moving those pawns lets everything in. Let's hold them.`,
  ],
  one_defender_two_jobs: [
    `Okay, one piece doing two jobs usually can't do either. Let's check.`,
    `Yeah, let's ask what happens when the busy defender gets pulled away.`,
    `Hmm, an overloaded piece is a fun target. Let's find them.`,
  ],
  keep_the_tension: [
    `Okay, not every tension needs resolving. Sometimes let's just wait.`,
    `Yeah, let's keep the tension until releasing it actually helps us.`,
    `Hmm, let's ask who benefits before we release the tension.`,
  ],
  book_ends_here: [
    `Okay, this is where the book ends. Now it's fun.`,
    `Yeah, from here it's just chess. Let's think for ourselves.`,
    `Hmm, off book now. Let's find good squares for everything.`,
  ],
  remember_this: [
    `Okay, let's remember this pattern. It comes back a lot.`,
    `Yeah, this one is worth remembering. It's a fun idea.`,
    `Hmm, let's file this away. Same trick, different game.`,
  ],
};

const LESSON_FALLBACK: [string, string, string] = [
  `Okay, let's take the lesson and move on. That's chess.`,
  `Yeah, that's a learning moment. Let's keep it in mind.`,
  `Hmm, chess is tricky. Let's remember this one.`,
];

const lesson: Frame = (p) => {
  const concept = strArg(p.args, 'concept', 'id') ?? '';
  return v(...(LESSONS[concept] ?? LESSON_FALLBACK));
};

// ---------------------------------------------------------------------------
// Prosody.
// ---------------------------------------------------------------------------

/** Quieter as the loss grows: the reaction gets shorter, never louder. */
function reaction(epLoss: number, lead: SituationKind): string {
  if (PRAISE_LEADS.has(lead)) return epLoss < 0.02 ? 'Oh, nice.' : '';
  if (epLoss < 0.045) return '';
  if (epLoss < 0.1) return 'Hmm, okay.';
  if (epLoss < 0.2) return 'Oh, hmm.';
  return 'Oh no.';
}

const closer = (lead: SituationKind): string => (PRAISE_LEADS.has(lead) ? 'Fun.' : '');

// ---------------------------------------------------------------------------
// Shape: split anything over twelve words, one filler at most, one "!" at most.
// ---------------------------------------------------------------------------

function shape(slots: Record<Slot, string>, ctx: RenderContext): Record<Slot, string> {
  const out = { ...slots };
  const connectives = ctx.lexicon.connectives.length > 0 ? ctx.lexicon.connectives : ['and', 'so', 'but'];
  for (const slot of Object.keys(out) as Slot[]) {
    out[slot] = shorten(out[slot], connectives);
  }
  if (out.whatHappened && !startsWithFiller(out.whatHappened)) {
    out.whatHappened = `Okay. ${out.whatHappened}`;
  }
  let bangs = 0;
  for (const slot of ['headline', 'whatHappened', 'whyItMatters', 'betterWas', 'lesson'] as Slot[]) {
    out[slot] = out[slot].replace(/!/g, () => (bangs++ === 0 ? '!' : '.'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The grammar.
// ---------------------------------------------------------------------------

const base = neutralGrammar('rosen');

export const rosen: PersonaGrammar = {
  ...base,
  lexicon: {
    ...base.lexicon,
    captureVerb: 'takes',
    address: 'you guys',
    intensifiers: ['actually', 'really', 'so'],
    praise: ['fun', 'nice', 'tricky'],
    blame: ['so so bad', 'dubious', 'a little loose'],
    fillers: ROSEN_FILLERS,
    connectives: ['and', 'so', 'cuz', 'but'],
  },
  syntax: {
    ...base.syntax,
    maxSentenceWords: MAX_WORDS,
    fragments: true,
    chainWithAnd: false,
    questionRate: 0,
    verdictFirst: false,
    preferHere: false,
    imperativeAdvice: false,
  },
  prosody: {
    ...base.prosody,
    exclamations: 1,
    capsPeak: false,
    reaction,
    closer,
    sentenceCase: true,
  },
  events: {
    reviewStart: [
      base.events.reviewStart?.[0] ?? 'Okay, let’s hop into this one.',
      'Okay. Let’s hop in and see what happened.',
      'Yeah, let’s have a look at this one.',
    ],
    brilliant: [
      base.events.brilliant?.[0] ?? 'Ooh. Oh, that’s nice. That’s really nice.',
      'Oh wow. Okay, that’s fun. That’s really fun.',
      'Oh yeah. That’s the kind of move I like.',
    ],
    great: [
      base.events.great?.[0] ?? 'Yeah, that’s the move. Good spot.',
      'Yeah, okay. That’s the one. Nice.',
      'Oh yeah, that’s it. Good spot.',
    ],
    blunder: [
      base.events.blunder?.[0] ?? 'Oh no. My beautiful knight.',
      'Oh no. Oh, that was so so bad.',
      'Oh. Yeah, that one hurts a little.',
    ],
    mistake: [
      base.events.mistake?.[0] ?? 'Hmm. Maybe not that one. It’s okay though.',
      'Hmm. Yeah, I think there was better. It’s okay.',
      'Okay, so that’s a little dubious. It happens.',
    ],
    miss: [
      base.events.miss?.[0] ?? 'Oh, there was something here. Someone call an ambulance.',
      'Oh wow, there was something here. Okay. Let’s look.',
      'Hmm. Yeah, something got missed here. Let’s see.',
    ],
    bookExit: [
      base.events.bookExit?.[0] ?? 'Okay, we’re off book now. Fun.',
      'Okay, so this is where the book ends. Now it’s fun.',
      'Yeah, we’re on our own now. Let’s see.',
    ],
    comeback: [
      base.events.comeback?.[0] ?? 'Oh wow, we’re back. That’s actually amazing.',
      'Oh yeah. Okay, we’re back in this. Nice.',
      'Wow. Yeah, we’re actually back. Fun.',
    ],
    collapse: [
      base.events.collapse?.[0] ?? 'Oh no. Oh no. Yeah, that one hurts.',
      'Oh. Oh no. It was going so well.',
      'Oh no. Yeah. That was so so bad.',
    ],
    highAccuracy: [
      base.events.highAccuracy?.[0] ?? 'Yeah, that was a good game. Genuinely nice stuff.',
      'Oh nice. That was a really clean game.',
      'Yeah, good game. That was fun to go through.',
    ],
    lowAccuracy: [
      base.events.lowAccuracy?.[0] ?? 'Rough one. I’ve had way worse, honestly.',
      'Yeah, rough one. It happens to all of us.',
      'Hmm. Rough one. Okay, we learn and we move on.',
    ],
    longGame: [
      base.events.longGame?.[0] ?? 'Long game. Sometimes you have to be patient.',
      'Yeah, long one. Okay, let’s keep going.',
      'Long game. That’s fine. Patience is a skill.',
    ],
    reviewEnd: [
      base.events.reviewEnd?.[0] ?? 'Okay, that’s it. Hope you enjoyed. I’ll see you soon.',
      'Okay, that’s the game. Hope that was fun.',
      'Yeah, that’s it. Thanks for hanging out.',
    ],
    random: [
      base.events.random?.[0] ?? 'Chess is fun.',
      'Yeah. Chess is tricky.',
      'Okay, chess is hard, but it’s fun.',
    ],
  },
  frames: {
    verdict,
    hangs,
    forked,
    forks,
    trapped,
    sacrifice,
    only_move: onlyMove,
    swing,
    best_move: bestMove,
    best_does: bestDoes,
    lesson,
  },
  shape,
};
