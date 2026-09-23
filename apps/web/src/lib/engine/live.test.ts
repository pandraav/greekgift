import type { EngineLine, PositionEval } from '@greekgift/engine';
import { describe, expect, it } from 'vitest';

import { EngineBusyError } from './client';
import { createLiveAnalyser, LIVE_NODES, type LiveEngine } from './live';

const line = (cp: number, depth: number): EngineLine => ({
  multipv: 1,
  score: { cp },
  pv: ['e2e4'],
  depth,
  nodes: LIVE_NODES,
});

/** A scripted engine: every call is recorded and waits until the test resolves it or its signal aborts. */
function fakeEngine() {
  const calls: {
    fen: string;
    nodes: number;
    multipv?: number;
    resolve: (e: PositionEval) => void;
    info?: (lines: EngineLine[], depth: number) => void;
  }[] = [];
  const engine: LiveEngine = {
    analyse(fen, options) {
      return new Promise<PositionEval>((resolve, reject) => {
        options.signal?.addEventListener('abort', () =>
          reject(new DOMException('Analysis cancelled', 'AbortError')),
        );
        calls.push({ fen, nodes: options.nodes, multipv: options.multipv, resolve, info: options.onInfo });
      });
    },
  };
  return { engine, calls };
}

const result = (fen: string, cp: number): PositionEval => ({
  fen,
  nodes: LIVE_NODES,
  engineBuild: 'stockfish-18-lite-single',
  lines: [line(cp, 18)],
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLiveAnalyser', () => {
  it('searches three lines at the live budget and caches per FEN', async () => {
    const { engine, calls } = fakeEngine();
    const live = createLiveAnalyser(() => engine);

    const first = live.analyse('A', { signal: new AbortController().signal });
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ fen: 'A', nodes: 1_000_000, multipv: 3 });
    calls[0]!.resolve(result('A', 40));
    expect((await first).lines[0]!.score).toEqual({ cp: 40 });

    // Same FEN again: from memory, no second search.
    expect((await live.analyse('A', { signal: new AbortController().signal })).lines[0]!.score).toEqual({ cp: 40 });
    expect(calls).toHaveLength(1);
    expect(live.cached('A')).toBeDefined();
  });

  it('streams info to the caller', async () => {
    const { engine, calls } = fakeEngine();
    const live = createLiveAnalyser(() => engine);
    const seen: number[] = [];
    const run = live.analyse('A', { signal: new AbortController().signal, onInfo: (_l, depth) => seen.push(depth) });
    await tick();
    calls[0]!.info?.([line(10, 8)], 8);
    calls[0]!.info?.([line(12, 12)], 12);
    calls[0]!.resolve(result('A', 12));
    await run;
    expect(seen).toEqual([8, 12]);
  });

  it('a cancelled search rejects and caches nothing', async () => {
    const { engine, calls } = fakeEngine();
    const live = createLiveAnalyser(() => engine);
    const controller = new AbortController();
    const run = live.analyse('A', { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(live.cached('A')).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('never starts a search on an already-aborted signal', async () => {
    const { engine, calls } = fakeEngine();
    const live = createLiveAnalyser(() => engine);
    const controller = new AbortController();
    controller.abort();
    await expect(live.analyse('A', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });

  it('keeps at most `capacity` positions, dropping the oldest', async () => {
    const engine: LiveEngine = { analyse: async (fen) => result(fen, 0) };
    const live = createLiveAnalyser(() => engine, { capacity: 2 });
    const signal = new AbortController().signal;
    await live.analyse('A', { signal });
    await live.analyse('B', { signal });
    await live.analyse('C', { signal });
    expect(live.size()).toBe(2);
    expect(live.cached('A')).toBeUndefined();
    expect(live.cached('C')).toBeDefined();
  });

  it('asks again while the engine is still draining a cancelled search', async () => {
    let busy = 2;
    let searches = 0;
    const engine: LiveEngine = {
      analyse: async (fen) => {
        if (busy-- > 0) throw new EngineBusyError();
        searches += 1;
        return result(fen, 5);
      },
    };
    const live = createLiveAnalyser(() => engine);
    const out = await live.analyse('A', { signal: new AbortController().signal });
    expect(out.lines[0]!.score).toEqual({ cp: 5 });
    expect(searches).toBe(1);
  });
});
