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
 * Hikaru — The Deadpan Grandmaster.
 *
 * Built from the ten voice rules in the personas spec: "let's go ___" announces
 * the best move and "here" beats a square name; the verdict lands in the first
 * four words and the note is at most two sentences a slot; verdicts are flat
 * declaratives built on "just"; "I mean" hedges the reasoning, never the
 * verdict; no intensifiers; indifference, never anger; no exclamation marks,
 * no questions, no intro or outro. Silence is a valid output, so the closer
 * says nothing.
 *
 * Chess tokens only ever enter a sentence through `ctx.refer`, `ctx.square`
 * and `ctx.move`, so the validator can never find an invented one.
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

/** Material, unadorned. */
export function materialWords(n: number): string {
  const a = Math.abs(Math.round(n));
  if (a >= 9) return 'the queen';
  if (a >= 5) return 'a rook';
  if (a >= 3) return 'a piece';
  if (a === 2) return 'two pawns';
  if (a === 1) return 'a pawn';
  return 'nothing';
}

function list(ctx: RenderContext, pieces: PieceRef[]): string {
  const names = pieces.map((x) => ctx.refer(x));
  if (names.length === 0) return 'everything';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Win percentage, said flat. */
function standing(win: number): string {
  if (win >= 70) return 'winning';
  if (win >= 56) return 'better';
  if (win > 44) return 'equal';
  if (win > 30) return 'worse';
  return 'losing';
}

const LOSS_CLASSES = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

// ---------------------------------------------------------------------------
// Frames. Verdict in the first four words; two sentences at most.
// ---------------------------------------------------------------------------

/** Rule 2: the lead situation, said as a verdict, in four words or fewer. */
const LEAD_VERDICTS: Partial<Record<SituationKind, string>> = {
  allowed_mate: "That's just mate.",
  missed_mate: 'Misses a mate.',
  hung_piece: 'Just hangs a piece.',
  under_defended: 'Leaves it under-defended.',
  walked_into_fork: 'Drops a piece to a fork.',
  walked_into_pin: 'Walks into a pin.',
  walked_into_skewer: 'Walks into a skewer.',
  missed_capture: 'Misses a free piece.',
  ignored_threat: 'Ignores the threat.',
  trapped_piece: 'Traps its own piece.',
  traded_behind: 'Trades while behind.',
  unsound_sacrifice: 'That sac just loses.',
  quiet_loss: 'Just slightly worse now.',
  back_rank: 'Back rank is weak.',
  king_exposed: 'King is just open.',
  overloaded: 'One defender, two jobs.',
  zugzwang: "That's just zugzwang.",
  sound_sacrifice: 'The sac just works.',
  created_fork: "That's a fork. Simple.",
  created_discovered: 'Discovered attack. Simple.',
  only_move: 'The only move. Okay.',
  mate_delivered: "That's mate. GG.",
  passed_pawn: 'Passed pawn. Push it.',
  promotion: 'Promotes. Simple.',
  book: 'Still theory.',
  left_book: 'Out of theory now.',
  best: "That's the move.",
  good: "That's fine.",
  fortress: "It's just a fortress.",
};

const verdict: Frame = (p, ctx) => {
  const san = strArg(p, ['move', 'san', 'played']);
  const m = san ? ctx.move(san) : 'That';
  const cls = strArg(p, ['classification', 'class']) ?? '';
  const lead = strArg(p, ['lead', 'kind']) as SituationKind | undefined;
  const fromLead = lead ? LEAD_VERDICTS[lead] : undefined;

  if (cls === 'brilliant' || cls === 'great') {
    return [fromLead ?? "That's the move. Obviously.", `${m} is just winning.`, `${m}. Yeah, that's it.`];
  }
  if (cls === 'best' || cls === 'excellent' || cls === 'good' || cls === 'book') {
    return [fromLead ?? "That's fine.", `${m} is fine.`, `${m}. Simple.`];
  }
  if (cls === 'miss') {
    return [fromLead ?? 'Misses the win.', `${m} just misses it.`, `${m}. There was more.`];
  }
  if (cls === 'mistake' || cls === 'inaccuracy') {
    return [fromLead ?? "It's not great.", `${m} is just worse.`, `${m}. I mean, not that.`];
  }
  if (cls === 'blunder' || LOSS_CLASSES.has(cls)) {
    return [fromLead ?? "That's just losing.", `${m} is just losing.`, `${m}. That's just bad.`];
  }
  return [fromLead ?? 'Okay. Fine.', `${m}. Okay.`, `${m}. Fine, basically.`];
};

const hangs: Frame = (p, ctx) => {
  const piece = pieceArg(p, ['piece', 'target']);
  const attackers = piecesArg(p, ['attackers', 'by']);
  const it = piece ? ctx.refer(piece) : 'the piece';
  const taker = attackers[0] ? ctx.refer(attackers[0]) : 'anything';
  return [
    `${it} is just hanging. ${taker} takes it.`,
    `${it} just drops. Nobody is defending it.`,
    `Basically ${it} is gone. ${taker} takes, and that's it.`,
  ];
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p, ['by', 'attacker', 'piece']);
  const targets = piecesArg(p, ['targets', 'pieces']);
  const attacker = by ? ctx.refer(by) : 'their piece';
  const hit = list(ctx, targets);
  return [
    `${attacker} lands, hitting ${hit}. One of them survives.`,
    `${attacker} hits ${hit}. That's just a fork.`,
    `I mean, ${attacker} hits ${hit}. You lose one.`,
  ];
};

const missedCapture: Frame = (p, ctx) => {
  const target = pieceArg(p, ['target', 'piece']);
  const it = target ? ctx.refer(target) : 'the piece';
  return [
    `${it} was just free. Takes takes takes.`,
    `I mean, ${it} was hanging. You didn't take it.`,
    `${it} was free here. Simple.`,
  ];
};

const swing: Frame = (p) => {
  const before = numArg(p, ['before', 'winBefore', 'from']);
  const after = numArg(p, ['after', 'winAfter', 'to']);
  if (before === undefined || after === undefined) {
    return [`The eval just flips.`, `I mean, that's the game.`, `It's just worse now.`];
  }
  const b = Math.round(before);
  const a = Math.round(after);
  return [
    `${b} to ${a}. I mean, it was ${standing(b)} before this.`,
    `${b} to ${a}. That's just a reality.`,
    `${b} to ${a}. It is what it is.`,
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
    return [`Material is level.`, `Nothing changes hands.`, `Still even on material.`];
  }
  if (lost < 0) {
    return [`That's ${amount}. Simple.`, `You just win ${amount}.`, `Up ${amount}. Okay.`];
  }
  return [`That's ${amount}, gone.`, `You just lose ${amount}.`, `Down ${amount}. It is what it is.`];
};

/** Rule 1: the best move is announced with "let's go". */
const bestMove: Frame = (p, ctx) => {
  const san = strArg(p, ['move', 'best', 'san']);
  const m = san ? ctx.move(san) : 'the other move';
  return [`Let's go ${m}.`, `Let's go ${m}. Simple.`, `Let's go ${m} here. Basically.`];
};

const bestDoes: Frame = (p, ctx) => {
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
  else does = 'just holds';
  return [`It ${does}. Simple.`, `That ${does}. That's just a reality.`, `I mean, it ${does}. Of course.`];
};

const LESSONS: Record<string, string[]> = {
  check_landing_square: [
    'That square was available. Worth a look.',
    'Look at the square you leave open. Basically that.',
    'The square was there. I mean, it was just there.',
  ],
  count_attackers: [
    'Count attackers, count defenders. Simple.',
    'Attackers versus defenders. It is what it is.',
    'More attackers than defenders means it hangs. Basically.',
  ],
  look_for_captures: [
    'Look at captures first. Simple.',
    'Takes takes takes. Look for it.',
    'I mean, free pieces are free. Take them.',
  ],
  checks_first: [
    'Checks first. Then everything else.',
    'Look at every check. Of course.',
    'A check is free to look at. So look.',
  ],
  defend_back_rank: [
    'Give the king a square. Simple.',
    'Back rank needs a hole. Make one.',
    'I mean, one pawn move fixes this.',
  ],
  see_their_threat: [
    'Look at what they want first. Then play.',
    'Their move has an idea. Find it.',
    'What does the last move threaten. Basically that.',
  ],
  dont_trade_behind: [
    "Down material, don't trade. Simple.",
    'Trades help the side ahead. That is just a reality.',
    'I mean, keep pieces on when behind.',
  ],
  push_the_passer: [
    'Push the passed pawn. Simple.',
    'Passed pawns run. Let it run.',
    'I mean, the pawn is the whole game here.',
  ],
  keep_the_shield: [
    "Don't move the pawns in front of the king.",
    'King pawns stay home. Basically.',
    'I mean, every push near the king is a hole.',
  ],
  one_defender_two_jobs: [
    'One defender, two jobs. It fails.',
    'Find the piece doing two things. Simple.',
    'I mean, one piece cannot hold both.',
  ],
  keep_the_tension: [
    "Don't release the tension. Let them.",
    'Keep the tension. Basically that.',
    'Resolving it helps them. So what, keep it.',
  ],
  book_ends_here: [
    'Theory ends. Now you think.',
    'Know where the book stops. Simple.',
    'I mean, out of theory is fine. Out of ideas is not.',
  ],
  remember_this: [
    'Remember this one. It comes back.',
    'This pattern shows up again. Basically always.',
    'I mean, just remember the shape.',
  ],
};

const lesson: Frame = (p, ctx) => {
  const concept = strArg(p, ['concept', 'id', 'lesson']) ?? 'remember_this';
  const sq = strArg(p, ['square']);
  const base = LESSONS[concept] ?? LESSONS.remember_this!;
  if (concept === 'check_landing_square' && sq) {
    return [
      `${ctx.square(sq)} was available. Worth a look.`,
      `Look at ${ctx.square(sq)} before you move. Basically that.`,
      `${ctx.square(sq)} was there. I mean, it was just there.`,
    ];
  }
  return [...base];
};

// ---------------------------------------------------------------------------
// Shape: the tics as a final pass.
// ---------------------------------------------------------------------------

const SENTENCE_END = /(?<=[.!?])\s+/;
const INTENSIFIER = /\b(?:very|really|extremely|incredibly|super|totally|absolutely)\s+/gi;
const JUST_AFTER = /\b(is|was|are|were)\b(?!\s+just\b)(?!\s*$)/;
const JUST_BEFORE = /\b(drops|loses|hangs|wins|takes|lands|hits|leaves|walks|misses|gives|blunders)\b/i;

/** Rule 10: no exclamation marks, no questions. */
const flatten = (text: string): string => text.replace(/[!?]+/g, '.').replace(/\.{2,}/g, '.');

/** Rule 5: no intensifiers, no "very". */
const unadorn = (text: string): string => text.replace(INTENSIFIER, '');

/** Rule 2: at most two sentences a slot. */
function twoSentences(text: string): string {
  const parts = text.split(SENTENCE_END).filter(Boolean);
  return parts.slice(0, 2).join(' ');
}

/**
 * Rule 3: a flat declarative built on "just" — inserted once per note, where a
 * verb allows. The observation and consequence slots are tried before the
 * headline so a four-word verdict such as "Drops a piece to a fork." keeps its
 * shape; the best move is never touched.
 */
function insertJust(slots: Record<Slot, string>): void {
  const all = Object.values(slots).join(' ');
  if (/\bjust\b/i.test(all)) return;
  for (const slot of ['whatHappened', 'whyItMatters', 'headline', 'lesson'] as Slot[]) {
    const text = slots[slot];
    const before = text.match(JUST_BEFORE);
    if (before && before.index !== undefined) {
      const i = before.index;
      const verb = before[0];
      const startsSentence = i === 0 || /[.!?]\s+$/.test(text.slice(0, i));
      const just = startsSentence ? 'Just' : 'just';
      const rest = startsSentence ? verb.charAt(0).toLowerCase() + verb.slice(1) : verb;
      slots[slot] = `${text.slice(0, i)}${just} ${rest}${text.slice(i + verb.length)}`;
      return;
    }
    const after = text.match(JUST_AFTER);
    if (after && after.index !== undefined) {
      const end = after.index + after[0].length;
      slots[slot] = `${text.slice(0, end)} just${text.slice(end)}`;
      return;
    }
  }
}

export function shapeHikaru(
  slots: Record<Slot, string>,
  _ctx: RenderContext,
): Record<Slot, string> {
  const pass = (text: string): string =>
    twoSentences(unadorn(flatten(text)))
      .replace(/\s{2,}/g, ' ')
      .trim();
  const shaped: Record<Slot, string> = {
    headline: pass(slots.headline),
    whatHappened: pass(slots.whatHappened),
    whyItMatters: pass(slots.whyItMatters),
    betterWas: pass(slots.betterWas),
    lesson: pass(slots.lesson),
  };
  insertJust(shaped);
  return shaped;
}

// ---------------------------------------------------------------------------
// Events: the spec's line first, then two more in the same voice.
// ---------------------------------------------------------------------------

const EXTRA_EVENTS: Record<Trigger, string[]> = {
  reviewStart: ["Okay. Let's go.", "Let's see. Okay."],
  brilliant: ["Yeah, that's it. I'm impressed. Or I was, until the next move.", "Okay, that's the move. Simple."],
  great: ["Yeah, that's the move. Of course.", 'Fine. Actually that is the only move.'],
  blunder: ["That's just losing.", 'I mean, that just hangs everything. It is what it is.'],
  mistake: ["Yeah, that's not it.", 'I mean, it is worse now. Who cares, keep going.'],
  miss: ['There was a win. It happens.', 'I mean, you had it. You just did not play it.'],
  bookExit: ['Okay, out of theory.', 'Theory is done. Now it is just chess.'],
  comeback: ["Okay. It's a game again, actually.", 'I mean, somehow this is back to equal. Sure.'],
  collapse: ['This was winning. Now it is not.', 'I mean, it was completely winning. And then it just was not.'],
  highAccuracy: ['Clean game. Okay.', 'Yeah, that is basically clean. Fine.'],
  lowAccuracy: ["It's fine. It happens.", 'I mean, everyone has these games. Who cares.'],
  longGame: ['Still going.', 'Yeah, this one is long. Okay.'],
  reviewEnd: ["That's it. Next.", 'Okay, done. Next game.'],
  random: ['So what. Keep going.', 'Nobody cares. Next move.'],
};

// ---------------------------------------------------------------------------
// The grammar.
// ---------------------------------------------------------------------------

export function buildHikaru(): PersonaGrammar {
  const base = neutralGrammar('hikaru');
  const events: Partial<Record<Trigger, string[]>> = {};
  for (const trigger of Object.keys(EXTRA_EVENTS) as Trigger[]) {
    events[trigger] = [...(base.events[trigger] ?? []), ...EXTRA_EVENTS[trigger]];
  }

  return {
    ...base,
    lexicon: {
      ...base.lexicon,
      captureVerb: 'takes',
      address: 'guys',
      intensifiers: [],
      praise: ['the move', 'clean', 'fine', 'simple'],
      blame: ['terrible', 'garbage', 'just losing', 'not great'],
      fillers: ['I mean', 'um', 'okay', 'basically', 'actually'],
      connectives: ['and', 'so', 'but'],
    },
    syntax: {
      maxSentenceWords: 14,
      fragments: true,
      chainWithAnd: false,
      questionRate: 0,
      verdictFirst: true,
      preferHere: true,
      imperativeAdvice: false,
    },
    prosody: {
      exclamations: base.budgets.exclamations,
      capsPeak: false,
      reaction: () => '',
      closer: () => '',
      sentenceCase: true,
    },
    events,
    frames: {
      verdict,
      hangs,
      forked,
      missed_capture: missedCapture,
      swing,
      material_delta: materialDelta,
      best_move: bestMove,
      best_does: bestDoes,
      lesson,
    },
    shape: shapeHikaru,
  };
}

export const hikaru: PersonaGrammar = buildHikaru();
