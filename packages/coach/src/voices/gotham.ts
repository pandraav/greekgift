import type { PieceRef, SituationKind } from '@greekgift/engine';

import type {
  Frame,
  PersonaGrammar,
  Proposition,
  RenderContext,
  Slot,
} from '../contracts.ts';
import { findPersona, type Trigger } from '../personas.ts';
import { neutralGrammar } from './neutral.ts';

/**
 * GothamChess — The Hype Merchant.
 *
 * Built from the ten voice rules in the personas spec: reaction first, never a
 * verdict; fragments of at most twelve words; repetition as emphasis; the
 * `Oh.` → `Oh my god.` → `Oh my goodness.` → stutter ladder; material in words,
 * never numbers; exactly one rhetorical question aimed at the move; at most two
 * exclamation marks and one capitalised word; an absurd simile snapped back
 * with "Anyway,".
 *
 * Chess tokens (pieces, squares, moves) only ever enter a sentence through
 * `ctx.refer`, `ctx.square` and `ctx.move`, so the validator can never find an
 * invented one in Levy's mouth.
 */

// ---------------------------------------------------------------------------
// Argument readers. The planner's argument names are not part of the frozen
// contract, so every reader accepts the plausible spellings and falls back to
// the first value of the right shape.
// ---------------------------------------------------------------------------

const isPiece = (v: unknown): v is PieceRef =>
  typeof v === 'object' && v !== null && 'piece' in v && 'square' in v;

function pieceArg(p: Proposition, keys: string[]): PieceRef | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (isPiece(v)) return v;
  }
  for (const v of Object.values(p.args)) if (isPiece(v)) return v;
  return undefined;
}

function piecesArg(p: Proposition, keys: string[]): PieceRef[] {
  for (const k of keys) {
    const v = p.args[k];
    if (Array.isArray(v) && v.every(isPiece)) return v as PieceRef[];
  }
  for (const v of Object.values(p.args)) {
    if (Array.isArray(v) && v.length > 0 && v.every(isPiece)) return v as PieceRef[];
  }
  return [];
}

function strArg(p: Proposition, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function numArg(p: Proposition, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = p.args[k];
    if (typeof v === 'number') return v;
  }
  return undefined;
}

const boolArg = (p: Proposition, key: string): boolean => p.args[key] === true;

// ---------------------------------------------------------------------------
// Words.
// ---------------------------------------------------------------------------

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const words = (n: number): string => SMALL[Math.round(n)] ?? String(Math.round(n));

/** Rule 5: material in words, never numbers. */
export function materialWords(n: number): string {
  const a = Math.abs(Math.round(n));
  if (a >= 9) return 'a whole queen';
  if (a >= 5) return 'a whole rook';
  if (a >= 3) return 'a whole piece';
  if (a === 2) return 'two pawns';
  if (a === 1) return 'a free pawn';
  return 'nothing';
}

/** "the knight on d7 and the bishop on b7" — or "both of them" repetition. */
function list(ctx: RenderContext, pieces: PieceRef[]): string {
  const names = pieces.map((x) => ctx.refer(x));
  if (names.length === 0) return 'everything';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const LOSS_CLASSES = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

const PRAISE_LEADS = new Set<SituationKind>([
  'best',
  'good',
  'book',
  'left_book',
  'sound_sacrifice',
  'created_fork',
  'created_discovered',
  'only_move',
  'passed_pawn',
  'promotion',
  'mate_delivered',
  'fortress',
]);

// ---------------------------------------------------------------------------
// Frames. Every variant is a chain of bursts, none longer than twelve words.
// ---------------------------------------------------------------------------

const verdict: Frame = (p, ctx) => {
  const san = strArg(p, ['move', 'san', 'played']);
  const m = san ? ctx.move(san) : 'That';
  const cls = strArg(p, ['classification', 'class']) ?? '';
  const lead = strArg(p, ['lead', 'kind']);
  const lost = LOSS_CLASSES.has(cls) || (lead ? !PRAISE_LEADS.has(lead as SituationKind) : false);

  if (cls === 'brilliant') {
    return [`Okay, WAIT. ${m}.`, `${m}. That's insane.`, `${m}. Not even joking, that's it.`];
  }
  if (cls === 'great' || cls === 'best' || cls === 'excellent') {
    return [`Ooh. ${m}. That's the one.`, `${m}. Boom.`, `${m}. Yes. That's the move.`];
  }
  if (cls === 'good' || cls === 'book') {
    return [`${m}. Fine. Totally fine.`, `Okay so, ${m}. Sure.`, `${m}. Nothing wrong with that.`];
  }
  if (cls === 'miss') {
    return [`${m}? It was RIGHT there.`, `${m}. You walked past it.`, `Wait. ${m}? Come on.`];
  }
  if (cls === 'mistake' || cls === 'inaccuracy') {
    return [`Eh. ${m}? Not it.`, `${m}. Not that one. Close, but no.`, `Hmm. ${m}? I've seen worse.`];
  }
  if (cls === 'blunder' || lost) {
    return [`${m}? No no no.`, `Not ${m}. Come on. What is that?`, `${m}. What are you doing?`];
  }
  return [`${m}. Okay.`, `Okay so, ${m}.`, `${m}. Look at that.`];
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p, ['by', 'attacker', 'piece']);
  const targets = piecesArg(p, ['targets', 'pieces']);
  const attacker = by ? ctx.refer(by) : 'their piece';
  const hit = list(ctx, targets);
  const horse = by?.piece === 'N' ? 'The horse.' : 'That piece.';
  return [
    `${attacker} drops in. Now ${hit}. Both getting hit. Both of them.`,
    `${attacker} lands. ${horse} Hitting ${hit}. Same time.`,
    `Look. ${attacker} comes in. Hits ${hit}. Two things at once. Two.`,
  ];
};

const hangs: Frame = (p, ctx) => {
  const piece = pieceArg(p, ['piece', 'target']);
  const attackers = piecesArg(p, ['attackers', 'by']);
  const it = piece ? ctx.refer(piece) : 'that piece';
  const taker = attackers[0] ? ctx.refer(attackers[0]) : 'anything';
  return [
    `${it} is just hanging. Nobody defends it. Nobody.`,
    `${it}, hung. Free. ${taker} takes it for nothing.`,
    `Bro. ${it} is sitting there like a parked car. Anyway, ${taker} takes it.`,
  ];
};

const swing: Frame = (p) => {
  const before = numArg(p, ['before', 'winBefore', 'from']);
  const after = numArg(p, ['after', 'winAfter', 'to']);
  if (before === undefined || after === undefined) {
    return [
      `The whole position, gone. Just gone.`,
      `That was the game. Right there.`,
      `And boom, the evaluation flips. Flips.`,
    ];
  }
  const b = Math.round(before);
  const a = Math.round(after);
  if (a >= b) {
    return [
      `${b} up to ${a}. Boom.`,
      `From ${b} to ${a}. That's the move doing that.`,
      `${b} to ${a}. Up we go. Up.`,
    ];
  }
  return [
    `${b} down to ${a}, gone.`,
    `From ${b} to ${a}. One move. One.`,
    `${b} to ${a}. That's the whole game, right there.`,
  ];
};

const materialDelta: Frame = (p) => {
  // `materialGain` is the planner's best-minus-played figure (a loss for the
  // mover when positive); a plain `delta` is signed from the mover's view.
  const gain = numArg(p, ['materialGain']);
  const delta = numArg(p, ['delta', 'value', 'material']);
  const lost = gain !== undefined ? gain : delta !== undefined ? -delta : 0;
  const amount = materialWords(lost);
  if (lost === 0) {
    return [`Material stays level. Level.`, `Nothing changes hands. Nothing.`, `Even on material. Still even.`];
  }
  if (lost < 0) {
    return [
      `That's ${amount}. ${capital(amount)}.`,
      `You pick up ${amount}. For free.`,
      `${capital(amount)}, just like that.`,
    ];
  }
  return [
    `That's ${amount}, gone. Gone.`,
    `You're giving away ${amount}. For nothing.`,
    `${capital(amount)}, straight in the bin. Anyway.`,
  ];
};

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const bestMove: Frame = (p, ctx) => {
  const san = strArg(p, ['move', 'best', 'san']);
  const m = san ? ctx.move(san) : 'the other move';
  return [`${m}. That's the move.`, `${m}. Boom. Done.`, `Look. ${m}. Simple.`];
};

const bestDoes: Frame = (p, ctx) => {
  const san = strArg(p, ['move', 'best', 'san']);
  const m = san ? ctx.move(san) : 'It';
  const captures = pieceArg(p, ['captures', 'target']);
  const forks = piecesArg(p, ['forks', 'targets']);
  const mateIn = numArg(p, ['mateIn', 'mate']);
  const check = boolArg(p, 'check');
  const gain = numArg(p, ['materialGain', 'delta']);
  let does: string;
  if (mateIn !== undefined) does = `is mate in ${words(mateIn)}`;
  else if (captures) does = `takes ${ctx.refer(captures)}`;
  else if (forks.length > 1) does = `hits ${list(ctx, forks)}`;
  else if (check) does = `comes with check`;
  else if (gain !== undefined && gain !== 0) does = `keeps ${materialWords(gain)}`;
  else does = 'holds everything together';
  return [`${m} ${does}. That's it.`, `${m} just ${does}. Come on.`, `And ${m} ${does}. Wow.`];
};

const LESSONS: Record<string, string[]> = {
  check_landing_square: [
    'Look at the empty squares on your own side first. That square was screaming.',
    'Before a piece moves, check the square it leaves open. Every time. Every.',
    'Empty squares next to your pieces are invitations. Stop sending them.',
  ],
  count_attackers: [
    'Count the attackers. Count the defenders. Then move.',
    'One defender, one attacker, fine. Two attackers? Not fine.',
    'If more of theirs point at it than yours protect it, it is hanging.',
  ],
  look_for_captures: [
    'Free stuff first. Always look at what you can take.',
    'Every move, ask: what can I take? Then ask it again.',
    'Captures, checks, then everything else. Captures were right there.',
  ],
  checks_first: [
    'Checks first. Always checks first. The king tells you where to go.',
    'Look at every check before anything else. Every single one.',
    'A check costs nothing to look at. Look at it.',
  ],
  defend_back_rank: [
    'Give the king a window. One pawn move, and this never happens.',
    'The back rank is a trap door. Put a hand on it.',
    'Rooks on the back rank need a king with an escape square. Make one.',
  ],
  see_their_threat: [
    'Before your move, ask what they want. Then stop it.',
    'Their last move had an idea. Find the idea. Then play.',
    'Look at their threat first. Yours can wait one move.',
  ],
  dont_trade_behind: [
    'Down material? Do not trade. Keep pieces on. Keep them on.',
    'When you are behind, trades help them. Make it messy instead.',
    'Fewer pieces, fewer chances. Stay complicated when you are down.',
  ],
  push_the_passer: [
    'Passed pawns must be pushed. That is the whole rule.',
    'A passed pawn is a criminal. Lock it up or push it.',
    'Push the passer. Push it. Everything else can wait.',
  ],
  keep_the_shield: [
    'The pawns in front of your king are a wall. Stop moving the wall.',
    'Every pawn push near your king is a hole. Holes let things in.',
    'Keep the shield. The king likes his little house.',
  ],
  one_defender_two_jobs: [
    'One piece, two jobs. It cannot do both. Never both.',
    'When a defender has two jobs, one of them is about to fail.',
    'Find the piece doing two jobs. Then give it a third. Anyway, that is theirs.',
  ],
  keep_the_tension: [
    'Do not release the tension. Let them do it. Let them.',
    'Keep the pieces pointed at each other. Resolving it helps them.',
    'The tension was your friend. You broke up with your friend.',
  ],
  book_ends_here: [
    'Theory ends. Thinking starts. That is where games are actually won.',
    'Out of book is fine. Out of ideas is not.',
    'Know where your opening stops. Know what it wants after that.',
  ],
  remember_this: [
    'Remember this one. Genuinely. Remember it.',
    'Put this position in your head. It comes back.',
    'This pattern shows up forever. Forever. Learn it now.',
  ],
};

const lesson: Frame = (p, ctx) => {
  const concept = strArg(p, ['concept', 'id', 'lesson']) ?? 'remember_this';
  const sq = strArg(p, ['square']);
  const base = LESSONS[concept] ?? LESSONS.remember_this!;
  if (concept === 'check_landing_square' && sq) {
    return [
      `Look at the empty squares on your own side first. ${ctx.square(sq)} was screaming.`,
      `Before a piece moves, check what it leaves open. ${ctx.square(sq)}, every time.`,
      `${ctx.square(sq)} was an invitation. Stop sending invitations.`,
    ];
  }
  return [...base];
};

// ---------------------------------------------------------------------------
// Shape: the tics as a final pass.
// ---------------------------------------------------------------------------

/** Rule 9: two exclamation marks across the whole note. */
const EXCLAMATION_BUDGET = findPersona('gotham').budgets.exclamations;

const OPENERS = /^(?:oh\b|no no no\b|okay so\b|okay,? wait\b|look\b|wait\b|bro\b|yo\b|hold on\b|eh\b|hmm\b|ooh\b|boom\b|wow\b)/i;
const SIMILE = /\blike an? \b/i;
const SENTENCE_END = /(?<=[.!?])\s+/;

/**
 * Split any sentence over twelve words into bursts. The cut goes at a comma
 * when one leaves a head short enough, otherwise at the last connective that
 * does; the tail is capitalised and cut again if it is still too long.
 */
function burst(sentence: string, max: number): string[] {
  const count = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  if (count(sentence) <= max) return [sentence];
  const candidates: { at: number; len: number; comma: boolean }[] = [];
  for (const m of sentence.matchAll(/,\s|\s—\s|\s(?:and|so|but|because)\s/g)) {
    const head = sentence.slice(0, m.index);
    const n = count(head);
    if (n >= 2 && n <= max) candidates.push({ at: m.index!, len: m[0].length, comma: m[0].startsWith(',') });
  }
  if (candidates.length === 0) {
    // No natural seam: cut at the last word boundary inside the limit, so the
    // twelve-word rule is a guarantee rather than a hope.
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    const head = words.slice(0, max).join(' ').replace(/[,;:\s]+$/, '');
    const tail = words.slice(max).join(' ');
    if (!tail) return [sentence];
    const first = /[.!?]$/.test(head) ? head : `${head}.`;
    return [first, ...burst(capital(tail), max)];
  }
  const cut = candidates.filter((c) => c.comma).pop() ?? candidates[candidates.length - 1]!;
  const head = sentence.slice(0, cut.at).replace(/[,\s]+$/, '');
  const tail = sentence
    .slice(cut.at + cut.len)
    .replace(/^[,\s—]+/, '')
    .replace(/^(?:and|so|but|because)\s+/i, '');
  if (!tail) return [sentence];
  const first = /[.!?]$/.test(head) ? head : `${head}.`;
  return [first, ...burst(capital(tail), max)];
}

function shapeSlot(text: string, opts: { max: number }): string {
  const sentences = text
    .split(SENTENCE_END)
    .filter(Boolean)
    .flatMap((s) => burst(s, opts.max));
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 1) {
    let s = sentences[i]!;
    const prev = sentences[i - 1];
    // Rule 10: a simile is always followed by the snap-back.
    if (prev && SIMILE.test(prev) && !/^anyway/i.test(s) && !SIMILE.test(s)) {
      s = `Anyway, ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
    }
    out.push(s);
  }
  let joined = out.join(' ');
  if (joined && SIMILE.test(joined) && !/\banyway\b/i.test(joined)) {
    joined = `${joined.replace(/[.!?]$/, '')}. Anyway.`;
  }
  return joined;
}

export function shapeGotham(
  slots: Record<Slot, string>,
  ctx: RenderContext,
): Record<Slot, string> {
  const max = ctx.syntax.maxSentenceWords;
  const shaped: Record<Slot, string> = {
    headline: shapeSlot(slots.headline, { max }),
    whatHappened: shapeSlot(slots.whatHappened, { max }),
    whyItMatters: shapeSlot(slots.whyItMatters, { max }),
    betterWas: shapeSlot(slots.betterWas, { max }),
    lesson: shapeSlot(slots.lesson, { max }),
  };

  // Rule 1: what happened opens on a reaction, never a verdict.
  if (shaped.whatHappened && !OPENERS.test(shaped.whatHappened)) {
    shaped.whatHappened = `Okay so. ${shaped.whatHappened}`;
  }

  // Rule 8 and 9 are budgets across the whole note, spent in slot order.
  let exclamations = EXCLAMATION_BUDGET;
  let questions = 1;
  let caps = 1;
  const order: Slot[] = ['headline', 'whatHappened', 'whyItMatters', 'betterWas', 'lesson'];
  for (const slot of order) {
    let text = shaped[slot];
    text = text.replace(/!/g, () => (exclamations-- > 0 ? '!' : '.'));
    text = text.replace(/\?/g, () => (questions-- > 0 ? '?' : '.'));
    text = text.replace(/\b[A-Z]{2,}\b/g, (word) => {
      if (caps > 0) {
        caps -= 1;
        return word;
      }
      return word.charAt(0) + word.slice(1).toLowerCase();
    });
    shaped[slot] = text;
  }
  return shaped;
}

// ---------------------------------------------------------------------------
// Prosody.
// ---------------------------------------------------------------------------

/** Rule 4: the ladder, in order, and never a stronger word. */
export function gothamReaction(epLoss: number, lead: SituationKind): string {
  if (PRAISE_LEADS.has(lead)) return '';
  if (epLoss >= 0.4) return 'Oh my goodness. Oh my goodness.';
  if (epLoss >= 0.25) return 'Oh my goodness.';
  if (epLoss >= 0.1) return 'Oh my god.';
  return 'Oh.';
}

const gothamCloser = (lead: SituationKind): string =>
  lead === 'allowed_mate' || lead === 'missed_mate' ? 'Chess is hard.' : '';

// ---------------------------------------------------------------------------
// Events: the spec's line first, then two more in the same voice.
// ---------------------------------------------------------------------------

const EXTRA_EVENTS: Record<Trigger, string[]> = {
  reviewStart: [
    'Okay so. Ladies and gentlemen, we have a game.',
    'Look. Sit down. We are going through this one.',
  ],
  brilliant: ['Wait. Wait wait wait. That is insane.', 'Bro. BRO. That is the move of the game.'],
  great: ['Yes. That one. That is exactly the one.', 'Boom. Nice. That is what you play.'],
  blunder: ['Oh my god. Oh my god. What was that?', 'No. No no no. Come on, bro.'],
  mistake: ["Eh. Not it. I'm not insulting you, you did fine.", 'Hmm. Nope. Close, though. Close.'],
  miss: ['It was there. RIGHT there. And you kept walking.', 'Bro. It was free. Free. Come on.'],
  bookExit: ['Okay so, book is over. Now you have to think.', 'Theory ends here. Now it is just you two.'],
  comeback: ['Hold on. Hold on. You are back in this? Wow.', 'Wait, this is a game again. This is a game.'],
  collapse: ['It was winning. It was SO winning. And now.', 'Oh my god. Oh my goodness. Gone. All of it.'],
  highAccuracy: ['Bro. Genuinely. That is a clean game.', 'Look at that. Look at it. Good game, my man.'],
  lowAccuracy: [
    "Rough. It happens. I've done worse, and I'm supposed to be good.",
    'Okay so, that one hurt. It happens to everyone. Everyone.',
  ],
  longGame: ['Still going. Still. Chess is hard, dude.', 'This game is longer than my videos. Anyway.'],
  reviewEnd: ["That's it. That's the game. Go play another one.", 'Done. Go queue another one. Come on.'],
  random: ['Chess is hard. Chess is so hard.', 'Anyway. Chess is hard, man.'],
};

// ---------------------------------------------------------------------------
// The grammar.
// ---------------------------------------------------------------------------

export function buildGotham(): PersonaGrammar {
  const base = neutralGrammar('gotham');
  const events: Partial<Record<Trigger, string[]>> = {};
  for (const trigger of Object.keys(EXTRA_EVENTS) as Trigger[]) {
    events[trigger] = [...(base.events[trigger] ?? []), ...EXTRA_EVENTS[trigger]];
  }

  return {
    ...base,
    lexicon: {
      ...base.lexicon,
      captureVerb: 'takes',
      address: 'bro',
      intensifiers: ['genuinely', 'actually', 'so'],
      praise: ['insane', 'brilliant', 'crazy good', 'nice', 'fine'],
      blame: ['a disaster', 'crazy', 'not it', 'rough'],
      fillers: ['okay so', 'look', 'come on', 'bro'],
      connectives: ['and', 'now', 'so', 'but'],
    },
    syntax: {
      maxSentenceWords: 12,
      fragments: true,
      chainWithAnd: false,
      questionRate: 0.25,
      verdictFirst: false,
      preferHere: false,
      imperativeAdvice: true,
    },
    prosody: {
      exclamations: base.budgets.exclamations,
      capsPeak: true,
      reaction: gothamReaction,
      closer: gothamCloser,
      sentenceCase: true,
    },
    events,
    frames: {
      verdict,
      forked,
      hangs,
      swing,
      material_delta: materialDelta,
      best_move: bestMove,
      best_does: bestDoes,
      lesson,
    },
    shape: shapeGotham,
  };
}

export const gotham: PersonaGrammar = buildGotham();
