/**
 * Builds the committed review fixtures used by `test/fixtures.test.ts`.
 *
 * Runs the real `stockfish` npm package (the browser's own lite,
 * single-threaded build — no SharedArrayBuffer, so it also runs under plain
 * Node) over four PGNs, analysing every position at a fixed 20,000-node
 * budget with MultiPV 3, then feeds each game through `buildReview`. The
 * output is a full `Review` object per game, written to
 * `test/fixtures/reviews/<name>.json`.
 *
 * The fixtures are committed so the test suite needs no engine at all — this
 * script only has to be re-run if a fixture game changes or the frozen
 * `Review`/`buildReview` contract does.
 *
 * Usage (from the repo root):
 *
 *   pnpm --filter @greekgift/engine exec tsx scripts/build-fixtures.mjs
 *
 * `tsx` is what lets this plain `.mjs` entry point import the package's
 * `.ts` sources directly (`parsePgn`, `buildReview`, `toWhiteView`) without a
 * build step — it patches Node's loader for every subsequent import in the
 * process, not just files with a `.ts` extension.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parsePgn } from '../src/pgn.ts';
import { buildReview, toWhiteView } from '../src/review.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outDir = path.join(__dirname, '../test/fixtures/reviews');

const NODES = 20_000;
const MULTIPV = 3;
const ENGINE_BUILD = 'stockfish-18-lite-single';

/* ── the four fixture games ───────────────────────────────────────────── */

// (a) The game docs/design/data/review.json was rendered from, reconstructed
// from its `sans` array. Unfinished (no mate) — the other three fixtures
// cover mate.
const REVIEW_JSON_SANS = [
  'd4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'Be7', 'Bd3', 'O-O', 'Nbd2',
  'c5', 'c3', 'Nc6', 'O-O', 'b6', 'Qe2', 'Bb7', 'Rae1', 'Ne5', 'Bxh7+',
  'Kxh7', 'Ra1', 'Nxf3+', 'gxf3', 'Kh8', 'Rfc1', 'Kh7', 'Nf1', 'Rg8', 'a3',
  'a6', 'Qc2+', 'Ne4', 'dxc5', 'g5', 'Nd2', 'Ra7', 'Bc7', 'Kg7', 'cxb6',
  'Bf6', 'b4', 'Qd7', 'Nb3', 'Nxf2', 'Nc5', 'Qe7',
];

const REVIEW_JSON_PGN = `[Event "docs/design/data/review.json"]
[Site "?"]
[Date "????.??.??"]
[White "white"]
[Black "black"]
[Result "*"]
[WhiteElo "1100"]
[BlackElo "1100"]
[ECO "D02"]

${numberSans(REVIEW_JSON_SANS)} *`;

// (b) The Opera Game: Morphy vs the Duke of Brunswick and Count Isouard,
// Paris 1858 — a queen sacrifice ending in smothered-style back-rank mate.
const OPERA_PGN = `[Event "Paris"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

// (c) The Evergreen Game: Anderssen vs Dufresne, Berlin 1852 — the Evans
// Gambit Declined, full of sacrifices, ending in mate.
const EVERGREEN_PGN = `[Event "Berlin"]
[Site "Berlin"]
[Date "1852.??.??"]
[White "Adolf Anderssen"]
[Black "Jean Dufresne"]
[Result "1-0"]
[ECO "C52"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3
8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6
14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8
19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0`;

// (d) Capablanca vs Tartakower, New York 1924 — the textbook rook-and-pawn
// endgame with a queenside passed pawn and a long king march, 103 plies,
// no mate (Black resigned). Verified move-for-move against two independent
// sources (chesstrapguide.com's PGN and a chessgames.com/365chess search
// snippet agreeing through move 30) before being parsed here.
const ENDGAME_PGN = `[Event "New York"]
[Site "New York"]
[Date "1924.03.23"]
[White "Jose Raul Capablanca"]
[Black "Savielly Tartakower"]
[Result "1-0"]
[ECO "A90"]

1. d4 f5 2. Nf3 e6 3. c4 Nf6 4. Bg5 Be7 5. Nc3 O-O 6. e3 b6 7. Bd3 Bb7
8. O-O Qe8 9. Qe2 Ne4 10. Bxe7 Nxc3 11. bxc3 Qxe7 12. a4 Bxf3 13. Qxf3 Nc6
14. Rfb1 Rae8 15. Qh3 Rf6 16. f4 Na5 17. Qf3 d6 18. Re1 Qd7 19. e4 fxe4
20. Qxe4 g6 21. g3 Kf8 22. Kg2 Rf7 23. h4 d5 24. cxd5 exd5 25. Qxe8+ Qxe8
26. Rxe8+ Kxe8 27. h5 Rf6 28. hxg6 hxg6 29. Rh1 Kf8 30. Rh7 Rc6 31. g4 Nc4
32. g5 Ne3+ 33. Kf3 Nf5 34. Bxf5 gxf5 35. Kg3 Rxc3+ 36. Kh4 Rf3 37. g6 Rxf4+
38. Kg5 Re4 39. Kf6 Kg8 40. Rg7+ Kh8 41. Rxc7 Re8 42. Kxf5 Re4 43. Kf6 Rf4+
44. Ke5 Rg4 45. g7+ Kg8 46. Rxa7 Rg1 47. Kxd5 Rc1 48. Kd6 Rc2 49. d5 Rc1
50. Rc7 Ra1 51. Kc6 Rxa4 52. d6 1-0`;

/** SAN moves in `1. e4 e5 2. Nf3 …` form — chess.js expects move numbers. */
function numberSans(sans) {
  let out = '';
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) out += `${i / 2 + 1}. `;
    out += `${sans[i]} `;
  }
  return out.trim();
}

const GAMES = [
  {
    id: 'review-json-game',
    pgn: REVIEW_JSON_PGN,
    whiteUsername: 'white',
    blackUsername: 'black',
    whiteRating: 1100,
    blackRating: 1100,
  },
  {
    id: 'opera-game',
    pgn: OPERA_PGN,
    whiteUsername: 'Paul Morphy',
    blackUsername: 'Duke Karl / Count Isouard',
  },
  {
    id: 'evergreen-game',
    pgn: EVERGREEN_PGN,
    whiteUsername: 'Adolf Anderssen',
    blackUsername: 'Jean Dufresne',
  },
  {
    id: 'capablanca-tartakower',
    pgn: ENDGAME_PGN,
    whiteUsername: 'Jose Raul Capablanca',
    blackUsername: 'Savielly Tartakower',
  },
];

/* ── driving Stockfish over UCI, in-process, under Node ─────────────────── */

// Same INFO line shape apps/web/src/lib/engine/client.ts parses out of the
// worker's `onmessage` stream — reproduced here so a fixture's numbers come
// from exactly the same normalisation the browser applies.
const INFO =
  /^info .*?\bdepth (\d+)\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b(?:.*?\bnodes (\d+)\b)?.*?\bpv (.+)$/;

/** Resolves the `stockfish` package the way apps/web depends on it. */
function loadStockfish() {
  const requireFromWeb = createRequire(path.join(repoRoot, 'apps/web/package.json'));
  const stockfishPkgJson = requireFromWeb.resolve('stockfish/package.json');
  const stockfishDir = path.dirname(stockfishPkgJson);
  const enginePath = path.join(stockfishDir, 'bin/stockfish-18-lite-single.js');
  // `stockfish`'s own `main` (index.js) exports this Node helper directly:
  // it loads the engine's .js/.wasm pair and resolves an `engine` object with
  // `sendCommand(cmd)` / a settable `.listener(line)` for UCI I/O — the
  // in-process equivalent of the browser's Worker.postMessage/onmessage.
  const initEngine = requireFromWeb('stockfish');
  return initEngine(enginePath);
}

/** Boots the engine and waits for `readyok`, mirroring `Engine.start()`. */
function startEngine(engine) {
  return new Promise((resolve) => {
    engine.listener = (line) => {
      if (line === 'readyok') resolve();
    };
    engine.sendCommand('uci');
    // Determinism: one thread, a fixed small hash — same as the client.
    engine.sendCommand('setoption name Threads value 1');
    engine.sendCommand('setoption name Hash value 16');
    engine.sendCommand('isready');
  });
}

/** Evaluates one position at a fixed node budget. Serial — one at a time. */
function analyse(engine, fen, nodes, multipv) {
  return new Promise((resolve) => {
    const whiteToMove = fen.split(' ')[1] === 'w';
    const best = new Map();

    engine.listener = (line) => {
      const m = INFO.exec(line);
      if (m) {
        const index = Number(m[2]);
        const raw = m[3] === 'mate' ? { mate: Number(m[4]) } : { cp: Number(m[4]) };
        const score = toWhiteView(raw, whiteToMove);
        best.set(index, {
          multipv: index,
          score,
          pv: m[6].trim().split(/\s+/),
          depth: Number(m[1]),
          nodes: m[5] ? Number(m[5]) : nodes,
        });
        return;
      }

      if (line.startsWith('bestmove')) {
        const lines = [...best.values()].sort((a, b) => a.multipv - b.multipv);
        resolve({ fen, nodes, engineBuild: ENGINE_BUILD, lines });
      }
    };

    engine.sendCommand(`setoption name MultiPV value ${multipv}`);
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(`go nodes ${nodes}`);
  });
}

/* ── build ────────────────────────────────────────────────────────────── */

async function main() {
  await mkdir(outDir, { recursive: true });

  const engine = await loadStockfish();
  await startEngine(engine);

  const started = Date.now();

  for (const { id, pgn, whiteUsername, blackUsername, whiteRating, blackRating } of GAMES) {
    const gameStarted = Date.now();
    const game = parsePgn(pgn);

    engine.sendCommand('ucinewgame');

    const evals = [];
    for (const fen of game.fens) {
      evals.push(await analyse(engine, fen, NODES, MULTIPV));
    }

    const review = buildReview({
      gameId: id,
      game,
      evals,
      whiteUsername,
      blackUsername,
      ...(whiteRating !== undefined ? { whiteRating } : {}),
      ...(blackRating !== undefined ? { blackRating } : {}),
      nodes: NODES,
      engineBuild: ENGINE_BUILD,
    });

    const outPath = path.join(outDir, `${id}.json`);
    await writeFile(outPath, JSON.stringify(review, null, 1));

    const seconds = ((Date.now() - gameStarted) / 1000).toFixed(1);
    console.log(
      `  ${id}: ${game.fens.length} positions (${game.moves.length} plies) in ${seconds}s -> ${path.relative(repoRoot, outPath)}`,
    );
  }

  const totalSeconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Done in ${totalSeconds}s.`);

  // The wasm engine keeps the process alive (its own internal timers/workqueue).
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
