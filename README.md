# greekgift

A chess game reviewer for me and a handful of friends. Enter a chess.com
username, pick a game, and get what chess.com's Game Review gives you — move
classifications, accuracy, an estimated rating, an eval graph, engine lines,
playable variations — plus a coach who explains what happened in words, in the
voice of a creator you pick.

Invite-only, non-commercial, one free tier and no plan.

## The one idea worth knowing

**The engine decides what is true. Deterministic code decides which of it is
worth saying. The model only decides how it sounds.**

A language model asked to explain a chess move will invent a fork that is not
there, fluently and in the right voice. So it is never asked. Stockfish
evaluates, `packages/engine` extracts a list of verified facts about the
position, and the model is handed that list and a persona. Anything it says
that names a move or a square outside the facts is rejected before it is
stored, and a deterministic template answers instead.

This is also why chess ability is not a criterion when choosing a model — see
[`docs/superpowers/specs/2026-09-03-greekgift-v1-design.md`](docs/superpowers/specs/2026-09-03-greekgift-v1-design.md) §7.

## Analysis runs in your browser

Stockfish 18 (`lite-single`, 6.9 MB, 5.4 MB gzipped) runs as a Web Worker on
the reader's own machine, four workers pulling from a shared queue. A
60-ply game takes about 15 seconds. Results are stored, so the second person
to open a game waits for a fetch rather than for Stockfish.

The node budget is fixed (`go nodes N`, never `movetime`) so the same game
produces the same numbers on a fast desktop and a slow phone. Both the node
count and the engine build are part of the cache key.

## Layout

```
apps/web/          Next.js 16 app — screens, API routes, the board, the engine client
packages/engine/   pure TypeScript: PGN, scoring, opening book, motifs, buildReview
packages/coach/    personas, prompt assembly, the validator, the template fallback
packages/db/       Drizzle schema, migrations, driver selection
packages/email/    React Email templates, Brevo and console transports
docs/design/       the HTML prototype, the piece set, and the design guide
docs/superpowers/  the design spec and the coach personas spec
```

`packages/engine` and `packages/coach` have no framework and no I/O. They are
the parts worth testing, and they hold the tests.

## Running it

Needs Node ≥ 22 and pnpm 10.15.

```bash
pnpm install
cp .env.example .env        # then fill it in — see below
pnpm db:migrate
pnpm dev                    # http://localhost:3000
```

### Environment

Eleven variables, all required in production; `pnpm env:check` exits non-zero
if any is missing. `.env.example` documents each one. The two that decide how
much you need:

| variable | what happens without it |
|---|---|
| `DATABASE_URL` | falls back to PGlite, a Postgres build that runs in-process from `.pglite/` — same schema, same migrations, no account needed |
| `BREVO_API_KEY` | emails print to the terminal instead of sending, so the verify → approve loop is fully walkable offline |
| `OPENROUTER_API_KEY` | the coach falls back to its deterministic template, which always has an answer |

So `pnpm dev` works with an empty `.env`. Production hard-requires all eleven.

**PGlite is single-process.** Querying it from a second terminal while `pnpm dev`
is running does not block — it corrupts `.pglite/`. Delete the directory and
re-migrate if that happens.

### Commands

| | |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm test` | Vitest across every package |
| `pnpm typecheck` | tsc across every package |
| `pnpm lint` | ESLint |
| `pnpm env:check` | fail if a required variable is missing |
| `pnpm db:generate` | generate a migration from the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm email` | preview the email templates |

Three files are generated and committed rather than built on install, so a
clone builds offline and without network:

| generated | from | by |
|---|---|---|
| `packages/engine/src/data/openings.json` | lichess's opening book (five TSVs, fetched) | `packages/engine/scripts/build-openings.mjs` |
| `packages/coach/src/data/personas.json` | `docs/.../2026-09-04-coach-personas.md` | `packages/coach/scripts/build-personas.mjs` |
| `apps/web/src/components/board/pieces.ts` | `docs/design/pieces.json` | `apps/web/scripts/build-pieces.mjs` |

**Edit the source, run the script — never the generated file.** Each carries a
header saying so.

## Access

Invite-only by design. Anyone can ask; one admin approves by hand.

sign up → verify email → *pending* → an admin approves → the app opens.

An email listed in `ADMIN_EMAILS` is promoted to admin on first sign-in.
`src/proxy.ts` redirects unapproved traffic, but **every route handler
re-checks the session server-side** — the proxy is a convenience, the handler
is the security boundary.

## Third-party

| | licence | note |
|---|---|---|
| Stockfish 18.0.8 | GPL-3.0 | served to the browser from `public/engine`, unmodified, copied from `node_modules` at build time. Source: [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) |
| chess.js 1.4.0 | BSD-2-Clause | move generation and validation |
| Cburnett piece set | BSD-3 option | the Wikimedia files are multi-licensed `{{self\|GFDL\|BSD\|GPL}}` |
| lichess opening book | CC0 | 3,810 positions, compiled to EPD keys |
| Win% and accuracy curves | — | lichess's published formulas, cited at each use in `scoring.ts` |
| Classification ladder | — | WintrChess's expected-points thresholds, with one documented deviation |

Coach personas are written in the *style* of public chess creators. None of
them claims to be that person, and the app says so where a reader can see it.
See the personas spec for the reasoning.

## Docs

- [Design spec](docs/superpowers/specs/2026-09-03-greekgift-v1-design.md) — decisions, contracts, and how each subsystem actually works
- [Design guide](docs/design/design-guide.md) — the visual system: materials, type, components, the board
- [Coach personas](docs/superpowers/specs/2026-09-04-coach-personas.md) — the seven voices, and the source of `personas.json`
- [`docs/design/app.html`](docs/design/app.html) — the interactive prototype, all eleven screens. The reference the app was built against. Serve it (`cd docs/design && python3 -m http.server 8000`) rather than opening the file directly — it imports chess.js as a module, which `file://` blocks

Two files under `docs/` are build inputs rather than documentation —
`docs/design/pieces.json` and the personas spec. Deleting either breaks a
build script.
