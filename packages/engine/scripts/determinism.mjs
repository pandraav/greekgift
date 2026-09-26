/**
 * Determinism check for the per-search reset (review-overhaul design §4.1).
 *
 * Runs the real `stockfish-18-lite-single` build under Node — the one the
 * browser loads — with the same command sequence as
 * apps/web/src/lib/engine/client.ts: `ucinewgame`, `Clear Hash`, `isready`,
 * then MultiPV, position and a fixed node budget. It analyses position A,
 * then B, then A again, and fails unless A's lines are identical both times.
 * With a cleared hash the result depends only on (fen, nodes, multipv,
 * build), never on what the worker searched before.
 *
 *   node packages/engine/scripts/determinism.mjs [nodes]
 *
 * No database, no network. Default 300,000 nodes.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const NODES = Number(process.argv[2] ?? 300_000);
const MULTIPV = 3;

const INFO =
  /^info .*?\bdepth (\d+)\b.*?\bmultipv (\d+)\b.*?\bscore (cp|mate) (-?\d+)\b(?:.*?\bnodes (\d+)\b)?.*?\bpv (.+)$/;

// A: the Opera Game after 12...Rd8 (sharp); B: an unrelated quiet position.
const A = '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13';
const B = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 1 8';

function loadStockfish() {
  const requireFromWeb = createRequire(path.join(repoRoot, 'apps/web/package.json'));
  const dir = path.dirname(requireFromWeb.resolve('stockfish/package.json'));
  return requireFromWeb('stockfish')(path.join(dir, 'bin/stockfish-18-lite-single.js'));
}

function waitFor(engine, token, onLine = () => {}) {
  return new Promise((resolve) => {
    engine.listener = (line) => {
      onLine(line);
      if (line.startsWith(token)) resolve(line);
    };
  });
}

async function analyse(engine, fen) {
  const best = new Map();
  engine.sendCommand('ucinewgame');
  engine.sendCommand('setoption name Clear Hash');
  const ready = waitFor(engine, 'readyok');
  engine.sendCommand('isready');
  await ready;

  const done = waitFor(engine, 'bestmove', (line) => {
    const m = INFO.exec(line);
    if (m) {
      best.set(Number(m[2]), {
        multipv: Number(m[2]),
        score: m[3] === 'mate' ? { mate: Number(m[4]) } : { cp: Number(m[4]) },
        pv: m[6].trim().split(/\s+/),
        depth: Number(m[1]),
      });
    }
  });
  engine.sendCommand(`setoption name MultiPV value ${MULTIPV}`);
  engine.sendCommand(`position fen ${fen}`);
  engine.sendCommand(`go nodes ${NODES}`);
  await done;
  return [...best.values()].sort((a, b) => a.multipv - b.multipv);
}

async function main() {
  const engine = await loadStockfish();
  const booted = waitFor(engine, 'readyok');
  engine.sendCommand('uci');
  engine.sendCommand('setoption name Threads value 1');
  engine.sendCommand('setoption name Hash value 16');
  engine.sendCommand('isready');
  await booted;

  const started = Date.now();
  const a1 = await analyse(engine, A);
  const b = await analyse(engine, B);
  const a2 = await analyse(engine, A);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const show = (lines) =>
    lines.map((l) => `    #${l.multipv} d${l.depth} ${JSON.stringify(l.score)} ${l.pv.slice(0, 4).join(' ')}`).join('\n');
  console.log(`nodes ${NODES}, multipv ${MULTIPV}, 3 searches in ${seconds}s`);
  console.log(`  A (first):\n${show(a1)}`);
  console.log(`  B:\n${show(b)}`);
  console.log(`  A (again):\n${show(a2)}`);

  const same = JSON.stringify(a1) === JSON.stringify(a2);
  console.log(same ? 'IDENTICAL: A → B → A gives the same lines.' : 'DIFFERENT: A changed after B.');
  process.exit(same ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
