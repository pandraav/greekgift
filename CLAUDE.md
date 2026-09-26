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
references for each item. Its status block (2026-09-23) records what is
closed; still open are a real opening book (lichess named lines stop short of
chess.com's book) and Stockfish's WDL model.

The review as it stands is specified in
`docs/superpowers/specs/2026-09-23-review-overhaul-design.md`:
- engine, classification and lichess accuracy (§4–5);
- coach perspective (§6);
- lines card, live engine, key moments with retry, game report (§7–10);
- the coach's retrospective voice and line explanation (§13);
- clocks, time control and how the game ended (§14).

Its §3 lists the frozen contracts it amends. Change the review through that
spec, not around it.

## Loops

Long autonomous runs keep an approved spec and an append-only status log in
`docs/loops/<date>-<slug>/`, which is committed. The review overhaul is in
`docs/loops/2026-09-23-review-overhaul/`. Screenshots that show the member's
email stay out of commits.

## Ground rules that are easy to trip over

- Two version keys decide what a reader sees. Bump the right one, or
  production keeps serving old results.
  - **`SCORING_VERSION`** (`packages/engine/src/version.ts`) is part of the
    `reviews` key. Bump it with any change to:
    - classification, the book, accuracy or key moments;
    - the report, clocks or the ending.

    Position evals are not versioned, so a bump rebuilds each review from its
    cached evals on next open, without running the engine.
  - **`COACH_VERSION`** (`packages/coach/src/render.ts`) is folded into
    `coach_texts.review_key`. Bump it with any change to coach prose, so notes
    regenerate without a migration.
- The coach is deterministic. No language model anywhere: facts come from the
  engine, prose from `packages/coach`, and the validator proves in tests that
  no note names a move or square outside the facts. Run the corpus after any
  change to the coach: `pnpm --filter @greekgift/web exec tsx
  ../../packages/coach/scripts/corpus.mjs`. It must report 0 violations.
- The coach speaks to the member's side about a finished game.
  - **Perspective:** `userSide` comes from the linked accounts (`?from=` breaks
    ties), and notes are stored per perspective (`w`, `b`, or `n` for neutral).
  - **Tense:** events are in the past tense; advice is for next time.
  - **Errors are explained by the refutation line** (`refutation.ts`) and the
    better move.
  - **Time only when it mattered:** fast, long-think and time-trouble errors,
    and the game's end.
  - **Validator rules enforce all this:** `wrong_perspective`, `present_tense`,
    `false_capture`, `bare_numbers`, `fragment`, `repeats_label`,
    `invented_time`.
- Engine budgets live in `apps/web/src/lib/engine/settings.ts`: reviews use
  2M nodes and live analysis 1M. Every search starts with `ucinewgame` and
  Clear Hash, so results don't depend on what a worker searched before.
- Clocks are read from the raw PGN (`packages/engine/src/clock.ts`), because
  chess.js strips `[%clk]` comments. In daily games chess.com's `%clk` is the
  time taken, not the time left, so daily games get no time report.
- Never let Next's fetch cache serve chess.com's archives list or an open
  month. Time-based revalidation hands back a stale copy on the first request
  after expiry, and that is how recent games once went missing.
- PGlite is single-process. Never open the local `.pglite` directory from a
  second process while `pnpm dev` runs.
- Never add a `webpack` key to `next.config.ts` (Next 16 hard-fails).
- Env is nine required variables; `.env.example` is the list. GitHub's
  `Production` environment is the source of truth for deploys and overwrites
  Vercel on every push. CI deploys only on a push to `main`; pushes to a
  branch with an open PR run the checks and skip `deploy-production`.
- Local dev and the deploy point at the same database. `apps/web/.env.local`
  carries the production Neon `DATABASE_URL`, so `pnpm dev` reads and writes
  real rows, and a new migration must be applied with `pnpm db:migrate`
  before the dev server can serve pages that need it (CI runs the same
  command on deploy and finds it already applied). For throwaway work run
  `DATABASE_URL=pglite://.pglite pnpm dev` instead; that store now survives
  restarts, and instrumentation migrates it at boot.
- `pnpm db:migrate` reads the root `.env`, which points at the same
  production Neon database. Claude's permission checks may block running it
  against production. If so, ask the user to run `! pnpm db:migrate`. Keep
  migrations additive.
- Browser checks run in the user's logged-in Chrome tab; Claude never types
  passwords.
  - An automated tab reports `document.hidden`, so Chrome throttles
    `setTimeout`. Wait on `MessageChannel` ticks instead.
  - Keep each page evaluation under 45 seconds. A timed-out script keeps
    running in the page.
- Commits and pushes only with the user's explicit approval, and no Claude
  attribution in messages.
