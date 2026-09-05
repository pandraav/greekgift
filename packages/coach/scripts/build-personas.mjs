/**
 * Compiles the personas spec into data the app can load.
 *
 * The spec says `packages/coach` implements the personas "verbatim". Hand
 * transcription would make that a promise rather than a fact — seven personas,
 * a hundred-odd lexicon entries each, and no way to notice a drifted word. So
 * the markdown is the source and this reads it.
 *
 *   node scripts/build-personas.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SPEC = path.resolve(
  import.meta.dirname,
  '../../../docs/superpowers/specs/2026-09-04-coach-personas.md',
);
const OUT = path.resolve(import.meta.dirname, '../src/data/personas.json');

const text = fs.readFileSync(SPEC, 'utf8');

/** 🇮🇳 → IN. Regional indicators sit 0x1F1E6 above 'A'. */
function countryOf(flag) {
  const points = [...flag].map((c) => c.codePointAt(0));
  if (points.length !== 2 || points.some((p) => p < 0x1f1e6 || p > 0x1f1ff)) return '';
  return points.map((p) => String.fromCharCode(p - 0x1f1e6 + 65)).join('');
}

/** Strip the spec's parenthetical evidence notes from a lexicon entry. */
const cleanTerm = (term) =>
  term
    .replace(/\*\(.*?\)\*/g, '')
    .replace(/\*/g, '')
    .trim();

const splitTerms = (line) =>
  line
    .split('·')
    .map(cleanTerm)
    .filter(Boolean);

/** Every `| a | b |` row of the table that follows `heading`. */
function tableAfter(block, heading) {
  const start = block.indexOf(heading);
  if (start === -1) return [];
  const rows = [];
  for (const line of block.slice(start).split('\n')) {
    const m = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(line.trim());
    if (!m) {
      if (rows.length > 0) break;
      continue;
    }
    const [, key, value] = m;
    if (/^-+$/.test(key.replace(/[:\s]/g, '')) || key === 'trigger' || key === 'slot') {
      continue;
    }
    rows.push([key, value]);
  }
  return rows;
}

function parseBudgets(line) {
  const words = /(\d+)\s+words/.exec(line);
  const perSentence = /(\d+)\s+per sentence/.exec(line);
  const exclamations = /(\d+)\s+exclamations?/.exec(line);
  const none = /no exclamations/.test(line);

  return {
    words: words ? Number(words[1]) : 60,
    ...(perSentence ? { perSentence: Number(perSentence[1]) } : {}),
    exclamations: none ? 0 : exclamations ? Number(exclamations[1]) : 1,
  };
}

const blocks = text.split(/\n# (?=\d+ · )/).slice(1);
const personas = [];

for (const raw of blocks) {
  const block = '# ' + raw;
  const lines = block.split('\n');

  const label = /^# \d+ · (.+)$/.exec(lines[0])[1].trim();
  const meta = lines[1];

  const id = /`id: ([a-z0-9_-]+)`/.exec(meta)[1];
  const style = /style \*\*(.+?)\*\*/.exec(meta)[1];
  const rating = Number(/rating (\d+)/.exec(meta)[1]);
  const book = /plays `(.+?)`/.exec(meta)[1];
  const flag = /([\u{1F1E6}-\u{1F1FF}]{2})/u.exec(meta);
  const isDefault = /\*\*default\*\*/.test(meta);

  const description = lines
    .filter((l) => l.startsWith('> '))
    .map((l) => l.slice(2).trim())
    .join(' ');

  const rulesStart = lines.findIndex((l) => l.startsWith('**Voice rules**'));
  const voiceRules = [];
  for (const line of lines.slice(rulesStart + 1)) {
    const m = /^\d+\.\s+(.*)$/.exec(line);
    if (!m) {
      if (voiceRules.length > 0) break;
      continue;
    }
    voiceRules.push(m[1].trim());
  }

  const allowed = splitTerms(/^\*\*Allowed\*\*\s*(.*)$/m.exec(block)[1]);
  const banned = splitTerms(/^\*\*Banned\*\*\s*(.*)$/m.exec(block)[1]);

  const budgetLine = /^\*\*Budgets\*\*\s*(.*)$/m.exec(block)[1];
  const budgets = parseBudgets(budgetLine);
  const humourTarget = /\*\*Humour target\*\*\s*(.+?)\s*$/.exec(budgetLine)[1];

  personas.push({
    id,
    label,
    style,
    description,
    book,
    rating,
    country: flag ? countryOf(flag[1]) : '',
    ...(isDefault ? { isDefault: true } : {}),
    voiceRules,
    allowed,
    banned,
    budgets,
    humourTarget,
    lines: Object.fromEntries(tableAfter(block, '| trigger | line |')),
    rendered: Object.fromEntries(tableAfter(block, '| slot | text |')),
  });
}

if (personas.length === 0) throw new Error('No personas found — has the spec moved?');
const defaults = personas.filter((p) => p.isDefault);
if (defaults.length !== 1) {
  throw new Error(`Expected exactly one default persona, found ${defaults.length}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(personas, null, 2) + '\n');

console.log(`${personas.length} personas → ${path.relative(process.cwd(), OUT)}`);
for (const p of personas) {
  console.log(
    `  ${p.id.padEnd(10)} ${String(Object.keys(p.lines).length).padStart(2)} lines, ` +
      `${p.voiceRules.length} rules, ${p.allowed.length} allowed, ${p.banned.length} banned` +
      (p.isDefault ? '  (default)' : ''),
  );
}
