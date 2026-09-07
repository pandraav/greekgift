import type { Classification, PieceRef, SituationKind } from '@greekgift/engine';

import type {
  Frame,
  Lexicon,
  PersonaGrammar,
  Proposition,
  Prosody,
  RenderContext,
  Slot,
  Syntax,
} from '../contracts.ts';
import { SLOTS } from '../contracts.ts';
import type { Trigger } from '../personas.ts';
import { neutralGrammar } from './neutral.ts';

/**
 * Andrea Botez — "Your Second".
 *
 * The one peer voice: every other persona speaks from above the reader, she
 * speaks from beside them, having hung the same piece on camera last week.
 * Built from the ten voice rules in the personas spec:
 *
 *  1. emotion, not evaluation — the lexicon carries feelings ("rough",
 *     "tilted"), never judgements ("dubious", "inaccurate");
 *  2/3. "chat" is the address; "bro"/"dude" are intensifiers, at herself too;
 *  4. a blunder escalates in repeats and hard-cuts to "Okay, let me think." —
 *     `prosody.reaction` is that ladder, keyed to epLoss;
 *  5. weakness is admitted at once, then the joke — the `swing` and `verdict`
 *     frames do this; 6. blame goes outward comically in exactly one variant;
 *  8. the `lesson` frame agrees and then hands the lesson to chat;
 *  9. questions over verdicts — `questionRate` 0.5, and the verdict frame asks;
 * 10. volume is punctuation — `capsPeak`, at most one peak per note, and the
 *     `shape` pass caps "!" at the budget.
 *
 * Proposition args this module reads (with fallbacks, since the planner is
 * built in parallel): verdict {san, classification, winBefore?, winAfter?,
 * square?}; hangs {target, attackers}; forked {by, targets}; missed_capture
 * {target, value?}; ignored_threat {by, targets, kind?}; swing {winBefore,
 * winAfter}; best_move {san}; define {term}; lesson {concept}.
 */

/* ------------------------------------------------------------------ */
/* Lexicon                                                             */
/* ------------------------------------------------------------------ */

const lexicon: Lexicon = {
  pieceNames: { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' },
  captureVerb: 'takes',
  address: 'chat',
  intensifiers: ['bro', 'dude', 'literally', 'genuinely', 'honestly', 'obviously'],
  praise: ['bro, respect', 'okay, respect', 'actually good', 'look at you', 'fine, honestly'],
  // Feelings, not evaluations: how the position feels, never what it is worth.
  blame: ['rough', 'oof', 'tilted', 'throwing', 'not great', 'a bit sad'],
  fillers: ['okay', 'honestly', 'wait', 'yeah'],
  connectives: ['and', 'so', 'but', '—'],
};

/* ------------------------------------------------------------------ */
/* Syntax and prosody                                                  */
/* ------------------------------------------------------------------ */

const syntax: Syntax = {
  maxSentenceWords: 12,
  fragments: true,
  chainWithAnd: false,
  questionRate: 0.5,
  verdictFirst: false,
  preferHere: false,
  imperativeAdvice: true,
};

const LOSS_LEADS = new Set<SituationKind>([
  'allowed_mate',
  'missed_mate',
  'hung_piece',
  'under_defended',
  'walked_into_fork',
  'walked_into_pin',
  'walked_into_skewer',
  'missed_capture',
  'ignored_threat',
  'trapped_piece',
  'traded_behind',
  'unsound_sacrifice',
  'quiet_loss',
  'back_rank',
  'king_exposed',
  'overloaded',
  'zugzwang',
]);

const PRAISE_LEADS = new Set<SituationKind>([
  'sound_sacrifice',
  'created_fork',
  'created_discovered',
  'only_move',
  'best',
  'mate_delivered',
  'promotion',
  'passed_pawn',
  'fortress',
]);

/**
 * Voice rule 4. The ladder climbs with the size of the loss and, past the
 * blunder line, hard-cuts to the reset. The peak word is the one ALL-CAPS
 * moment the note gets; `shape` guarantees there is never a second.
 */
export function andreaReaction(epLoss: number, lead: SituationKind): string {
  if (epLoss >= 0.3) return 'Oh God, oh God, oh God, OH GOD. Okay, let me think.';
  if (epLoss >= 0.2) return 'Oh God, oh God, oh God.';
  if (epLoss >= 0.1) return 'Oh God, oh God.';
  if (epLoss >= 0.045) return 'Oh God.';
  if (epLoss >= 0.02) return 'Eh.';
  if (lead === 'sound_sacrifice') return 'WAIT.';
  if (lead === 'mate_delivered') return 'EZ clap.';
  if (lead === 'only_move') return 'Okay, phew.';
  return '';
}

function andreaCloser(lead: SituationKind): string {
  if (LOSS_LEADS.has(lead)) return 'Okay, go agane.';
  if (PRAISE_LEADS.has(lead)) return 'Clip that.';
  return '';
}

const prosody: Prosody = {
  exclamations: 2,
  capsPeak: true,
  reaction: andreaReaction,
  closer: andreaCloser,
  sentenceCase: true,
};

/* ------------------------------------------------------------------ */
/* Events — the 14 scripted lines, each with company                   */
/* ------------------------------------------------------------------ */

const events: Record<Trigger, string[]> = {
  reviewStart: [
    "Okay chat, let's see how bad this is.",
    'Okay. Deep breath. Chat, be nice about this one.',
    "Right, let's look. If it's bad, that's on chat, not me.",
  ],
  brilliant: [
    'WAIT. You found that? Bro. Okay, respect.',
    'Hold on. Chat, did you see that? Bro. Respect.',
    "Okay who is this? That's genuinely insane. Clip that.",
  ],
  great: [
    "Oh that's actually good. Look at you.",
    "Wait, that's good? That's good. Okay, look at you.",
    "Honestly, that's better than what I would've done. Nice.",
  ],
  blunder: [
    'Oh God, oh God, oh God, oh God. Okay. Let me think.',
    'No. No no no. Oh God. Okay. Okay, let me think.',
    'Oh God, oh God, oh God, oh God. Chat, not a word. Okay. Let me think.',
  ],
  mistake: [
    "Eh. Not great, but I've done way worse literally today.",
    "Okay, not ideal. Honestly, same though. Let's keep going.",
    "Yeah, that's a bit rough. Bro, I've done that exact thing. Twice.",
  ],
  miss: [
    "Bro, it was right there. I'm not even mad, I'm just — it was right there.",
    "Wait, wait, wait. It was RIGHT there. Chat, why didn't you say something?",
    "Dude. It was right there. Okay, never mind, forget it, I didn't see it either.",
  ],
  bookExit: [
    "Okay we're out of book, which honestly is where I live anyway.",
    "Aaand we're out of book. Welcome to my whole life, chat.",
    "That's the end of the theory. Now it's just vibes. I love vibes.",
  ],
  comeback: [
    "Wait, we're back?? Chat, we're back.",
    "Hold on, hold on. Are we okay? We're okay. WE'RE BACK.",
    'No way. No way. Okay chat, we are so back.',
  ],
  collapse: [
    "No. NO. Okay that's — yeah. That's the Botez Gambit and I didn't even do it.",
    "Okay so we're throwing. That's fine. That's — no, it's not fine. Okay.",
    "This is tilted. Genuinely. Chat, don't clip this.",
  ],
  highAccuracy: [
    "Honestly? That's better than most of my games. Genuinely.",
    "Okay, that's clean. Like, annoyingly clean. Respect.",
    "Bro. That's better than I play. Never mind, I didn't say that.",
  ],
  lowAccuracy: [
    'Okay so that was rough. Same. Every single game, same.',
    "Yeah, that was a lot. It's fine. Honestly, my sister plays like that too.",
    "Rough. But like, relatable rough. Chat, don't look at me like that.",
  ],
  longGame: [
    'BRO, WHEN IS THIS GOING TO END?',
    'Is this still going? Chat, is this still going?',
    "Okay, I've aged. We have all aged. Somebody flag, please.",
  ],
  reviewEnd: [
    "All right, that's a wrap. GO AGANE.",
    "Okay, that's a wrap. Genuinely, good game. Go agane.",
    "And that's it. Chat, we survived. Go agane.",
  ],
  random: [
    "That was chat's fault.",
    'I was late, okay. That is why.',
    "Never mind, forget it, I didn't say that.",
  ],
};

/* ------------------------------------------------------------------ */
/* Argument helpers — tolerant of the planner's naming                  */
/* ------------------------------------------------------------------ */

const isPiece = (v: unknown): v is PieceRef =>
  typeof v === 'object' && v !== null && 'piece' in v && 'square' in v;

function pieceArg(p: Proposition, keys: string[]): PieceRef | undefined {
  for (const key of keys) {
    const v = p.args[key];
    if (isPiece(v)) return v;
    if (Array.isArray(v) && isPiece(v[0])) return v[0];
  }
  return undefined;
}

function piecesArg(p: Proposition, keys: string[]): PieceRef[] {
  for (const key of keys) {
    const v = p.args[key];
    if (Array.isArray(v) && v.every(isPiece)) return v as PieceRef[];
    if (isPiece(v)) return [v];
  }
  return [];
}

function stringArg(p: Proposition, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = p.args[key];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function numberArg(p: Proposition, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = p.args[key];
    if (typeof v === 'number') return v;
  }
  return undefined;
}

/** "the knight on d7 and the bishop on b7" — through the realiser's referrer. */
function list(pieces: PieceRef[], ctx: RenderContext): string {
  const names = pieces.map((piece) => ctx.refer(piece));
  if (names.length === 0) return 'a piece';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

const LOSS_CLASSES = new Set<Classification>(['inaccuracy', 'mistake', 'miss', 'blunder']);

/**
 * Voice rule 9: the headline is a question, not a verdict. Voice rule 5 on a
 * bad move: no defending it. Kept short — the validator caps headlines at 60
 * characters.
 */
const verdict: Frame = (p, ctx) => {
  const san = stringArg(p, ['san', 'move', 'played']) ?? '';
  const cls = (stringArg(p, ['classification', 'verdict']) ?? 'good') as Classification;
  const sq = stringArg(p, ['square', 'threatSquare']);
  const played = san ? ctx.move(san) : 'that';

  if (cls === 'blunder') {
    const out = [`Okay wait, ${played}? Chat, what?`, `Oh no. Did we just play ${played}?`, `${played}? Bro. Why?`];
    if (sq) out.unshift(`Okay wait, ${ctx.square(sq)} was open?`);
    return out;
  }
  if (cls === 'miss') {
    return [`Wait, ${played}? It was right there.`, `${played}? Chat, it was right there.`, `Bro. ${played}? Really?`];
  }
  if (LOSS_CLASSES.has(cls)) {
    return [`Eh. ${played}? Okay.`, `${played}, hm. Chat, are we okay?`, `Is ${played} fine? It doesn't feel fine.`];
  }
  if (cls === 'brilliant') {
    return [`WAIT. ${played}? Bro.`, `${played}?? Okay, respect.`, `Hold on, ${played}? Who are you?`];
  }
  if (cls === 'great') {
    return [`Oh, ${played} is actually good.`, `${played}? Look at you.`, `Wait, ${played}? That's good, chat.`];
  }
  if (cls === 'book') {
    return [`${played}, still book. Okay.`, `${played}. Yeah, that's theory.`, `Okay, ${played}, we know this one.`];
  }
  return [`${played}, okay. Fine, honestly.`, `${played}. Good. Look at you.`, `Okay, ${played}. Chat, we're fine.`];
};

const hangs: Frame = (p, ctx) => {
  const target = pieceArg(p, ['target', 'piece']);
  const attackers = piecesArg(p, ['attackers', 'by', 'attacker']);
  const who = target ? ctx.refer(target) : 'that piece';
  const by = attackers.length > 0 ? ctx.refer(attackers[0]!) : 'they';
  return [
    `Chat, is ${who} defended? No? Oh no.`,
    `${who} is just hanging. ${by} takes it for free. Dude.`,
    `Bro, ${who} is literally free right now.`,
    `Wait, who's covering ${who}? Nobody? Okay.`,
  ];
};

const forked: Frame = (p, ctx) => {
  const by = pieceArg(p, ['by', 'attacker', 'piece']);
  const targets = piecesArg(p, ['targets', 'pieces']);
  const forker = by ? ctx.refer(by) : 'their piece';
  const hit = list(targets, ctx);
  return [
    `${forker} hits ${hit} at once.`,
    `Oh no. ${forker} is hitting ${hit}. Both. Chat, why?`,
    `Bro, ${forker} forks ${hit}. I have been there.`,
  ];
};

const missedCapture: Frame = (p, ctx) => {
  const target = pieceArg(p, ['target', 'piece']);
  const who = target ? ctx.refer(target) : 'that piece';
  return [
    `Bro, ${who} was just free. It was right there.`,
    `Chat, did we not see ${who}? It was literally free.`,
    `${who} was hanging and we just walked past it. Same, honestly.`,
  ];
};

const ignoredThreat: Frame = (p, ctx) => {
  const by = pieceArg(p, ['by', 'attacker', 'piece']);
  const targets = piecesArg(p, ['targets', 'target']);
  const kind = stringArg(p, ['kind', 'threat']);
  const threat = by ? ctx.refer(by) : 'their piece';
  const hit = list(targets, ctx);
  const what = kind === 'mate' ? 'mate' : kind === 'fork' ? 'a fork' : 'that';
  return [
    `They were threatening ${hit} with ${threat} and we just did not look.`,
    `Chat, ${threat} was coming for ${hit}. We saw it, right? No?`,
    `${threat} was going for ${what} on ${hit}, and we ignored it. Classic me.`,
  ];
};

/**
 * Voice rule 5: admit it instantly, then the joke. Voice rule 1: the swing is
 * a feeling, not a number. Voice rule 6 lives in the last losing variant —
 * the one comic deflection this grammar allows itself.
 */
const swing: Frame = (p, ctx) => {
  const before = numberArg(p, ['winBefore', 'before', 'from']) ?? 50;
  const after = numberArg(p, ['winAfter', 'after', 'to']) ?? 50;
  const delta = after - before;

  if (delta <= -20) {
    return [
      "It was fine, now it's sad. Honestly, we have all done this.",
      "That's a piece, basically. Same, chat. I do this every single game.",
      "We went from fine to oh no. It's okay. Bro, I do this weekly.",
      "It was fine and now it's not. That was chat's fault, obviously.",
    ];
  }
  if (delta < 0) {
    return [
      "It was okay and now it's a bit rough. Honestly, I've done way worse.",
      'Not the end, chat. It just feels worse than it did. Same.',
      "We're a little sad now. Okay. It happens to me literally daily.",
    ];
  }
  if (delta >= 20) {
    return [
      'We went from okay to actually winning? Chat, clip that.',
      'Oh, that feels good. That feels really good. Look at you.',
      "Bro. We're winning now. I didn't think we had it.",
    ];
  }
  void ctx;
  return [
    'Nothing really changed. It just feels a bit better, chat.',
    "Still fine. Honestly, fine is my favourite. Let's keep it.",
    "Yeah, that's about where we were. Okay. Chat, we're good.",
  ];
};

/** Must name the move. Rule 5 again: no defending, no "but". */
const bestMove: Frame = (p, ctx) => {
  const san = stringArg(p, ['move', 'best', 'bestMove', 'san']) ?? '';
  const best = ctx.move(san);
  return [
    `${best}, chat. It was right there.`,
    `Honestly, ${best} and we're fine.`,
    `${best}, bro. I didn't see it either.`,
    `${best}. That's the one. Okay.`,
  ];
};

const DEFINITIONS: Record<string, string> = {
  fork: 'A fork is one piece hitting two things at once, so only one gets out',
  pin: 'A pin is a piece that cannot move because something bigger is behind it',
  skewer: 'A skewer is a pin backwards: the big piece is in front, and when it moves, the one behind drops',
  'discovered attack': 'A discovered attack is when one piece moves and the piece behind it is suddenly hitting something',
  discovered: 'A discovered attack is when one piece moves and the piece behind it is suddenly hitting something',
  zugzwang: 'This is the one where every single move you have makes it worse, and you still have to move',
  fortress: 'A fortress is when you are down material but they literally cannot get in',
  'back rank': 'The back rank thing is a king stuck behind its own pawns with a rook coming to say hi',
  'passed pawn': 'A passed pawn has no enemy pawns in front of it, so it just keeps walking',
  overloaded: 'An overloaded piece is guarding two things and can only actually do one',
};

const define: Frame = (p, ctx) => {
  const term = (stringArg(p, ['term', 'concept', 'word']) ?? 'fork').toLowerCase();
  const core = DEFINITIONS[term] ?? `So, ${term}: it is a thing, and it just happened to us`;
  void ctx;
  return [
    `${core}. Chat, I know you knew that. This is for me.`,
    `${core}. Okay. You guys knew that, right? Right.`,
    `${core}. Honestly, I only learned that last week.`,
  ];
};

const LESSONS: Record<string, string> = {
  check_landing_square: 'Glance at the empty squares on your own side before you commit a piece',
  count_attackers: 'Count who is hitting a square before you leave a piece there',
  look_for_captures: 'Look at every capture first, even the dumb ones',
  checks_first: 'Checks first. Always checks first',
  defend_back_rank: 'Give your king a little door before the rook shows up',
  see_their_threat: 'Ask what they want to do before you do your thing',
  dont_trade_behind: 'When you are down material, stop trading, keep pieces on',
  push_the_passer: 'Push the pawn that nobody can stop',
  keep_the_shield: 'Keep the pawns in front of your king where they are',
  one_defender_two_jobs: 'If one piece has two jobs, it has zero jobs',
  keep_the_tension: 'Do not release the tension just because it feels uncomfortable',
  book_ends_here: 'Learn one more move of this line and you are out of trouble',
  remember_this: 'Remember this one. Genuinely, just remember it',
};

/** Voice rule 8: agree with the lesson, then redirect it to chat. */
const lesson: Frame = (p, ctx) => {
  const concept = stringArg(p, ['concept', 'id', 'lesson']) ?? 'remember_this';
  const core = LESSONS[concept] ?? LESSONS.remember_this!;
  void ctx;
  return [
    `${core}. Yeah, fair. Chat, that's for you.`,
    `${core}. Okay, true. Chat problem though, not mine.`,
    `${core}. I know. You guys hear that? For you.`,
  ];
};

const frames: PersonaGrammar['frames'] = {
  verdict,
  hangs,
  forked,
  missed_capture: missedCapture,
  ignored_threat: ignoredThreat,
  swing,
  best_move: bestMove,
  define,
  lesson,
};

/* ------------------------------------------------------------------ */
/* Shape — the final pass over the whole note                          */
/* ------------------------------------------------------------------ */

const CAPS_RUN = /\b[A-Z]{2,}(?:[ ,]+[A-Z]{2,})*\b/g;
const CHAT = /\bchat\b/i;
const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bdo not\b/g, "don't"],
  [/\bDo not\b/g, "Don't"],
  [/\bdoes not\b/g, "doesn't"],
  [/\bcannot\b/g, "can't"],
  [/\bdid not\b/g, "didn't"],
];

/** Lower a caps run back to speech, keeping "God" and the sentence's capital. */
function decap(run: string, atSentenceStart: boolean): string {
  const words = run
    .split(/(\s+|,)/)
    .map((w) => (w === 'GOD' ? 'God' : w === 'I' ? 'I' : /^[A-Z]{2,}$/.test(w) ? w.toLowerCase() : w));
  let out = words.join('');
  if (atSentenceStart) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/** True when `index` in `text` begins a sentence. */
function sentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[\s"'(—-]+$/, '');
  return before.length === 0 || /[.!?]$/.test(before);
}

/**
 * Voice rule 10, kept honest: the first ALL-CAPS run in the note is the peak
 * and every later one comes back down. "!" is capped at the budget, extra
 * ones become full stops. "chat" is guaranteed once per note (voice rule 2).
 */
export function andreaShape(
  slots: Record<Slot, string>,
  ctx: RenderContext,
): Record<Slot, string> {
  const out: Record<Slot, string> = { ...slots };
  let peaks = 0;
  let bangs = 0;
  const bangBudget = Math.min(prosody.exclamations, base.budgets.exclamations);
  void ctx;

  for (const slot of SLOTS) {
    let text = out[slot] ?? '';
    for (const [pattern, short] of CONTRACTIONS) text = text.replace(pattern, short);

    text = text.replace(CAPS_RUN, (run, offset: number) => {
      peaks += 1;
      if (peaks === 1) return run;
      return decap(run, sentenceStart(text, offset));
    });

    text = text.replace(/!+/g, () => {
      bangs += 1;
      return bangs <= bangBudget ? '!' : '.';
    });

    out[slot] = text;
  }

  if (!SLOTS.some((slot) => CHAT.test(out[slot] ?? ''))) {
    const wh = out.whatHappened ?? '';
    const plainStart = /^(?!White\b|Black\b|I\b)[A-Z][a-z]+\b/.test(wh);
    const rest = plainStart ? wh.charAt(0).toLowerCase() + wh.slice(1) : wh;
    out.whatHappened = wh ? `Okay chat, ${rest}` : 'Okay chat.';
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* The grammar                                                         */
/* ------------------------------------------------------------------ */

const base = neutralGrammar('andrea');

export const andrea: PersonaGrammar = {
  ...base,
  lexicon,
  syntax,
  prosody,
  events,
  frames,
  shape: andreaShape,
};
