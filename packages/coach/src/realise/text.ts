/**
 * Small text helpers shared by the frames and the assembler: numbers in words,
 * percentages, lists, and the guarantee that every sentence starts with a
 * capital and ends with terminal punctuation.
 */

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** Numbers under ten in words, everything else in digits. */
export function num(n: number): string {
  const r = Math.round(Math.abs(n));
  return r < 10 ? SMALL[r]! : String(r);
}

/** "about 52%". Values in 0..1 are read as fractions. */
export function pct(x: number): string {
  const v = x > 0 && x <= 1 ? x * 100 : x;
  return `about ${Math.round(Math.max(0, Math.min(100, v)))}%`;
}

/** "a pawn", "three pawns". */
export function pawns(n: number): string {
  const r = Math.round(Math.abs(n));
  if (r <= 1) return 'a pawn';
  return `${num(r)} pawns`;
}

/** "a, b and c". */
export function list(items: string[]): string {
  const clean = items.filter((s) => s.trim().length > 0);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Tokens that must keep their case when a sentence is lowered to join another. */
const KEEPS_CASE = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O|I\b|White\b|Black\b)/;

export function lowerFirst(s: string): string {
  if (!s || KEEPS_CASE.test(s)) return s;
  return s[0]!.toLowerCase() + s.slice(1);
}

/** Sentence boundaries: terminal punctuation, optional closing quote, space. */
const SENTENCE_SPLIT = /(?<=[.!?]["')\]]?)\s+/;

/**
 * A move written in algebraic notation must keep its case: `bxc3` is a pawn
 * capture and `Bxc3` a bishop's, and a bare square like `d7` is never a
 * proper noun. Anything else that starts a sentence with a letter is
 * capitalised; a sentence that opens with a number is left alone.
 */
const MOVE_TOKEN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?|[a-h][1-8])(?=[\s,.;:!?)]|$)/;

function capitaliseOne(s: string): string {
  const t = s.replace(/^\s+/, '');
  if (!t || !/^[a-z]/.test(t)) return s;
  if (MOVE_TOKEN.test(t)) return s;
  const lead = s.length - t.length;
  return s.slice(0, lead) + t[0]!.toUpperCase() + t.slice(1);
}

/** Capitalise the start of every sentence, not only the first. */
export function capitalise(s: string): string {
  return s.split(SENTENCE_SPLIT).map(capitaliseOne).join(' ');
}

/**
 * Keep every sentence within `max` words: cut at the last comma or connective
 * inside the limit, or, failing a seam, at the word boundary itself.
 */
export function limitSentences(text: string, max: number): string {
  if (!Number.isFinite(max) || max <= 0) return text;
  const out: string[] = [];
  for (const sentence of text.split(SENTENCE_SPLIT)) {
    let rest = sentence.trim();
    while (countWords(rest) > max) {
      const words = rest.split(/\s+/);
      let cut = -1;
      for (let i = Math.min(max, words.length - 1); i >= 2; i -= 1) {
        const w = words[i - 1]!;
        const next = words[i]!;
        if (/[,;:—]$/.test(w) || /^(?:and|so|but|because|which|while)$/i.test(next)) {
          cut = i;
          break;
        }
      }
      if (cut < 0) cut = max;
      const head = words.slice(0, cut).join(' ').replace(/[,;:—\s]+$/, '');
      let tail = words.slice(cut).join(' ').replace(/^(?:and|so|but|because|which|while)\s+/i, '');
      if (!tail.trim()) break;
      out.push(/[.!?]["')\]]?$/.test(head) ? head : `${head}.`);
      tail = capitaliseOne(tail);
      rest = tail;
    }
    if (rest) out.push(rest);
  }
  return out.join(' ');
}

/** Strip a sentence's terminal punctuation so it can be joined to another. */
export function stripTerminal(s: string): string {
  return s.trim().replace(/[.!?]+["')\]]?$/, '');
}

/** Anything with a question in it, so a two-part "Why? Because." counts too. */
export function isQuestion(s: string): boolean {
  return s.includes('?');
}

/** Tidy spacing, capitalise the start, and end in `.`, `!` or `?`. */
export function finishSentence(s: string): string {
  let t = s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
  if (!t) return '';
  t = t.replace(/[,;:—–-]+$/, '').trim();
  if (!/[.!?]["')\]]?$/.test(t)) t = `${t}.`;
  return capitalise(t);
}

/** The destination square of a SAN move, or undefined for castling. */
export function destinationOf(san: string): string | undefined {
  const m = /([a-h][1-8])(?:=[QRBN])?[+#]?$/.exec(san);
  return m?.[1];
}

export const stripCheck = (san: string): string => san.replace(/[+#]+$/, '');
