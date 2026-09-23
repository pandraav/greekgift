# Status — Review overhaul loop

> Spec: `spec.md` (APPROVED 2026-09-23). Append-only log. Times are local (IST).

## Phase 0 (pre-flight)

- Browser proven: claude-in-chrome tab 878061399, screenshot of `/login`, then of `/` after the user logged in.
- Answers: Production via :3000 · Opus for everything · Everything in scope · 2M nodes.
- Servers present before the loop (none touched): :3000 next dev (this repo), :8000 design prototype, plus unrelated ports.

## Baseline

- Home shows linked accounts kafka_0 and kafka_f0, both reading "No games this week". Evidence: `evidence/00-baseline-home-no-games.jpg`.
- Live chess.com (2026-09-23): kafka_f0 has 72 games in 2026/09, **26 in the last 7 days** (all rapid, rules=chess), newest id 184263578210 at 16:25 UTC. kafka_0's last archive is 2023/05, so 0 is correct for it.
- So criterion 1 fails harder than a stale cache would explain: 0 of 26 shown.

## Iteration 1

### Dispatch 1.1 (parallel; files disjoint) — all Opus
- **spec+prototype**: writes `docs/superpowers/specs/2026-09-23-review-overhaul-design.md` (contracts for criteria 6–13) and designs lines card v2, key moments with retry, and game report in `docs/design/app.html`, plus `design-guide.md`. Blocks the engine and coach code.
- **games** (criteria 1–3): root-causes 0 of 26 shown, then implements no-store fetches, gap-free months, stamp-on-success, "N more" link and the skipped count. apps/web fetch/refresh/home only.
- **board** (criteria 4–5): stable layout (fixed-height lines area, coach card always mounted, scrollbar-gutter, overflow-anchor), selection reset on fen change, faster bar transition.

### Board agent result + VERIFY (criteria 4–5)
- Gates reported by the agent: web test 102 pass / 1 skip; typecheck clean; lint clean.
- Browser, /g/173953106852, 20 ArrowRight steps, rect of the board grid:
  - 1224px viewport, scrollY 300: topΔ 0, widthΔ 0, page height constant at 2145.
  - 606px (narrowest the window allows; the move buttons stack under the board): topΔ 0, widthΔ 0, height constant at 2907, scrollY constant at 900. **PASS (4)**, with the note that the 390px target was unreachable because Chrome's minimum window width is ~500px.
  - Real click on e2 selects it (2 dots); ArrowRight clears them. The only remaining `rounded-full` is the verdict badge on d4. **PASS (5)**.
- ISSUE 1.a (task): entering a line swaps the hint row for the taller "your line" banner, so the board shifts down about 20px. Also, a click right after load once landed as a drag (f2→f3), suggesting a post-hydration layout shift. → sent back to the board agent.

### Games agent result + VERIFY (criteria 1–3)
- **Root cause of 0 of 26:** Next's data cache serves the stale current-month body (stale-while-revalidate, `patch-fetch.js` ~L801–821). The auto-refresh at 16:50 UTC imported the 9-Sep copy of 2026/09 and stamped `lastRefreshedAt`, which blocked any further auto-refresh for an hour.
- Changes:
  - `chesscom.ts`: no-store for the archives list and open months (a month counts as open until 2 days after it ends).
  - `import.ts`: `classifyGame` returns a skip reason for variants, aborted games and unparseable PGNs.
  - `refresh-account.ts`: `monthsToRefresh(now, lastRefreshedAt)` covers every month since the last refresh (cap 12), with no archives gate; the stamp is written only on success.
  - refresh route: returns `{stored, months, skipped}`.
  - home card: 10 rows plus an "N more this week ›" link; the card foot shows the skipped note.
  - Tests: chesscom.test.ts (7), refresh-account.test.ts (10, including a real kafka_f0 fixture over PGlite).
  - Gate: 118 pass / 1 skip; typecheck and lint clean.
- Limitation (logged): the skipped count has no DB column, so it shows only after a refresh in the current visit.
- Browser:
  - Home kafka_f0 card: the newest row is /g/184263578210 (it matches the live API's newest), 10 rows plus "16 more this week ›" → /u/kafka_f0.
  - Manual Refresh returns `{"refreshed":true,"stored":99,"months":["2026-09","2026-08"],"skipped":{"count":0}}`.
  - /u/kafka_f0: "LAST 7 DAYS · 26 played · 26 read", 99 games in total.
  - Evidence: `evidence/01-home-after-games-fix.jpg`.
  - **PASS 1, 2 (unit tests), 3.**
- Prototype gap (task): the "N more this week ›" row and the skipped note still need adding to `docs/design/app.html`, after the spec agent frees the file.

### Board re-verify after the banner fix
- Entering a line (tap e2, tap e4): board top 269.89 before and after. **Banner slot PASS.**
- **ISSUE 1.b (critical, pre-existing in HEAD):** the board grid has no row template. At 1440×647 the rows are `76.4 76.4 26.3 26.3 26.3 76.4 76.4 76.4`px while squares are 57.6px wide. Ranks with pieces are taller than empty ranks, so row heights change as pieces move. **This is the user's "board fluctuates" complaint.** It also breaks click mapping (tap e4 played e3; a click on f2 played f3). → sent to the board agent: equal `grid-rows-8`, `min-h-0` squares, pieces sized to the square.
- Board agent fix for 1.b: `components/board/layout.ts` (BOARD_GRID uses `grid-rows-8`; SQUARE uses `min-h-0 min-w-0`); piece SVGs are `h-full w-full`; layout.test.ts added. Gate: 120 pass / 1 skip; typecheck and lint clean. The bug dates to commit b97a17f.
- VERIFY: gridTemplateRows = 8 × 57.59px, with the same template at every one of 25 steps. Tapping e2 then e4 plays **e4** (correct). Evidence: `evidence/02-board-even-ranks-e4.jpg`. **ISSUE 1.a and 1.b closed. Criteria 4 and 5 PASS.**

### Spec + prototype agent result
- Written: `docs/superpowers/specs/2026-09-23-review-overhaul-design.md` (884 lines, §1–12; gitignored, local only per CLAUDE.md).
- Prototype: `#/review` has lines card v2, a 22px eval bar with the number and a flip rule, and a key moments card with 9 states; `#/review/report` is new. Checked in headless Chrome (no errors besides the favicon 404); `node --check` passes. design-guide.md updated.
- Decisions accepted by the orchestrator (logged):
  - (1) neutral perspective is stored as 'n'; '' means legacy rows;
  - (2) a `review_key` column on coach_texts, so notes follow re-reviews;
  - (3) the report is the default view, with `?view=moves` (as on chess.com). Browser checks for 4 and 10 will use `?view=moves` or the segmented control;
  - (4) ENGINE_BUILD is unchanged, and the nodes key moves the cache rows;
  - (5) the opening data is rebuilt with prefix positions (one network fetch from lichess chess-openings);
  - (6) the Great margin stays 0.15;
  - (7) the phase ply indexing is assumed. The UI agent's tests should pin it.

## Iteration 2

### Dispatch 2.1 (parallel) — all Opus
- **engine** (6–8): scoring/review/motifs/openings, lichess accuracy, determinism, 2M nodes, client ucinewgame/Clear Hash.
- **coach** (9 backend): perspective through facts→plan→frames, persona opponent variants, migration 0006 (generated, NOT applied), coach route and coach-card param.
- **review UI** (9 UI, 10–13): userSide + flip, lines card v2, live engine, key moments + retry, report.ts + game report, and the prototype home "N more"/skipped rows.
- Shared-file protocol: facts.ts and types.ts split by function (perspective → coach, lineMaterial/sacrificeFor → engine), re-read before every edit; index.ts report export → UI.

### Coach agent result (9 backend)
- The perspective is threaded through facts → plan (viewer, voice) → frames. The Referrer says "your opponent"/"they", or "White"/"Black" when neutral. New lesson concept `punish_it`, validator kind `wrong_perspective`. The coach route takes `?perspective=`, and CoachCard gets a `perspective` prop. `/u/[username]` headlines are written from that player's side.
- Gates: coach 312/312; web 173 pass / 1 skip; typecheck and lint pass. **Corpus: 19,404 notes, 0 violations, 0 errors, 0 unstable** (perspectives undefined/w/b/null).
- Migration `0006_coach_perspective.sql` adds `perspective` and `review_key` (text NOT NULL DEFAULT ''), then drops the old PK constraint and adds a wider one. No data is deleted. The deployed code upserts with a bare `onConflictDoNothing()`, so the widened PK doesn't break it.
- Pre-existing oddity (task): a fixture threat line reads "the knight on e5 taking the knight on e5". Engine facts, not coach.

### Engine agent result (6–8)
- 2M nodes (LIVE_NODES 1M); ucinewgame + Clear Hash + isready per search; waits for bestmove after an abort; `onInfo` streaming.
- `scripts/determinism.mjs`: A→B→A gives identical lines at 300k and at 2M (depth 18–19).
- Ladder 0.02/0.05/0.10/0.20; Best within EQUAL_EP; played score from evalBefore.lines; parity-matched Miss with the gift rule; missed-mate fix; `sacrificeFor` for Brilliant (deviation: the played line must actually take the moved piece); book prefix data (7,863 positions); `positionScore()` helper for the graph and bar; lichess gameAccuracy line for line.
- Gates: engine 364 pass (every lichess AccuracyPercentTest case); web 173/1 skip; typecheck and lint pass; coach and corpus still clean.

### PAUSE POINT (logged 2026-09-23): production migration blocked by the permission check
- `pnpm db:migrate` (against production Neon, pre-approved in spec.md's ledger) was **denied by the Claude Code auto-mode permission check**. I did not try to work around it.
- Effect: until 0006 is applied, the coach API and the `/u/[username]` headlines on :3000 query columns that don't exist yet and will error.
- Needs the user: run `! pnpm db:migrate` in the prompt, or allow the command.
- The loop continues with the UI work and its non-coach checks meanwhile.

### Review UI agent result (9 UI, 10–13)
- Built:
  - `sideOf`/`userSideFor`, `?from=`, flipped board and bar;
  - lines card v2 (33px fixed rows);
  - `positionScore` on the graph and bar;
  - live.ts (1M nodes, MultiPV 3, 256-entry FEN cache);
  - retry.ts + key-moments.tsx;
  - report.ts (scalachess Divider, lichess phaseAccuracies) + game-report.tsx;
  - the Report/Moves control.
- Gates: web 173 pass / 1 skip; engine 364 pass; typecheck and lint clean.

### VERIFY iteration 2 (browser, :3000, production DB)
- /g/173953106852 re-reviewed at 2M in about 50s (55 positions). **The copy still says "around 15 seconds" (ISSUE 2.a).**
- **Report (13) PASS:**
  - lichess accuracy: you (White) 89.0 / 79.7; chess.com has 87.66 / 77.81; before this loop we had 87.32 / 81.57.
  - phases: Opening 94.6/98.8, Middlegame 85.5/71.5, Endgame not reached.
  - 6 key moments with a you/your-opponent tag and win% swing; tally.
  - The key moments match chess.com's big calls (14.Qd3 miss, 15…f6 miss, 16.Nxc6 great, 21…f4 blunder).
- **ISSUE 2.b (engine, regression):** the book is now "through 1… e6 · 2 plies" (chess.com: 5…Nf6; before the loop: 3.Nf3). The game reaches named theory by transposition (1.d4 e6 2.Bf4 d5 3.Nf3 c5 4.c3 Nc6 5.e3 Nf6), and "stop at the first non-book position" cuts it off.
- **Lines card (10) PASS**, at 26.c4:
  - depth 19 · 2,000k nodes, readout +3.09 White's view;
  - The move: +3.15 26. c4, Good;
  - Best for White: +3.55 26. Qe2 b5 … (full line);
  - From here: 3 lines, ordered correctly for Black to move.
- **Board over the whole game (4) PASS:** 54 steps with the new UI: board top constant (102.0), page height constant (1374), a single row template.
  - Tooling note: the tab reports `document.hidden = true`, so Chrome throttles setTimeout. Measurements now wait on MessageChannel ticks. The earlier "freeze" was that throttling, not the app; one step renders in about 50ms.
- **Live engine (11) PASS:** leaving the game with 1.g4 g5 gives "depth 17 · 1,000k nodes", three live lines within 8s, and "Your line 1. g4 g5".
- **Key moments + retry (12) PASS:**
  - moment 1: 13…Nd7 "was your opponent's miss. It handed you a chance: your winning chances went from 46% to 53%", with arrows;
  - moment 2: 14.Qd3 "was a miss. Find a better move for White". I tried 14.Nxc6 → "14. Nxc6 is better than 14. Qd3: +0.22 instead of −1.97. The engine found better still" with Try again / Show the answer / Next moment;
  - moment 3: 15…f6, the opponent's miss.
  - Evidence: `evidence/03-key-moment-retry.jpg`.
- **Flip (9, UI) PASS:** /g/184263578210?from=kafka_f0 (you played Black) opens flipped (top-left square h1), the bar is flipped, and "you" is on kafka_f0. Evidence: `evidence/04-black-game-flipped.jpg`.
- **Coach (9, notes):** BLOCKED on migration 0006. The coach card reads "GothamChess could not be reached", as expected.
- Tooling note: the screenshot coordinate frame (1568×705) doesn't map 1:1 to CSS px (1440×647 at DPR 2), so clicks use screenshot coordinates or refs.

## Iteration 3
- 2.a → UI agent: time-estimate copy for 2M nodes.
- 2.b → engine agent: book depth with transpositions.
- 1.c (pre-existing) → engine agent: the fixture threat line "the knight on e5 taking the knight on e5".
- 2.a fixed by the UI agent: `lib/engine/estimate.ts` (+ test) derives the time from ANALYSIS_NODES (≈1s per position at 2M with 4 workers). Web 177 pass / 1 skip.
  - VERIFY: the text was missing a space ("22 positions,about"). The orchestrator added `{' '}` in analyse-panel.tsx, a one-character fix. It now reads "22 positions, about 20 seconds". **2.a closed.**
- 2.b engine agent: book rule allows gaps of ≤2 non-book positions up to ply 24; `BOOK_MAX_GAP`, `BOOK_GAP_MAX_PLY`; spec §4.9 updated.
  - 173953106852 now books to ply 5 (3.Nf3) in the unit test. Ply 10 can't be reached with lichess's data (no positions after 3…c5 in this line); a polyglot book is out of scope, so this is logged as remaining.
  - 1.c fixed: `detect/opponent-threat.ts` named the threatening piece on its destination square; tests corrected and a regression test added.
  - Gates: engine 367, coach 312, web 177/1 skip, typecheck and lint pass, corpus 19,404 / 0 violations.
- **ISSUE 3.a (general):** the stored review on :3000 still shows "book through 1… e6 · 2 plies". `reviews` is keyed by (game, nodes, engine_build) only, so scoring changes never invalidate stored reviews. → engine agent: SCORING_VERSION in the reviews key only (no migration; position_evals keep the plain build), plus an automatic rebuild from cached evals.
- 3.a engine agent: `SCORING_VERSION='s2'` + `reviewBuildKey()` (packages/engine/src/version.ts); `reviewCacheKey()` in settings.ts is the single key used by every reviews read and write; `getOrRebuildReview()` rebuilds from cached position evals on page load and on the review GET route. Tests: review-store.test.ts (5), version.test.ts.
  - VERIFY: /g/173953106852 reloads with **no "Run the review" prompt** (rebuilt from cache). It shows "book through 3. Nf3 · 5 plies", and the first key moment is "3… c5 Left the book". Accuracy is still 89.0 / 79.7. **3.a and 2.b closed.**

### GATE (orchestrator, full repo) — criterion 14
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0. `pnpm test`: exit 0 (engine 370, web 182 + 1 skip, coach 312, email 2).
- Corpus: 19,404 notes, 0 violations, 0 errors, 0 unstable.
- Logs: `evidence/final3-*.txt` (earlier gate logs superseded). **14 PASS.**

### Docs
- Research note: status block added (gaps closed and still open).
- CLAUDE.md: new ground rule for bumping SCORING_VERSION.
- design-guide.md and app.html were updated by the spec and UI agents.

### Remaining before the loop can close
- Criterion 9 (coach notes in the browser) is still BLOCKED on the user applying migration 0006.

### PAUSE resolved: the user applied migration 0006 (`pnpm db:migrate` → "migrations applied", neon)

### VERIFY criterion 9 (coach notes) — PASS on perspective
- White game 173953106852:
  - 13…Nd7 (opponent): "That opens a door for you, from about 46% to about 53%. Your opponent could have come out three pawns ahead… How do you make it cost them." / "Bb5 was their best move."
  - 14.Qd3 (member): "Qd3? It was RIGHT there… Empty squares next to your pieces are invitations."
- Black game 184263578210?from=kafka_f0:
  - 8.Nc3 (opponent): "Nothing changes for you: still about 51%… Their best was cxd5."
- No opponent-move note says "your winning chances fell".
- **ISSUE 3.b (coach prose):** a threat is rendered as a completed capture: "Nc3 just takes the pawn on d5" (it only attacks d5).
- **ISSUE 3.c (coach prose):** in the opponent voice, 13.e4 (Mistake) reads "Your opponent came out three pawns better in material", which contradicts "opens a door for you". The material-delta sign or meaning is wrong.
- Both sent to the coach agent, with a cache-key bump requested so cached production notes are replaced.
- Tooling: CDP evaluations over 45s time out, and the page script keeps running afterwards. Batches are kept short.

### Scope amendment (user, mid-loop, 2026-09-23): criteria 15 and 16 added to spec.md
- User: the coach talks as if the game is live. It must be retrospective (the past for events, the future for advice), and it must explain the line ("a blunder because they can play X, Y; you should have played Z because then…").
- User's example, verified on :3000 at /g/184263578210 ply 46, 23…Rxd5??:
  - engine after the move: 24.Qc4 Kh8 25.exd5 … (+3.44), i.e. Qc4 pins Rd5 to Kg8 on a2–g8;
  - best: 23…c6 (+0.68);
  - current note: "What are you doing? … The rook on d5 is just hanging. Nobody defends it." It's in the present tense, it's a false claim of a hanging piece, and it doesn't name Qc4.
- Dispatched to the coach agent (Opus), after 3.b/3.c: spec §13 first, then refutation/betterLine facts with pin detection, a hanging-detector fix, retrospective frames, a present-tense validator rule, a coach prose version in the cache key, and tests at this position.

### Coach agent result (3.b, 3.c, 15, 16)
- 3.b root cause: the planner gave the played move the best move's effect (8.cxd5); new validator rule `false_capture`. 3.c: no material sentence when the played line ends with more material than the best line.
- 16: `packages/engine/src/refutation.ts` computes the opponent's reply (1–4 plies, cut where the material settles), the tactic on its first move (mate/pin/skewer/fork/discovered/capture/check), material won and lost, and the better line. "Hanging" is claimed only if the reply takes the piece at once. Pins are line-checked. Fixture `184263578210-rxd5.json`.
- 15: `LIVE_NARRATION` in `coach/src/tense.ts`, validator kind `present_tense`; the neutral frames and all 7 persona voices are rewritten in the past tense; personas spec + personas.json regenerated; spec §13 written.
- Cache: COACH_VERSION=3 folded into review_key (`${nodes}:${engineBuild}:c3`), no migration.
- Gates: coach 323, engine 376, web 182/1 skip, typecheck and lint pass, corpus 19,404 / 0 violations.
- VERIFY (browser, /g/184263578210?from=kafka_f0 ply 46): "Rxd5. What were you doing? Okay so. 24.Qc4 pinned your rook on d5 to your king on g8. After 25.exd5 you were a rook for a pawn down. 44 to 22. That was the whole game, right there. Count the attackers… BETTER WAS Better was 23…c6; it would have kept the game level (+0.7)." **15 PASS, 16 PASS.**
- Polish round (→ coach agent, COACH_VERSION 4):
  - a lesson that follows the tactic;
  - % units on win-percent numbers;
  - the Gotham fragment;
  - the duplicated "Better was" label.

- Polish round (coach, COACH_VERSION 4): lessons follow the tactic (pin/fork/skewer/discovered/mate/capture); win-percent numbers carry units (new validator rule `bare_numbers`); fragment fixed (rule `fragment`); label repeat (rule `repeats_label`). Coach 328.

## FINAL VERIFICATION PASS (fresh, 2026-09-24)

| # | Result | Evidence |
|---|---|---|
| 1 | PASS | Live API: 26 games in the last 7 days, newest 184263578210. Home card: first row /g/184263578210, 10 rows + "16 more this week ›". |
| 2 | PASS | refresh-account.test.ts (Aug 20→Sep 10 gap, 1st of month, never-refreshed account). |
| 3 | PASS | "16 more this week ›" → /u/kafka_f0; skipped count unit-tested; a non-zero count only shows after a refresh in the current visit (logged limitation). |
| 4 | PASS | 54 steps at 1440: board top constant (322.0), page height constant (1374), a single row template. The earlier 606px run also passed. |
| 5 | PASS | Selection clears on step (browser); position-state.test.ts, layout.test.ts. |
| 6 | PASS | Every ply shows 2,000k nodes at depth 17–21; determinism script; ucinewgame/Clear Hash (client.test.ts). |
| 7 | PASS | Engine tests a–h; book "through 3. Nf3 · 5 plies" (limited by the lichess data); key moments match chess.com's big calls. |
| 8 | PASS | Every lichess AccuracyPercentTest case; 89.0 / 79.7 vs chess.com 87.66 / 77.81. |
| 9 | PASS | Black game opens flipped (top-left h1); opponent note: "That opened a door for you… Their best was 13.Bf4"; member note addressed to "you". |
| 10 | PASS | The move / Best for side / From here, with depth and nodes, readout, and a mate-at-end helper. |
| 11 | PASS | 1.e4 off-game: "depth 17 · 1,000k nodes", 3 live lines within 8s. |
| 12 | PASS | Key moments 2 of 6: 14.Qd3 retry with Nxc6 → "+0.22 instead of −1.97. The engine found better still." |
| 13 | PASS | Report: accuracy, opening + book, phases (94.6/98.8, 85.5/71.5, endgame not reached), 6 key moments, tally. |
| 14 | PASS | `evidence/final3-gate-summary.txt`: typecheck 0, lint 0, test 0 (engine 376, coach 328, web 182+1 skip, email 2), corpus 19,404 / 0 violations. |
| 15 | PASS | 13.e4: "That opened a door for you… Make their slip cost them."; 23…Rxd5 in the past tense; `present_tense` validator over the corpus. |
| 16 | PASS | 23…Rxd5: "24.Qc4 pinned your rook on d5 to your king on g8. After 25.exd5 you were a rook for a pawn down. Your winning chances went from 44% to 22%… Check the lines to your king before you move. 23…c6 was better; it would have kept the game level (+0.7)." |

## CLOSE
- Iterations: 3 (plus the mid-loop scope amendment for 15–16).
- Pause: 1 (production migration blocked by the permission check; the user ran it).
- Production writes made during the loop:
  - migration 0006 (additive);
  - kafka_f0 refresh imports (99 games);
  - re-reviews at 2M nodes of 173953106852 and 184263578210, plus any the WeekReader drained;
  - coach_texts rows under the new keys.
  Nothing was deleted.
- Remaining / known:
  - (a) The opening book is limited by lichess named-line data (3.Nf3 vs chess.com 5…Nf6). It needs a polyglot or explorer book (out of scope).
  - (b) The skipped-games count isn't persisted (no column).
  - (c) Accuracy is lichess's formula, so a few points of drift from chess.com's CAPS2 are expected.
  - (d) The WeekReader must re-review the week's games at 2M (about 1s per position) the first time.
  - (e) Deploy: the deployed site keeps working with 0006, but the new code isn't deployed; nothing was pushed.
  - (f) Chrome's minimum window width meant the 390px phone check ran at 606px.
- Commits: none. The commit plan is in the final report to the user.

## REOPENED — Iteration 4 (user, 2026-09-24): time awareness, criteria 17–20
- User: the analysis must know whether a game was lost on moves or on time, the time each move took and the thought process; reviews "just cut off" when a player lost on time.
- Findings:
  - `pgn.ts:80`: chess.js strips `[%clk]` and nothing parses clocks.
  - Termination is stored, but it's only used for the `/u` list label.
  - kafka_f0's September: 18 of 72 games ended on time (12 timeout losses by White, 6 by Black, across both colours).
  - New test game 184269442794 (600s, "jakeleupen won on time"; KAFKA_F0 was White with 48s at move 29).
- Plan: spec §14 + prototype (end card, clock graph, time insights, per-move time) → engine (clocks, termination, time report, SCORING_VERSION bump) ∥ UI → coach (time-aware notes, COACH_VERSION bump).
- Spec/prototype agent: §14 written.
  - Types: MoveAnalysis.clock, Review.timeControl, Review.ending with verdictAtEnd per colour.
  - Constants: trouble = min(30s, 10% of base) on the clock before the move; fast < 25% of median and < 5s; long > 3× median and ≥ 30s; 3 longest thinks.
  - Clocks are parsed with a tokenizer, all or nothing. Termination: chess.com result codes win over the header, and board mate/stalemate overrides both.
  - SCORING_VERSION 's3', COACH_VERSION 5; validator check `invented_time`.
  - Prototype: real clocks from 184269442794 (end card "You lost on time at move 30… equal +0.02, 30.Ng5 would have held"), a clock graph with a flag ✕, a Time card. Headless check: no errors.
- Dispatch 4.1 (parallel, Opus): engine (clocks, termination, time report, fixtures from real PGNs) ∥ UI (per-move time, end card, clock graph, Time card). The coach (criterion 20) follows the engine.
- UI agent: clock-format.ts, ending-copy.ts, game-over.tsx, ClockCard, TimeCard, notation times, "The move" clock row; hidden when a game has no clocks. Web 198 / engine 396 at hand-back.
- Engine agent:
  - clock.ts, ending.ts, report time section; SCORING_VERSION 's3'.
  - Daily games: %clk is time *taken* (checked on 29 real daily games), so there's no time report for daily. §14.2 updated.
  - 12 real-game fixtures covering every termination kind.
  - Gates: engine 473, coach 328, web 199/1, typecheck and lint pass, corpus 0 violations.
- VERIFY (browser, production :3000):
  - Refresh imported 184269442794 (stored 100). A first review at 2M ran in the browser.
  - Report:
    - headline "You lost on time at move 30 in an equal position.";
    - CLOCK graph with a trouble band;
    - TIME: "Your clock ran out on move 30 after 48 seconds of thought, with the position equal." / "1 of your 8 errors was played in under 5 seconds: 15.Bb2 (3.8s)." / "2 of your 8 errors came after long thinks: 21.Rf4 (58s), 22.Nxd4 (1:09)." / the opponent's fast error 15…Bc5 (2.4s);
    - time by phase: 7:33 vs 4:05 in the middlegame;
    - longest thinks for both sides.
  - Moves view:
    - notation shows per-move times (e4 3.4s …) and "0–1 · White lost on time";
    - "The move" row: "29… Ne5 Great · 3.0s · 3:34 left";
    - at the last ply the end card reads "GAME OVER · 0–1 You lost on time at move 30. The position was equal when your clock ran out (0.00). 30. Ng5 would have held it. kafka_f0 0:00 · jakeleupen 3:34 · last think 48s, unfinished".
  - Board top constant (322.0) across all 58 plies. The page grows at the last ply (the end card in the aside), but the board does not move.
  - **17, 18, 19 PASS.**
- Observation (not a criterion): this game lists 20 key moments, which is noisy next to chess.com. Noted as a suggestion, not changed.
- Coach agent (20): clock lines for fast / long-think / in-trouble moves, a `game_over` line on the last ply, validator `invented_time`, COACH_VERSION 5; corpus 24,276 notes / 0 violations (clocked fixture included); coach 341.
- VERIFY (Gotham, member White, /g/184269442794):
  - final ply PASS: "Your clock ran out on move 30 after 48 seconds of thought. The position was equal (0.0). 30.Ng5 would have held it."
  - **ISSUE 4.a:** the 15.Bb2 (3.8s fast error) and 22.Nxd4 (1:09 long think) notes have no clock mention; Gotham's word budget drops the clock line.
  - The 22…cxb3 refutation was checked against the stored 2M lines (top line −3.47): correct.
  - → coach agent: make the clock sentence mandatory when it's notable; COACH_VERSION 6.
- 4.a fix (coach, COACH_VERSION 6): the clock sentence is mandatory for notable clock facts and is merged into the refutation sentence. Coach 345.
- VERIFY (Gotham, /g/184269442794):
  - 15.Bb2: "You played 15.Bb2 in 3 seconds and missed 15…cxb3. That was with 7:50 on your clock. Your winning chances went from 43% to 24%…"
  - 22.Nxd4: "You spent 1:09 on 22.Nxd4 and still missed 22…cxb3…"
  - **20 PASS.**
- Orchestrator one-liner: "There was three pawns of material to be had" is ungrammatical. Two frames.ts variants now read "The better line was worth … of material"; COACH_VERSION 7. Coach 345 and corpus 24,276 / 0 violations after the change.

## FINAL GATE (iteration 4) — `evidence/final2-gate-summary.txt`
- typecheck 0 · lint 0 · test 0 (engine 473, coach 345, web 199 + 1 skip, email 2) · corpus 24,276 notes / 0 violations. (The coach suite and corpus were rerun after the COACH_VERSION 7 one-liner: pass.)

## CLOSE (iteration 4)
- Criteria 17–20 PASS in the browser on production :3000; criteria 1–16 unchanged, still passing.
- Additional production writes: import of 184269442794 and its 2M review; review rebuilds under SCORING_VERSION s3 (no deletes); coach_texts rows under c5–c7.
- Remaining / known (in addition to the earlier list):
  - (g) Daily games show no time report: chess.com's daily %clk is time taken, not time left.
  - (h) The 184269442794 report lists 20 key moments, which is noisy compared with chess.com. A cap is a suggestion only.
- Commits: none.

## Follow-up (user: "keep going, commit when everything passes", 2026-09-24)
- Key moments are capped at 8 (`KEY_MOMENTS_MAX`, `selectKeyMoments`): the book exit always, then the biggest swings. SCORING_VERSION 's4'; week.ts `gameMoment` now picks by severity.
- VERIFY: /g/184269442794 was rebuilt from cache with no run prompt. Key moments went from 20 to 8 rows (book exit + 7 blunders). The header count leaves out the book exit on purpose.
- FINAL GATE: `evidence/final3-gate-summary.txt`: typecheck 0, lint 0, test 0 (engine 481, coach 345, web 199 + 1 skip, email 2), corpus 24,276 / 0 violations.
- Commits: made per the user's instruction, with no Claude attribution (global CLAUDE.md). The evidence JPGs are not committed because they show the member's email in the header; they stay on disk.
