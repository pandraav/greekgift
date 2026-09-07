# Review fixtures

Four full `Review` objects (the frozen contract in `src/types.ts`), one per
game, committed as JSON so the test suite needs no chess engine at all.

## Games

- `review-json-game.json` — the game `docs/design/data/review.json` was
  rendered from, reconstructed from its `sans` array. Usernames `white` /
  `black`, both rated 1100. Unfinished (48 plies, no mate).
- `opera-game.json` — the Opera Game: Morphy vs the Duke of Brunswick and
  Count Isouard, Paris 1858. Ends in a queen-sacrifice, back-rank mate
  (`17. Rd8#`).
- `evergreen-game.json` — the Evergreen Game: Anderssen vs Dufresne, Berlin
  1852 (Evans Gambit Declined). Full of sacrifices, ends in mate
  (`24. Bxe7#`).
- `capablanca-tartakower.json` — Capablanca vs Tartakower, New York 1924. The
  textbook rook-and-pawn endgame: a queenside passed pawn, the king marching
  up the board to escort it, 103 plies, no mate (Black resigned). Verified
  move-for-move against two independent sources before being parsed.

Between them: a sacrifice, a fork, a long endgame with a passed pawn, and two
delivered mates (`evalAfter.lines === []`, the same way the browser client
reports a position with no legal moves).

## How they were built

`scripts/build-fixtures.mjs` drives the real `stockfish` npm package — the
same `stockfish-18-lite-single` build the browser loads in a Web Worker
(single-threaded, no SharedArrayBuffer, so it also runs under plain Node) —
in-process, sequentially, one position at a time. For every position in each
game (`ParsedGame.fens`) it runs `go nodes 20000` with `MultiPV 3`, parses the
engine's UCI `info` lines with the same regex
`apps/web/src/lib/engine/client.ts` uses, and normalises scores to White's
view with the package's own `toWhiteView`. The resulting `PositionEval[]` is
handed to `buildReview` to produce each `Review`.

Build parameters, baked into every fixture:

- `nodes: 20000`
- `engineBuild: "stockfish-18-lite-single"`

Rebuild after changing a fixture game or the `buildReview`/`Review` contract:

```sh
pnpm --filter @greekgift/engine exec tsx scripts/build-fixtures.mjs
```

The script resolves `stockfish` from `apps/web`'s `node_modules` (it's a
dependency of `apps/web`, not of `@greekgift/engine`) via
`createRequire(.../apps/web/package.json)`, and imports this package's own
`.ts` sources directly — `tsx` patches Node's loader for the whole process,
not just the entry file.

## Running the tests

```sh
pnpm --filter @greekgift/engine exec vitest run test/fixtures.test.ts
```

No engine, no network — `test/fixtures.test.ts` only reads the committed
JSON in `reviews/`.
