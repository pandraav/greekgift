# greekgift — working notes for Claude

## Design first, in the prototype

The design reference is `docs/design/app.html`: one HTML file, every screen
behind a hash router (`#/home`, `#/review`, `#/share`, …), with the real
tokens, components and copy. **Any new screen, section or state is designed
there first, then implemented in `apps/web`.** Do not start a separate mockup
tool or canvas; extend the prototype so the app and its reference never drift.

- Serve it rather than opening the file: `cd docs/design && python3 -m
  http.server 8000`, then `http://localhost:8000/app.html#/home`. It imports
  chess.js as a module, which `file://` blocks.
- Reuse the prototype's classes (`card`, `gamerow gamerow--compact`, `chip`,
  `btn btn--brass`, `eyebrow`, `notice`, `av`) and add a small named CSS block
  for anything new. Copy exact values into the app; never round them.
- `docs/design/design-guide.md` explains the visual system and lists the
  screens; keep its screen list current when you add one.
- `docs/graphs/` and `docs/superpowers/` are ignored by git and live only on
  this machine. `docs/design/pieces.json` is a build input;
  `docs/superpowers/specs/2026-09-04-coach-personas.md` is the source of the
  committed `packages/coach/src/data/personas.json`, so regenerate that file
  here rather than expecting CI to.

## Specs before code

Anything larger than a one-file change gets a design spec under
`docs/superpowers/specs/` (dated, like the existing ones) and, for wide work, a
graph spec under `docs/graphs/`. The v1 spec's sections 1–4 are frozen
contracts. The accounts, week, library and sharing work is specified in
`docs/superpowers/specs/2026-09-07-accounts-library-sharing-design.md`;
its sections 3–6 are the contracts and the prototype is its visual half.

Research notes live under `docs/superpowers/research/`. Read
`docs/superpowers/research/2026-09-09-review-gaps-and-references.md` before
any work on the review screen: it compares our review with chess.com's Game
Review on a real game, lists the gaps (candidate lines panel, best-move arrow
on the right ply, numeric eval, opening at ply 0, engine depth, opening book,
retry) in tiers with what already exists in the code, and carries the
references for each item.

## Ground rules that are easy to trip over

- The coach is deterministic. No language model anywhere: facts come from the
  engine, prose from `packages/coach`, and the validator proves in tests that
  no note names a move or square outside the facts. Run the corpus after any
  change to the coach: `pnpm --filter @greekgift/web exec tsx
  ../../packages/coach/scripts/corpus.mjs`.
- PGlite is single-process. Never open the local `.pglite` directory from a
  second process while `pnpm dev` runs.
- Never add a `webpack` key to `next.config.ts` (Next 16 hard-fails).
- Env is nine required variables; `.env.example` is the list. GitHub's
  `Production` environment is the source of truth for deploys and overwrites
  Vercel on every push.
- Local dev and the deploy point at the same database. `apps/web/.env.local`
  carries the production Neon `DATABASE_URL`, so `pnpm dev` reads and writes
  real rows, and a new migration must be applied with `pnpm db:migrate`
  before the dev server can serve pages that need it (CI runs the same
  command on deploy and finds it already applied). For throwaway work run
  `DATABASE_URL=pglite://.pglite pnpm dev` instead; that store now survives
  restarts, and instrumentation migrates it at boot.
- Commits and pushes only with the user's explicit approval, and no Claude
  attribution in messages.
