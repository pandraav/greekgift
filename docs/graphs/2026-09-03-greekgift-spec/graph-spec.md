# Graph Spec — greekgift v1 design spec

> Status: DRAFT
> Graph directory: `docs/graphs/2026-09-03-greekgift-spec/`

## Goal

Produce the complete v1 design spec for greekgift by writing four subsystem
sections independently against a frozen contract skeleton, verifying each with
a fresh checker, and merging survivors into one document.

**Final output is literally:** `docs/superpowers/specs/2026-09-03-greekgift-v1-design.md`
with sections 5–8 filled in and internally consistent with sections 1–4.

## Fake-edge audit (gate 3 — REQUIRED)

| Step | Depends on | Real edge? | Why |
|---|---|---|---|
| Write skeleton + shared types (sections 1–4) | user decisions | yes | already done by orchestrator before the run |
| Section 5 Import/data/auth | skeleton | yes (skeleton only) | needs table names, route paths and types; does not need 6/7/8 |
| Section 6 Engine/scoring | skeleton | yes (skeleton only) | needs types and formulas; does not need 5/7/8 |
| Section 7 Coach | skeleton | yes (skeleton only) | needs MoveFacts/CoachText; does not need 5/6/8 |
| Section 8 UI | skeleton | yes (skeleton only) | needs Review/KeyMoment types and page paths; does not need 5/6/7 |
| Section 5 → 6 | — | **NO — fake** | both read the skeleton; neither reads the other's output |
| Section 6 → 7 | — | **NO — fake** | coach consumes MoveFacts, whose shape is frozen in the skeleton |
| Section 7 → 8 | — | **NO — fake** | UI consumes CoachText, frozen in the skeleton |
| Verify each section | that section only | yes | one finding per checker |
| Synthesize | four verified sections | yes | merge only |

**Genuinely independent jobs:** A (import/data/auth), B (engine/scoring), C (coach), D (UI).

## Node contracts

| Node | Job (one, bounded) | IN | OUT (schema-enforced) |
|---|---|---|---|
| writer A | write section 5 (import, data, Better Auth with pending/approved/admin flow, Brevo emails) | skeleton file path + the build guide path | markdown section 5 written to `docs/graphs/.../sections/05-import-data-auth.md` |
| writer B | write section 6 | same | `sections/06-engine-scoring.md` |
| writer C | write section 7 | same | `sections/07-coach.md` |
| writer D | write section 8 | same | `sections/08-ui.md` |
| verifier A–D | try to kill the section | one section file + skeleton, nothing else | `sections/0N-verify.md` with `{ verdict: keep\|revise, issues: [{lens, claim, why, fix}] }` |
| synthesizer | merge survivors into the spec | skeleton + 4 sections + 4 verify files | final spec file; contradictions resolved in favour of the skeleton |

Writers must not modify the skeleton. Each section must: use only the frozen
types, read env only through `env.ts` (never `process.env`), name every library
with an exact npm package name and version, cite a
URL for every formula or threshold taken from elsewhere, and contain no "TBD".

## Model map

| Role | Model | Used for |
|---|---|---|
| Writers A–D | sonnet | drafting sections |
| Verifiers A–D | current session model | attacking each section |
| Synthesizer | current session model | merge and consistency |
| Orchestrator | current session model | split, guard, report |

## Verify plan

- Context: fresh and empty per verifier; it receives only the section and the skeleton.
- Lenses per claim (majority keeps):
  1. **Correct** — formula, API shape, library capability, or threshold is right.
  2. **Consistent** — matches the frozen contracts in sections 1–4 (replaces "current").
  3. **Source real** — every cited URL resolves and says what is claimed; every npm package and version exists (`npm view`).
- A section with any `revise` issue is returned to the orchestrator, who applies the fix inline (no second writer round) if the fix is stated; otherwise the issue is logged and surfaced to the user.

## Fan-in plan

- Expected results: 4 sections + 4 verify files = 8.
- Strategy: flat merge (far below the layering threshold).

## Isolation audit (hidden edges)

| Shared resource | Nodes touching it | Mitigation |
|---|---|---|
| skeleton spec file | all | read-only for writers and verifiers; only synthesizer writes it |
| `sections/` directory | writers | one file per writer, distinct names |
| npm registry / GitHub / chess.com support pages | verifiers | read-only, low volume, no rate-limit risk |

## Caps and cost

- **Max agents (hard):** 9 (4 writers, 4 verifiers, 1 synthesizer)
- **Max rounds:** 1, plus at most one re-dispatch of a single failed node
- **Estimated spend:** about 2 million tokens (writers ~150k each, verifiers ~200k each, synthesizer ~400k)
- **On hitting the cap:** stop and report which section is missing; do not merge a partial set.

## Anchors (gate 6)

- lichess `AccuracyPercent.scala` fetched from GitHub and its constants compared to section 6.
- chess.com support article 8572705 fetched and its expected-points bands compared to section 6.
- `npm view <pkg> version` for every package named in sections 5–8 (`next`, `chess.js`, `chessground`, `stockfish`, `drizzle-orm`, `@neondatabase/serverless`, `ai`, `@ai-sdk/openai-compatible`, `better-auth`, `@getbrevo/brevo`, `@t3-oss/env-nextjs`, `zod`, `vitest`, and any others the writers introduce).
- Better Auth docs page for the Drizzle adapter, email/password and email verification fetched and compared to section 5.
- `curl -sI https://api.brevo.com/v3/smtp/email` returns a non-5xx response (endpoint in section 5).
- `curl -sI https://api.chess.com/pub/player/hikaru/games/archives` returns 200 (endpoint shape in section 5).
- `curl -sI https://openrouter.ai/api/v1/models` returns 200 (endpoint in section 7).

## Human gate

- Nothing is committed or scaffolded. The merged spec is presented for the user's review before the writing-plans skill runs.
- Destructive steps in scope: none.

## Stop conditions

- Cap fired · any anchor fails · a writer returns a section that changes the skeleton contracts · fewer than 4 sections returned.

## Git policy

- Commits/pushes: NONE without explicit user approval. Work stays on the tree.
