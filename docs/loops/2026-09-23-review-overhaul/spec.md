# Loop Spec — Review overhaul: games, board, accuracy, coach, lines, analysis

> Status: APPROVED (by user, 2026-09-23, "approved, start the loop")
> Loop directory: `docs/loops/2026-09-23-review-overhaul/`
> Source: status report of 2026-09-23 (four read-only audits: board flicker,
> missing games, coach perspective, analysis accuracy).

## Goal

Make the game review trustworthy and close to chess.com's Game Review. Every
recent chess.com game is imported. The board holds still while stepping. The
engine's verdicts are deeper and classified like chess.com's. The coach speaks
to the member's own side. Engine lines explain the move actually played and
work for lines the reader explores. The review offers a walkthrough of key
moments with retry, plus a game report.

## Success criteria (ALL must pass to exit the loop)

| # | Criterion | How it is verified (observable) |
|---|---|---|
| 1 | **Games: fresh fetch.** Refresh of a linked account imports games that finished minutes ago; the current month and the archives list are never served from a stale Next cache. | Code: `chesscom.ts` uses `cache: 'no-store'` for the current month and archives. Unit test proves it. Browser: after Refresh, the home card / `/u/{user}` list matches the live `api.chess.com/pub/player/{user}/games/{YYYY}/{MM}` for the last 7 days (count and newest id). |
| 2 | **Games: no gaps.** Refresh fetches every month from the month of `lastRefreshedAt` (or the previous month, whichever is earlier) to now, without gating the current month on the archives list. | Unit tests for `monthsToRefresh` cover an Aug 20 → Sep 10 gap and the 1st of a month. |
| 3 | **Games: nothing hidden silently.** The home card shows all week games or an "N more this week" link to `/u/{user}`. Skipped games (variants, aborted, unparseable) are counted and shown. | Browser: home card with more than 10 week games shows the link. Unit test for the skipped count. |
| 4 | **Board holds still.** Stepping 20 plies with the arrow keys moves neither the board's top edge nor its width. | Browser: record `board.getBoundingClientRect()` at every ply for 20 steps. Top and width are identical (±0.5px) at desktop 1440px and at 390px phone width. |
| 5 | **Board: no stale selection.** A tap highlight and its legal-move dots clear when the position changes. | Unit/component test, plus a browser check. |
| 6 | **Engine is deeper and deterministic.** Default budget is 2M nodes. `ucinewgame` is sent and the hash is cleared per position. `ENGINE_BUILD` or the nodes key changes, so old reviews are not served as new. | Code, plus an engine test that the same position gives the same result twice. Browser: the review header shows the new depth (≥18 typical). |
| 7 | **Classification matches chess.com's rules.** (a) Chess.com-style thresholds. (b) Best = no loss vs the top line; a MultiPV move at equal eval counts. (c) The played move's score comes from `evalBefore.lines` when it is one of the lines. (d) Miss: parity-matched line comparison; no capture-value term; allowed at blunder level after the opponent's error. (e) Missed mate is flagged. (f) Brilliant needs a ≥ minor-piece sacrifice, not already winning; capture sacrifices count. (g) Book stops at the first non-book move (no late transposition). (h) The graph and bar show mate at the end. | Engine unit tests, one per rule (a–h). All engine tests pass. |
| 8 | **Accuracy formula is lichess's.** Volatility weights are the win% stdev over windows of plies/10, as lichess does it. | Unit test against a known lichess example. |
| 9 | **Coach speaks to the member's side.** The review page derives `userSide` ('w' / 'b' / null) from linked accounts. The coach renders the member's moves as "you" and the opponent's as "your opponent" / "they". Opponent errors are framed as chances for the member. With null, it uses neutral White/Black. `coach_texts` is keyed by perspective. The board opens from the member's side. | Coach tests run every validator/corpus case under w, b and null. The corpus script passes. Browser: a game the member played as Black opens flipped, and an opponent move's note does not say "your winning chances fell". |
| 10 | **Engine lines explain the played move.** At a ply, the card shows the engine's best line for the move just played (from `fenBefore`), next to the played move's own score, plus the lines for the position now on the board. The eval number sits on or at the eval bar. The bar flips with the board. The mate caption names the side. | Browser at plies 0, 1, 27 and the last ply. `lines.test.ts` is extended. |
| 11 | **Live engine for explored lines.** Leaving the game (dragging a move or playing a line) runs the client engine on that position and shows three lines with evals. Results are cached per FEN, and stale results are cancelled on the next step. | Browser: play a line two moves deep; three lines appear within ~10s. |
| 12 | **Key moments walkthrough with retry.** "Key moments" steps through `keyMoments` in order. At each of the member's errors the reader can try a move. The client engine scores the attempt: better / same / worse than played, and best or not. The attempt can be retried or revealed. | Designed in `docs/design/app.html` first. Browser walk of three moments, including one retry. |
| 13 | **Game report.** A summary before the moves, for both sides: accuracy, class tally, phase accuracies (opening / middlegame / endgame), the key moments list, and the opening name with how far book went. | Designed in the prototype first. Browser check. |
| 15 | **Coach speaks about a finished game.** *(Added mid-loop by the user, 2026-09-23.)* Notes are retrospective: past tense for what happened and what could have happened ("you played", "White had", "c6 would have kept"). Advice is future tense, aimed at the next game ("next time, before…"). No present-tense narration as if the game were still going ("What are you doing?", "is just hanging"). | Coach tests: a tense validator over the corpus with a banned present-tense narration list, run for all personas and perspectives. Browser: the notes for 23…Rxd5 and 13.e4 on /g/184263578210 read in the past tense with forward-looking advice. |
| 16 | **Coach explains the line.** *(Added mid-loop by the user.)* For inaccuracy, mistake, blunder and miss, the note says concretely *why*: the opponent's refutation from the stored line (e.g. "White had 24.Qc4, pinning the rook on d5 to your king on g8; after 24…Kh8 25.exd5 you were a rook for a pawn down"), with the tactic named when a detector finds it (pin, fork, skewer, discovered attack, hanging piece, mate threat), plus the better move and what it would have kept ("23…c6 would have kept the game level, +0.7"). Claims like "hanging" / "nobody defends it" are made only when true in that position. The validator still proves every move and square comes from the facts. | Coach and engine tests at 23…Rxd5 (FoggyDJohnson–KAFKA_F0, 184263578210) asserting Qc4, the pin on d5 to g8, exd5 and c6 appear. Corpus 0 violations. Browser: the 23…Rxd5 note explains the Qc4 pin. |
| 17 | **Clocks are read.** *(Added by the user, 2026-09-24.)* Each move's `%clk` from the stored PGN is parsed into the review: clock left after the move, and time spent (previous clock − clock + increment, from `TimeControl` "600", "180+2" or daily "1/86400"). Games without clocks degrade cleanly. A SCORING_VERSION bump rebuilds stored reviews from cached evals with no engine run. | Engine tests on real PGNs (a 600 live game, a +increment game, a daily game). Browser: the notation and "The move" row show the time spent per move. |
| 18 | **The review knows how the game ended.** Termination is classified (checkmate, resignation, timeout, timeout vs insufficient material, abandonment, agreement, repetition, stalemate, insufficient material, 50-move) along with who won. When a game ended off the board, the review says so with the position's verdict at that moment, e.g. "You lost on time at move 29 while +2.3 up: the position was winning" or "Your opponent resigned in an equal position". The last ply shows a game-over card instead of just stopping. | Tests per termination kind using real chess.com PGN headers. Browser: /g/184269442794 (lost on time) shows the end card with the eval at timeout. The report headline states the game ended on time. |
| 19 | **Time management in the report.** A clock graph for both sides over the moves, with a time-trouble band. Time used per phase. Longest thinks. Time-trouble moves (under 10% of base time or 30s). Error correlation: mistakes and blunders made in time trouble, fast errors (well under the player's median think), and long thinks followed by an error. Numbers come only from clocks and classifications. | report.ts tests. Designed in the prototype first. Browser: /g/184269442794 report shows the clock graph and the time insights. |
| 20 | **Coach knows the clock ("thought process").** Notes mention time only when it's relevant, in the past tense: "You played this in 2 seconds with 7 minutes left", "You spent 1:42 here and still missed 24.Qc4", "With 12 seconds left, …". A game lost on time gets a final note explaining the clock ran out and what the position was. The validator allows time figures only from the facts. | Coach tests + corpus with clock facts. Browser: an error made quickly, and the final move of /g/184269442794. |
| 14 | **Gates green.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the coach corpus script all pass. | Command output logged in `status.md`. |

## Scope

**In scope:**
- `apps/web`: lib, review screen, board, home, library, API routes, engine client/pool, globals.css.
- `packages/engine`, `packages/coach`, `packages/db` (schema plus one additive migration).
- `docs/design/app.html`, `docs/design/design-guide.md`.
- A new dated spec under `docs/superpowers/specs/`, and the v1 / accounts specs where contracts change.
- `personas.json`: regenerated from the personas spec if persona lines change.

**Out of scope:**
- Auth and sharing flows.
- Deploy config and env vars.
- A server-side engine.
- A polyglot opening book (a stretch item, logged if skipped).
- Stockfish WDL model.
- Anything in `next.config.ts` (never add a `webpack` key).

## Assumptions ledger (mid-loop ambiguity resolution)

| Situation | Pre-agreed resolution |
|---|---|
| **Database** (user chose "Production via :3000") | Verify on the running :3000 server against production Neon. The coach-perspective migration is **additive only**: a new column with a default, and the unique key widened. It is applied with `pnpm db:migrate` against production during the loop. No `DROP` of tables or columns, no deletes of user, game, library or share rows. |
| Stale cached reviews and coach texts | Never deleted. A new `ENGINE_BUILD` / nodes key and the new perspective key make new rows; old rows stay and simply stop being read. |
| Frozen contracts (v1 §1–4, accounts §3–6, coach contracts) | Changed only through the new spec `docs/superpowers/specs/2026-09-23-review-overhaul-design.md`, written before code. Additive fields are preferred to renames. |
| Chess.com thresholds are unpublished | Use win%-drop ladders from Chesskit/wintrchess (2/5/10/20 points of win%, i.e. 0.02/0.05/0.10/0.20 EP). Document the source in the spec. |
| Re-analysis cost at 2M nodes | The client engine re-reviews on open. The WeekReader drains the queue as today. No bulk server re-analysis. |
| `userSide` for a game played by two linked accounts | Prefer the account on the page the member came from, else White. |
| Coach wording for opponent moves | Third person ("your opponent", "they"), with win% restated from the member's side. The corpus validator must still prove no invented moves or squares. |
| Dev server needs a restart (e.g. new deps) | Only the :3000 process started from this repo may be restarted, and only on port 3000. No other port or process is touched, ever. |
| A test fails because of a pre-existing issue unrelated to the work | Fix it if it's a one-liner; else log it and continue. |
| Anything not listed | Narrowest, lowest-risk interpretation; log the decision and the alternative in `status.md`. |

## Model map

| Role | Model | Used for |
|---|---|---|
| Orchestrator | Opus 5.5 (this session) | planning, dispatch, verification judgment |
| Implementer | Opus | code edits |
| Explorer | Opus | read-only investigation |
| Tester / reviewer | Opus | gates, code review |
| Browser E2E | Orchestrator itself | claude-in-chrome, driven directly |

## Verification plan

- Browser tool: claude-in-chrome. **Proven in Phase 0:** a screenshot of `http://localhost:3000/login` (tab 878061399) on 2026-09-23.
- Target: `http://localhost:3000`, the member's own logged-in session. **The user logs in once in that tab before the loop starts**; Claude never types a password.
- Flows each iteration:
  - home: the linked-account card, then Refresh;
  - `/u/{user}` list compared with the live chess.com API;
  - `/g/{id}` review:
    - step 20 plies at 1440px and at 390px;
    - lines card at plies 0, 1, 27 and the last;
    - flip, and live lines;
  - key moments with retry;
  - game report.
- Evidence: screenshots saved to disk and command output, all indexed in `status.md`.

## Stop conditions

- Max iterations: 10.
- Hard bail-outs, which pause the loop and ask the user:
  - a migration that would need a destructive change;
  - any production data loss;
  - a need to push or deploy;
  - the login session expiring (the user must log in again);
  - a discovery that invalidates a criterion.

## Git & docs policy

- Commits and pushes: **none** without explicit user approval (repo and global rules). Work stays on the tree. At the end I propose a commit plan, with no Claude attribution.
- Branch: `accounts-library-sharing` (current).
- Docs updated with the code:
  - `docs/design/app.html` and `design-guide.md` (screen list);
  - the new spec under `docs/superpowers/specs/`;
  - the research note's gap table, marked as closed;
  - `CLAUDE.md` if a working rule changes.
