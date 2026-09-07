/**
 * The corpus anchor.
 *
 * Renders every ply of every fixture review through every persona and every
 * audience, runs the validator on each note, and writes a report a person can
 * read. Exits non-zero on any violation, so CI and the graph's merge step have
 * a ground truth that is not an opinion.
 *
 * Run from the repo root:
 *   pnpm --filter @greekgift/web exec tsx ../../packages/coach/scripts/corpus.mjs
 * (tsx lives in the web package; the script imports the TypeScript sources.)
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { factsFor } from '@greekgift/engine';
import { PERSONAS, renderCoachText, seedFor, validate } from '@greekgift/coach';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..', '..');
const fixturesDir = join(root, 'packages/engine/test/fixtures/reviews');
const reportDir = join(root, 'docs/graphs/2026-09-07-deterministic-coach');
const reportPath = join(reportDir, 'corpus-report.md');

const AUDIENCES = ['beginner', 'intermediate', 'advanced'];

const files = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
if (files.length === 0) {
  console.error(`no fixtures in ${fixturesDir}`);
  process.exit(2);
}

const reviews = files.map((f) => ({
  name: f.replace(/\.json$/, ''),
  review: JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')),
}));

const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const slots = ['headline', 'whatHappened', 'whyItMatters', 'betterWas', 'lesson'];

let rendered = 0;
const violations = []; // { fixture, ply, persona, audience, kind, detail }
const violationsByKind = new Map();
const leadCounts = new Map();
const wordsByPersona = new Map(); // persona -> { total, n, max, budget }
const samples = new Map(); // persona -> Map(lead -> sample)
const stable = { checked: 0, mismatched: 0 };
const errors = [];

for (const { name, review } of reviews) {
  for (const move of review.moves) {
    for (const audience of AUDIENCES) {
      let facts;
      try {
        facts = factsFor(review, move.ply, { audience });
      } catch (err) {
        errors.push(`${name} ply ${move.ply}: factsFor threw: ${err.message}`);
        continue;
      }
      const lead = facts.situations[0]?.kind ?? '(none)';
      if (audience === 'intermediate') leadCounts.set(lead, (leadCounts.get(lead) ?? 0) + 1);

      for (const persona of PERSONAS) {
        const seed = seedFor(review.gameId, move.ply, persona.id);
        let text;
        try {
          text = renderCoachText(facts, persona, audience, seed);
        } catch (err) {
          errors.push(`${name} ply ${move.ply} ${persona.id}/${audience}: render threw: ${err.message}`);
          continue;
        }
        rendered++;

        const again = renderCoachText(facts, persona, audience, seed);
        stable.checked++;
        if (slots.some((s) => again[s] !== text[s])) stable.mismatched++;

        const result = validate(text, facts, persona);
        for (const v of result.violations) {
          violations.push({ fixture: name, ply: move.ply, persona: persona.id, audience, ...v });
          violationsByKind.set(v.kind, (violationsByKind.get(v.kind) ?? 0) + 1);
        }

        const words = slots.reduce((n, s) => n + countWords(text[s]), 0);
        const w = wordsByPersona.get(persona.id) ?? { total: 0, n: 0, max: 0, budget: persona.budgets.words };
        w.total += words;
        w.n++;
        w.max = Math.max(w.max, words);
        wordsByPersona.set(persona.id, w);

        if (audience === 'intermediate') {
          const perPersona = samples.get(persona.id) ?? new Map();
          if (!perPersona.has(lead)) {
            perPersona.set(lead, { fixture: name, ply: move.ply, san: facts.san, classification: facts.classification, text });
          }
          samples.set(persona.id, perPersona);
        }
      }
    }
  }
}

// ---- report ---------------------------------------------------------------

const lines = [];
lines.push('# Corpus report — deterministic coach');
lines.push('');
lines.push(`Generated ${new Date().toISOString()} by \`packages/coach/scripts/corpus.mjs\`.`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| | |');
lines.push('|---|---|');
lines.push(`| Fixture reviews | ${reviews.length} (${reviews.map((r) => `${r.name}: ${r.review.moves.length} plies`).join(', ')}) |`);
lines.push(`| Notes rendered | ${rendered} (plies × 7 personas × 3 audiences) |`);
lines.push(`| Validator violations | **${violations.length}** |`);
lines.push(`| Determinism | ${stable.mismatched} of ${stable.checked} re-renders differed |`);
lines.push(`| Render errors | ${errors.length} |`);
lines.push('');

if (violationsByKind.size > 0) {
  lines.push('### Violations by kind');
  lines.push('');
  lines.push('| kind | count |');
  lines.push('|---|---|');
  for (const [kind, n] of [...violationsByKind].sort((a, b) => b[1] - a[1])) lines.push(`| ${kind} | ${n} |`);
  lines.push('');
  lines.push('### Violations by persona and kind');
  lines.push('');
  const byPK = new Map();
  for (const v of violations) {
    const k = `${v.persona}|${v.kind}`;
    byPK.set(k, (byPK.get(k) ?? 0) + 1);
  }
  lines.push('| persona | kind | count | example |');
  lines.push('|---|---|---|---|');
  for (const [k, n] of [...byPK].sort((a, b) => b[1] - a[1])) {
    const [persona, kind] = k.split('|');
    const ex = violations.find((v) => v.persona === persona && v.kind === kind);
    lines.push(`| ${persona} | ${kind} | ${n} | ${ex.fixture} ply ${ex.ply} ${ex.audience}: ${String(ex.detail).replace(/\|/g, '\\|').slice(0, 80)} |`);
  }
  lines.push('');
  lines.push('### First 40 violations');
  lines.push('');
  lines.push('| fixture | ply | persona | audience | kind | detail |');
  lines.push('|---|---|---|---|---|---|');
  for (const v of violations.slice(0, 40)) {
    lines.push(`| ${v.fixture} | ${v.ply} | ${v.persona} | ${v.audience} | ${v.kind} | ${String(v.detail).replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
}

if (errors.length > 0) {
  lines.push('### Render errors');
  lines.push('');
  for (const e of errors.slice(0, 40)) lines.push(`- ${e}`);
  lines.push('');
}

lines.push('## Words per note, by persona');
lines.push('');
lines.push('| persona | budget | mean | max |');
lines.push('|---|---|---|---|');
for (const [id, w] of wordsByPersona) lines.push(`| ${id} | ${w.budget} | ${(w.total / w.n).toFixed(1)} | ${w.max} |`);
lines.push('');

lines.push('## Lead situations across the corpus (intermediate)');
lines.push('');
lines.push('| lead | plies |');
lines.push('|---|---|');
for (const [lead, n] of [...leadCounts].sort((a, b) => b[1] - a[1])) lines.push(`| ${lead} | ${n} |`);
lines.push('');

lines.push('## Samples, one per lead situation, per persona (intermediate)');
lines.push('');
for (const persona of PERSONAS) {
  const perPersona = samples.get(persona.id) ?? new Map();
  lines.push(`### ${persona.label} — ${persona.style}`);
  lines.push('');
  for (const [lead, s] of [...perPersona].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`**${lead}** · ${s.fixture} ply ${s.ply} · ${s.san} (${s.classification})`);
    lines.push('');
    lines.push(`> **${s.text.headline}**`);
    lines.push('>');
    lines.push(`> ${s.text.whatHappened}`);
    lines.push('>');
    lines.push(`> ${s.text.whyItMatters}`);
    lines.push('>');
    lines.push(`> Better was: ${s.text.betterWas}`);
    lines.push('>');
    lines.push(`> _${s.text.lesson}_`);
    lines.push('');
  }
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, lines.join('\n'));

console.log(`corpus: ${rendered} notes, ${violations.length} violations, ${errors.length} errors, ${stable.mismatched} unstable`);
console.log(`report: ${reportPath}`);
process.exit(violations.length === 0 && errors.length === 0 && stable.mismatched === 0 ? 0 : 1);
