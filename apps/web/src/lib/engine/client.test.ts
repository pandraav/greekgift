import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Engine, EngineBusyError } from './client';

/**
 * A scripted stand-in for the Stockfish worker. It answers `uci`/`isready`
 * and, on `go`, reports lines that depend only on the position — which is
 * what a cleared hash buys the real engine. `hold` keeps a search's
 * `bestmove` back until the test releases it.
 */
class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  sent: string[] = [];
  hold = false;
  private fen = '';
  private held: string[] = [];

  constructor() {
    FakeWorker.last = this;
  }

  private emit(line: string) {
    queueMicrotask(() => this.onmessage?.({ data: line }));
  }

  postMessage(command: string) {
    this.sent.push(command);
    if (command === 'isready') this.emit('readyok');
    else if (command === 'uci') this.emit('uciok');
    else if (command.startsWith('position fen ')) this.fen = command.slice('position fen '.length);
    else if (command.startsWith('go ')) {
      // A score that depends only on the position.
      const cp = [...this.fen].reduce((a, c) => a + c.charCodeAt(0), 0) % 200;
      const lines = [
        `info depth 12 seldepth 14 multipv 1 score cp ${cp} nodes 1000 nps 1 pv e2e4 e7e5`,
        `info depth 12 seldepth 14 multipv 2 score cp ${cp - 20} nodes 1000 nps 1 pv d2d4 d7d5`,
        `info depth 18 seldepth 20 multipv 1 score cp ${cp + 1} nodes 2000 nps 1 pv e2e4 c7c5`,
        `info depth 18 seldepth 20 multipv 2 score cp ${cp - 19} nodes 2000 nps 1 pv d2d4 g8f6`,
        'bestmove e2e4 ponder c7c5',
      ];
      if (this.hold) {
        this.held = lines;
        // The info lines of the held search still arrive; only bestmove waits.
        for (const l of lines.slice(0, -1)) this.emit(l);
      } else {
        for (const l of lines) this.emit(l);
      }
    }
  }

  /** Sends the held search's bestmove. */
  release() {
    const last = this.held.at(-1);
    this.held = [];
    if (last) this.emit(last);
  }

  terminate() {}
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const OTHER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.last = null;
});

describe('Engine.analyse', () => {
  it('resets the engine before every search, in order', async () => {
    const engine = new Engine();
    await engine.start();
    const worker = FakeWorker.last!;
    worker.sent = [];

    await engine.analyse(START, { nodes: 2_000_000, multipv: 3 });

    expect(worker.sent).toEqual([
      'ucinewgame',
      'setoption name Clear Hash',
      'isready',
      'setoption name MultiPV value 3',
      `position fen ${START}`,
      'go nodes 2000000',
    ]);
  });

  it('keeps the deepest line per multipv, White-relative', async () => {
    const engine = new Engine();
    const result = await engine.analyse(OTHER, { nodes: 1000, multipv: 2 });
    expect(result.lines.map((l) => l.depth)).toEqual([18, 18]);
    // Black to move: the engine's score is negated into White's view.
    const cp = [...OTHER].reduce((a, c) => a + c.charCodeAt(0), 0) % 200;
    expect(result.lines[0]!.score).toEqual({ cp: -(cp + 1) });
  });

  it('gives an identical result for the same position twice', async () => {
    const engine = new Engine();
    const a = await engine.analyse(START, { nodes: 1000, multipv: 3 });
    await engine.analyse(OTHER, { nodes: 1000, multipv: 3 });
    const b = await engine.analyse(START, { nodes: 1000, multipv: 3 });
    expect(b).toEqual(a);
  });

  it('after an abort, waits for the stale bestmove before the next search', async () => {
    const engine = new Engine();
    await engine.start();
    const worker = FakeWorker.last!;
    worker.hold = true;

    const controller = new AbortController();
    const first = engine.analyse(OTHER, { nodes: 1000, signal: controller.signal });
    await flush();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.sent).toContain('stop');

    // The next search is queued behind the stopped one's bestmove.
    worker.hold = false;
    const sentBefore = worker.sent.length;
    const second = engine.analyse(START, { nodes: 1000, multipv: 2 });
    await flush();
    expect(worker.sent.length).toBe(sentBefore);

    worker.release();
    const result = await second;
    expect(result.fen).toBe(START);
    const cp = [...START].reduce((a, c) => a + c.charCodeAt(0), 0) % 200;
    expect(result.lines[0]!.score).toEqual({ cp: cp + 1 });
    expect(worker.sent.slice(sentBefore)[0]).toBe('ucinewgame');
  });

  it('refuses a second search while one is running', async () => {
    const engine = new Engine();
    await engine.start();
    FakeWorker.last!.hold = true;
    const first = engine.analyse(START, { nodes: 1000 });
    await flush();
    await expect(engine.analyse(OTHER, { nodes: 1000 })).rejects.toBeInstanceOf(EngineBusyError);
    FakeWorker.last!.release();
    await first;
  });

  it('streams lines through onInfo and once more at the end', async () => {
    const engine = new Engine();
    const seen: number[] = [];
    await engine.analyse(START, {
      nodes: 1000,
      multipv: 2,
      onInfo: (lines, depth) => {
        expect(lines.length).toBeGreaterThan(0);
        seen.push(depth);
      },
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toBe(18);
  });
});
