'use client';

import { useRef, useState } from 'react';

import { Button, Card, CardBody, Chip, Notice } from '@/components/ui';
import { Engine, ENGINE_BUILD } from '@/lib/engine/client';
import { EnginePool, workerCount } from '@/lib/engine/pool';

/** A quiet middlegame — representative of what a review actually searches. */
const FEN = 'r2q1rk1/pb2bppp/1p2pn2/2ppn3/3P1B2/2PBPN2/PP1NQPPP/4RRK1 w - - 4 11';

interface Row {
  nodes: number;
  ms: number;
  depth: number;
  score: string;
  best: string;
  nps: number;
}

export function Bench() {
  const engine = useRef<Engine | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState<{ workers: number; ms: number } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setRows([]);
    try {
      engine.current ??= new Engine();

      const t0 = performance.now();
      setStatus('Downloading and starting the engine…');
      await engine.current.start();
      setStatus(`Engine ready in ${Math.round(performance.now() - t0)} ms`);

      const out: Row[] = [];
      for (const nodes of [100_000, 500_000, 1_000_000]) {
        setStatus(`Searching ${nodes.toLocaleString()} nodes…`);
        const started = performance.now();
        const result = await engine.current.analyse(FEN, { nodes, multipv: 3 });
        const ms = Math.round(performance.now() - started);
        const top = result.lines[0];
        out.push({
          nodes,
          ms,
          depth: top?.depth ?? 0,
          score:
            top?.score.mate !== undefined
              ? `mate ${top.score.mate}`
              : `${((top?.score.cp ?? 0) / 100).toFixed(2)}`,
          best: top?.pv[0] ?? '—',
          nps: Math.round(nodes / (ms / 1000)),
        });
        setRows([...out]);
      }
      // The real question is not one position but a whole game, and whether
      // spreading it across workers actually pays.
      const workers = workerCount();
      setStatus(`Analysing 80 positions across ${workers} workers…`);
      const pool = new EnginePool();
      const fens = Array.from({ length: 80 }, () => FEN);
      const poolStart = performance.now();
      await pool.analyseAll(fens, {
        nodes: 300_000,
        multipv: 1,
        onProgress: (p) =>
          setStatus(
            `Analysing ${p.done}/${p.total}${p.etaSeconds ? ` · ~${Math.round(p.etaSeconds)}s left` : ''}`,
          ),
      });
      const poolMs = Math.round(performance.now() - poolStart);
      pool.terminate();
      setGame({ workers, ms: poolMs });
      setStatus('Done.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const nps = rows.at(-1)?.nps ?? 0;

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button variant="brass" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run the engine'}
          </Button>
          <Chip tone="quiet">{ENGINE_BUILD}</Chip>
          {status ? (
            <span className="text-[13.5px] text-ink-3">{status}</span>
          ) : null}
        </div>

        {error ? (
          <Notice tone="lacquer" icon="✕">
            {error}
          </Notice>
        ) : null}

        {rows.length > 0 ? (
          <>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10px] tracking-[.13em] text-ink-3 uppercase">
                  <th className="pb-2">Nodes</th>
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Depth</th>
                  <th className="pb-2">Eval</th>
                  <th className="pb-2">Best</th>
                  <th className="pb-2 text-right">Speed</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.nodes} className="border-b border-rule-2 last:border-0">
                    <td className="py-2">{r.nodes.toLocaleString()}</td>
                    <td className="py-2">{r.ms} ms</td>
                    <td className="py-2">{r.depth}</td>
                    <td className="py-2">{r.score}</td>
                    <td className="py-2">{r.best}</td>
                    <td className="py-2 text-right">
                      {Math.round(r.nps / 1000).toLocaleString()}k/s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {nps > 0 ? (
              <p className="mt-4 mb-1 text-[13.5px] text-ink-2">
                One worker at 1M nodes a position would need{' '}
                <b>{Math.round((80 * 1_000_000) / nps)} seconds</b> for an
                80-position game. That is the number that decides the budget.
              </p>
            ) : null}

            {game ? (
              <p className="mt-1 mb-0 text-[13.5px] text-ink-2">
                Actually measured: 80 positions at 300k nodes across{' '}
                <b>{game.workers} workers</b> in{' '}
                <b>{(game.ms / 1000).toFixed(1)} seconds</b> — and the result is
                cached, so a game is paid for once, ever.
              </p>
            ) : null}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
