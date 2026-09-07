# greekgift

A chess game reviewer for me and a handful of friends. Enter a chess.com
username, pick a game, and get what chess.com's Game Review gives you — move
classifications, accuracy, an estimated rating, an eval graph, engine lines,
playable variations — plus a coach who explains what happened in words, in the
voice of a creator you pick.

Invite-only, non-commercial, one free tier and no plan.

## The one idea worth knowing

**The engine decides what is true. Deterministic code decides which of it is
worth saying. Deterministic code also decides how it sounds.**

There is no language model anywhere in this pipeline. Stockfish evaluates,
`packages/engine` extracts a list of verified facts about the position, and a
rule-based coach in `packages/coach` turns those facts into prose in the
reader's chosen voice — the same facts always render to the same words. The
validator proves this in tests, not at request time: it runs over a fixture
corpus in every persona and every audience and fails if any note
names a move or a square outside the facts.

See
the deterministic coach design spec §1 (kept locally under `docs/superpowers/`, not in the repo).

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
docs/superpowers/  design specs (local only, ignored by git)
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

Nine variables, all required in production; `pnpm env:check` exits non-zero
if any is missing. `.env.example` documents each one. The two that decide how
much you need:

| variable | what happens without it |
|---|---|
| `DATABASE_URL` | falls back to PGlite, a Postgres build that runs in-process from `.pglite/` — same schema, same migrations, no account needed |
| `BREVO_API_KEY` | emails print to the terminal instead of sending, so the verify → approve loop is fully walkable offline |

The coach needs no key at all — it is deterministic code, not a model call,
so it always has an answer.

So `pnpm dev` works with an empty `.env`. Production hard-requires all nine.

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

## Deployment

**Vercel Hobby, driven from GitHub Actions.** Vercel is not Git-connected.
A push to `main` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

1. **Gate** — typecheck, lint, test, and a `next build` against the committed
   `.env.example` placeholders (env validation cannot be skipped in production
   mode, so the gate builds with schema-valid stand-ins). Runs for pull
   requests too. There are no preview deployments.
2. **Deploy** (push to `main` only) — sync env → `vercel pull` →
   `vercel build --prod` → `pnpm db:migrate` → `vercel deploy --prebuilt --prod`.

Production: <https://greekgift-pnd4.vercel.app>.

### Where values live

The GitHub Environment **`production`** is the only source of truth.
`scripts/vercel-env-sync.sh` upserts every variable into the Vercel project on
each deploy, so **a value edited in the Vercel dashboard is overwritten on the
next push.** `NEXT_PUBLIC_*` values are baked into the client bundle at build;
changing one means redeploying.

| GitHub secret | GitHub variable |
|---|---|
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` (both `https://greekgift-pnd4.vercel.app`) |
| `DATABASE_URL` (Neon, pooled) | `ADMIN_EMAILS`, `EMAIL_FROM` |
| `BETTER_AUTH_SECRET` | `NEXT_PUBLIC_ENGINE_NODES`, `NEXT_PUBLIC_ENGINE_BUILD` |
| `BREVO_API_KEY` | |

Secrets are stored in Vercel as `sensitive` (write-only) and the rest as
`encrypted`. CI never reads `.env` or `.env.local`.

**Adding a variable** touches five places: `apps/web/src/env.ts`,
`.env.example`, the `deploy-production` job's `env:` block in `ci.yml`, the
key array in `scripts/vercel-env-sync.sh`, and the GitHub Environment. Then
push `main`.

**Rotating a secret:** change it in the GitHub Environment and re-run the
latest `main` workflow (Actions → Re-run). Rotating `BETTER_AUTH_SECRET` signs
everyone out.

### Migrations

`packages/db/migrations` is applied by `pnpm db:migrate` in the deploy job —
after the build succeeds, before the deploy — against the same Neon
`DATABASE_URL`. The step refuses a PGlite or `file:` URL. Locally, run
`pnpm db:generate` after a schema change and commit the SQL; the deploy applies
it.

### Monorepo on Vercel

The Vercel project is linked at the **repo root** with Root Directory
`apps/web`. Every `vercel` command runs from the repo root; `vercel build`
honours the root directory and writes `.vercel/output` for the prebuilt
deploy. `.vercel/` is gitignored.

### Bootstrap (once)

1. `vercel login` as the personal account; `vercel whoami` to confirm. If the
   CLI links the Git repo automatically, run `vercel git disconnect`.
2. From the repo root: `vercel link` → new project `greekgift`, code directory
   `apps/web`.
3. Dashboard → Settings: Root Directory `apps/web`, Node 22.x, Git not
   connected.
4. `.vercel/project.json` gives `projectId` → `VERCEL_PROJECT_ID` and `orgId`
   → `VERCEL_ORG_ID`.
5. Account Settings → Tokens → create one for GitHub Actions → `VERCEL_TOKEN`.
6. GitHub → Settings → Environments → `production`, deployment branch `main`,
   no required reviewers. Add the secrets and variables from the table above.
7. Push `main`.

### Gotchas

- **The Vercel token must have Full Account scope.** A team-scoped token can
  upsert env vars over REST but the CLI's first request is to the account-level
  user endpoint, which it refuses, and `vercel pull` fails with "Could not
  retrieve Project Settings".
- **Deployment Protection defaults to guarding the `.vercel.app` production
  URL.** Without a custom domain every request 302s to Vercel's SSO page. Set
  Settings → Deployment Protection → Vercel Authentication to *Only Preview
  Deployments* (`ssoProtection.deploymentType = "preview"` via the API).
- A `BREVO_API_KEY` that looks like a placeholder silently selects the console
  transport: sign-up appears to work and nobody receives a verification email.
  Runtime Logs show `[email] transport: brevo` when the real key is in place.
- Vercel can reject a deploy for a commit author it cannot match to the account
  and still exit 0. The deploy step greps for that and fails the job. If it
  ever happens, enable the commented-out "Override commit author" step in
  `ci.yml`, which re-authors HEAD locally in the runner without pushing.
- The engine assets under `/engine/` are cached for a year as immutable. If the
  `stockfish` package is bumped without renaming the build, rename `BUILD` in
  `apps/web/scripts/prepare-engine.mjs` and `ENGINE_BUILD` in
  `apps/web/src/lib/engine/client.ts` together, or readers keep the old bytes.

## Docs

- Design spec (`docs/superpowers/specs/2026-09-03-greekgift-v1-design.md`, local only) — decisions, contracts, and how each subsystem actually works
- [Design guide](docs/design/design-guide.md) — the visual system: materials, type, components, the board
- Coach personas (`docs/superpowers/specs/2026-09-04-coach-personas.md`, local only) — the seven voices, and the source of `personas.json`
- [`docs/design/app.html`](docs/design/app.html) — the interactive prototype, all eleven screens. The reference the app was built against. Serve it (`cd docs/design && python3 -m http.server 8000`) rather than opening the file directly — it imports chess.js as a module, which `file://` blocks

Two files under `docs/` are build inputs rather than documentation —
`docs/design/pieces.json` and the personas spec. Deleting either breaks a
build script.
