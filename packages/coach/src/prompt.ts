import type { MoveFacts, Motif } from '@greekgift/engine';

import { personaName, type Persona } from './personas.ts';

/**
 * Turning a persona and a facts object into a prompt.
 *
 * The split is deliberate and it is the whole design: the **engine** decides
 * what is true, deterministic code decides **which** of it is worth saying, and
 * the model only decides **how it sounds**. A model that is never asked to
 * evaluate a position cannot get the evaluation wrong.
 */

const moveNumber = (ply: number) => Math.floor((ply - 1) / 2) + 1;

const AUDIENCE: Record<MoveFacts['audience'], string> = {
  beginner:
    'The reader is a beginner. Name the pattern and say what to look at next time. Assume nothing about notation beyond reading a move.',
  intermediate:
    'The reader is a club player. They know what a fork and a pin are; do not define terms. Say what was missed and why it mattered.',
  advanced:
    'The reader is strong. Be brief and concrete, name the line, and skip anything they would find obvious.',
};

/** The facts, rendered as something a model can read without interpreting. */
export function factsBlock(facts: MoveFacts): string {
  const side = facts.ply % 2 === 1 ? 'White' : 'Black';
  const lines = [
    `move: ${moveNumber(facts.ply)}${facts.ply % 2 === 1 ? '.' : '...'} ${facts.san} (${side})`,
    `verdict: ${facts.classification}`,
    `winning chances: ${Math.round(facts.winBefore)}% before, ${Math.round(facts.winAfter)}% after`,
    `best move: ${facts.bestMove}`,
  ];

  if (facts.bestLine.length > 0) lines.push(`best line: ${facts.bestLine.join(' ')}`);
  if (facts.playedLine.length > 0) {
    lines.push(`what follows the move played: ${facts.playedLine.join(' ')}`);
  }
  if (facts.motifs.length > 0) {
    lines.push('what is on the board:');
    for (const motif of facts.motifs) lines.push(`  - ${describeMotif(motif)}`);
  }
  lines.push(`phase: ${facts.phase}`);
  if (facts.opening) lines.push(`opening: ${facts.opening.name} (${facts.opening.eco})`);
  if (facts.leftBook) lines.push('this is the move that left opening theory');

  return lines.join('\n');
}

function describeMotif(motif: Motif): string {
  switch (motif.type) {
    case 'fork':
      return `fork by the piece on ${motif.by}, hitting ${motif.targets.join(' and ')}`;
    case 'hanging_piece':
      return `${motif.piece} on ${motif.square} is attacked by ${motif.attackers.join(', ') || 'nothing'} and defended by ${motif.defenders.join(', ') || 'nothing'}`;
    case 'pin':
      return `${motif.absolute ? 'absolute pin' : 'pin'}: ${motif.pinned} is pinned by ${motif.pinner} against ${motif.against}`;
    case 'missed_capture':
      return `a ${motif.piece} on ${motif.square} was available to take (worth ${motif.value})`;
    case 'missed_mate':
      return `mate was available: ${motif.line.join(' ')}`;
    case 'mate_threat':
      return `mate is now threatened: ${motif.line.join(' ')}`;
    case 'back_rank_weak':
      return 'the back rank is weak — the king has no escape square';
    case 'sacrifice':
      return `material given up: the ${motif.piece} on ${motif.square}`;
    case 'trapped_piece':
      return `${motif.piece} on ${motif.square} is trapped`;
    case 'only_move':
      return 'this was the only move that held the position';
    case 'discovered_attack':
      return `discovered attack: ${motif.mover} moved, opening ${motif.attacker} onto ${motif.target}`;
    default:
      return 'see the facts above';
  }
}

/**
 * Exemplars are deliberately fake and far from any real position.
 *
 * Demonstrations that resemble the real input get copied verbatim at high
 * rates — including when they are wrong. Absurd move numbers and invented
 * openings mean that if the model does copy one, the validator catches it
 * instead of it shipping as plausible nonsense.
 */
const EXEMPLAR = `Example of the shape only — the chess in it is nonsense and must never be reused:

facts:
move: 91... Qh4 (Black)
verdict: blunder
winning chances: 50% before, 10% after
best move: Kg8
what is on the board:
  - queen on h4 is attacked by g3 and defended by nothing

output:
headline: The queen walks into a pawn
what_happened: Qh4 puts the queen on a square a pawn covers.
why_it_matters: Fifty to ten, on one move.
better_was: Kg8 keeps everything defended.
lesson: Check what the pawns cover before moving the queen.`;

export interface PromptOptions {
  persona: Persona;
  facts: MoveFacts;
  /** Who is being coached, for the second person to land on the right player. */
  playerName?: string;
}

export function systemPrompt({ persona, facts }: PromptOptions): string {
  const budget = persona.budgets;

  return [
    `You write one short coaching note about one chess move, in a particular voice.`,
    '',
    `## The voice: ${persona.style}`,
    persona.description,
    '',
    'Rules for this voice, in order of importance:',
    ...persona.voiceRules.map((rule, i) => `${i + 1}. ${rule}`),
    '',
    `Words and phrases that belong in this voice: ${persona.allowed.join(', ')}.`,
    `Never use these, they break it: ${persona.banned.join(', ')}.`,
    `Humour, if any, is aimed at: ${persona.humourTarget}.`,
    '',
    '## Hard limits',
    `- ${budget.words} words total across all five slots. Under is fine; over is rejected.`,
    budget.perSentence
      ? `- At most ${budget.perSentence} words in a sentence.`
      : '- Keep sentences short.',
    `- At most ${budget.exclamations} exclamation mark${budget.exclamations === 1 ? '' : 's'} in the whole note.`,
    '- The headline is at most 60 characters.',
    '',
    '## What you may say',
    'You are given a facts block. It is the complete list of things that are true',
    'about this position. You may only name moves and squares that appear in it.',
    'Naming any other move or square is a hard failure and the note is discarded.',
    'Do not evaluate the position yourself, do not calculate, do not suggest a move',
    'other than the best move you are given, and never mention an engine, a',
    'centipawn or a number that is not in the facts.',
    '',
    '## Output',
    'Five slots, no more:',
    '- headline: at most 60 characters, no move numbers',
    '- what_happened: one or two sentences on what the move did',
    '- why_it_matters: one or two sentences on the consequence',
    `- better_was: one or two sentences, and it must contain "${facts.bestMove}"`,
    '- lesson: one sentence the reader can use in their next game',
    '',
    AUDIENCE[facts.audience],
    '',
    EXEMPLAR,
    '',
    `You are greekgift's coach, written in ${personaName(persona)}'s style. If asked`,
    'who you are, say exactly that. Never claim to be them, never speak for them,',
    'never invent biography, and never refer to your own games, channel or career.',
  ].join('\n');
}

export function userPrompt({ facts, playerName }: PromptOptions): string {
  return [
    playerName ? `You are talking to ${playerName}, who played this move.` : '',
    'Facts:',
    factsBlock(facts),
    '',
    'Write the five slots.',
  ]
    .filter(Boolean)
    .join('\n');
}
