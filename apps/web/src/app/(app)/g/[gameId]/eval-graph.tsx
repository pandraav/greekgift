'use client';

/**
 * The shape of the game.
 *
 * One line: cream below is White's share of the win, dark above is Black's,
 * the eval bar beside the board laid on its side. A collapse is a cliff you
 * can see before reading a single move, and clicking anywhere jumps to that
 * position — which makes this the fastest way to find the moment the game
 * turned, usually the only moment anyone came for.
 */

const WIDTH = 600;
const HEIGHT = 104;

export interface EvalGraphProps {
  /** White's win percentage at every position, from the start. */
  winPercents: number[];
  ply: number;
  onSeek: (ply: number) => void;
  /** Dimmed while the reader is off in a line of their own. */
  idle?: boolean;
}

export function EvalGraph({ winPercents, ply, onSeek, idle = false }: EvalGraphProps) {
  const n = winPercents.length;
  if (n < 2) return null;

  const x = (i: number) => (i * WIDTH) / (n - 1);
  const y = (v: number) => HEIGHT - (v / 100) * HEIGHT;

  const line = winPercents.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const mark = x(ply);
  const moves = Math.ceil((n - 1) / 2);

  // A tick every ten moves, so the eye can place a swing without counting.
  const ticks: number[] = [];
  for (let move = 10; move <= moves; move += 10) ticks.push(move * 2);

  return (
    <div
      className={`mt-4 w-full border-t border-rule pt-3.5 transition-opacity ${idle ? 'opacity-30' : ''}`}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation over the course of the game"
        className="block h-[104px] w-full cursor-crosshair rounded-[2px] border border-rule"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = ((event.clientX - box.left) / box.width) * (n - 1);
          onSeek(Math.max(0, Math.min(n - 1, Math.round(at))));
        }}
      >
        <rect width={WIDTH} height={HEIGHT} fill="#FBF7EC" />
        {ticks.map((t) => (
          <line key={t} x1={x(t)} y1={0} x2={x(t)} y2={HEIGHT} stroke="#E0D7C0" strokeWidth={1} />
        ))}
        {/* Filled from the top down to the line, so the dark mass is Black's
            share — the same reading as the bar beside the board, laid flat. */}
        <polygon points={`0,0 ${line} ${WIDTH},0`} fill="#241B12" opacity="0.92" />
        <line
          x1={0}
          y1={HEIGHT / 2}
          x2={WIDTH}
          y2={HEIGHT / 2}
          stroke="#9E2B20"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity="0.5"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#241B12"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <line x1={mark} y1={0} x2={mark} y2={HEIGHT} stroke="#9E2B20" strokeWidth={1.5} opacity="0.9" />
        <circle
          cx={mark}
          cy={y(winPercents[ply] ?? 50)}
          r={4.5}
          fill="#9E2B20"
          stroke="#FBF7EC"
          strokeWidth={2}
        />
      </svg>

      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-3">
        {[1, ...ticks.map((t) => t / 2), moves]
          .filter((v, i, all) => all.indexOf(v) === i)
          .map((move) => (
            <span key={move}>{move}</span>
          ))}
      </div>
    </div>
  );
}
