'use client';

import type { Color, GameEnding, MoveAnalysis, TimeFinding, TimeReport } from '@greekgift/engine';
import { thinkLabel } from '@greekgift/engine';

import { CLASS_STYLE } from '@/components/classification';
import { Card, CardBody, Eyebrow } from '@/components/ui';
import { clockFace, durationWords, spentShort } from '@/lib/clock-format';

import { verdictWords } from './ending-copy';

/**
 * Time management in the report (design §14.6): both clocks over the game,
 * and a Time card that says where the clock and the errors met. Every number
 * comes from the clocks and the classes; nothing is estimated.
 */

const NAME: Record<Color, string> = { w: 'White', b: 'Black' };

/* ── clock graph ─────────────────────────────────────────────────────── */

const W = 600;
const H = 120;

/** The side whose flag fell, for a timeout: the one whose clock reads 0 at the end, else the loser. */
function flaggedSide(ending: GameEnding | undefined): Color | null {
  if (!ending || (ending.kind !== 'timeout' && ending.kind !== 'timeout_vs_insufficient')) return null;
  if (ending.clocks) {
    if (ending.clocks.w === 0) return 'w';
    if (ending.clocks.b === 0) return 'b';
  }
  return ending.winner ? (ending.winner === 'w' ? 'b' : 'w') : null;
}

export function ClockCard({
  time,
  plies,
  ending,
  names,
}: {
  time: TimeReport;
  plies: number;
  ending: GameEnding | undefined;
  names: Record<Color, string>;
}) {
  const base = time.control.base;
  const flag = flaggedSide(ending);
  const span = flag ? plies + 1 : Math.max(1, plies);
  const x = (ply: number) => (ply / span) * W;
  // A clock can climb past the base with an increment; it stays on the card.
  const y = (ms: number) => Math.max(2, H - (ms / base) * (H - 6));

  const points = (c: Color): [number, number][] => {
    const out = time.series[c].map((p) => [x(p.ply), y(p.left)] as [number, number]);
    if (flag === c) out.push([x(plies + 1), y(0)]);
    return out;
  };
  const path = (c: Color) => points(c).map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const lastW = points('w').at(-1)!;
  const lastB = points('b').at(-1)!;
  const flagAt = flag === 'w' ? lastW : flag === 'b' ? lastB : null;

  const lastMove = Math.floor(plies / 2) + 1;
  const ticks = [1, ...[5, 10, 15, 20, 25, 30, 35, 40].filter((t) => t < lastMove), lastMove];

  return (
    <Card>
      <CardBody className="px-5 py-[18px]">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <Eyebrow>Clock</Eyebrow>
          <span className="flex gap-3 font-mono text-[11px] text-ink-3">
            <span>
              <i className="mr-[5px] inline-block h-0 w-4 border-t-2 border-ink align-middle" />
              {names.w}
            </span>
            <span>
              <i className="mr-[5px] inline-block h-0 w-4 border-t-2 border-dashed border-ink-3 align-middle" />
              {names.b}
            </span>
            {time.threshold !== null ? (
              <span>
                <i className="mr-[5px] inline-block h-2 w-4 bg-[rgba(158,43,32,.14)] align-middle" />
                time trouble
              </span>
            ) : null}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Both clocks over the game"
          className="block h-[120px] w-full rounded-[2px] border border-rule bg-[#FBF7EC]"
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={y(f * base)} y2={y(f * base)} stroke="#E0D7C0" strokeWidth={1} />
          ))}
          {time.threshold !== null ? (
            <>
              <rect x={0} y={y(time.threshold)} width={W} height={H - y(time.threshold)} fill="#9E2B20" opacity={0.1} />
              <text x={6} y={y(time.threshold) - 4} fontFamily="IBM Plex Mono,monospace" fontSize={9.5} fill="#9E2B20">
                under {spentShort(time.threshold)}
              </text>
            </>
          ) : null}
          <polyline
            points={path('b')}
            fill="none"
            stroke="#8B8068"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
          <polyline
            points={path('w')}
            fill="none"
            stroke="#1A150F"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {flag === 'b' ? null : <circle cx={lastB[0]} cy={lastB[1]} r={3.5} fill="#1A150F" />}
          {flag === 'w' ? null : (
            <circle cx={lastW[0]} cy={lastW[1]} r={3.5} fill="#fff" stroke="#1A150F" strokeWidth={1.5} />
          )}
          {flagAt ? (
            <g stroke="#9E2B20" strokeWidth={2.4} strokeLinecap="round">
              <line x1={flagAt[0] - 5} y1={flagAt[1] - 8} x2={flagAt[0] + 5} y2={flagAt[1] + 2} />
              <line x1={flagAt[0] - 5} y1={flagAt[1] + 2} x2={flagAt[0] + 5} y2={flagAt[1] - 8} />
            </g>
          ) : null}
        </svg>
        <div className="mt-[5px] flex justify-between font-mono text-[10px] text-ink-3">
          {ticks.map((t, i) => (
            <span key={`${t}-${i}`}>{t}</span>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/* ── time card ───────────────────────────────────────────────────────── */

function owner(c: Color, userSide: Color | null): { possessive: string; subject: string } {
  if (userSide === null) return { possessive: `${NAME[c]}'s`, subject: NAME[c] };
  return c === userSide
    ? { possessive: 'your', subject: 'You' }
    : { possessive: "your opponent's", subject: 'Your opponent' };
}

const errorsWord = (n: number) => `${n} error${n === 1 ? '' : 's'}`;

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** One finding as a sentence; move labels are returned for bolding. */
function sentence(
  f: TimeFinding,
  userSide: Color | null,
  moves: MoveAnalysis[],
  ending: GameEnding | undefined,
): React.ReactNode {
  const { possessive } = owner(f.side, userSide);
  const label = (ply: number) => thinkLabel(moves[ply - 1]!);
  const spent = (ply: number) => spentShort(moves[ply - 1]?.clock?.spent ?? 0);
  const list = (plies: number[], withTime: boolean) =>
    plies.map((p, i) => (
      <span key={p}>
        {i > 0 ? ', ' : ''}
        <b className="font-mono text-[13.5px] font-semibold text-ink">{label(p)}</b>
        {withTime ? ` (${spent(p)})` : ''}
      </span>
    ));

  switch (f.kind) {
    case 'trouble_errors':
      return (
        <>
          {f.plies.length} of {possessive} {errorsWord(f.errors)} came with under {durationWords(f.threshold)} on the
          clock: {list(f.plies, false)}.
        </>
      );
    case 'fast_errors':
      return (
        <>
          {f.plies.length} of {possessive} {errorsWord(f.errors)} {f.plies.length === 1 ? 'was' : 'were'} played in under 5
          seconds: {list(f.plies, true)}.
        </>
      );
    case 'long_think_errors':
      return (
        <>
          {f.plies.length} of {possessive} {errorsWord(f.errors)} came after long thinks: {list(f.plies, true)}.
        </>
      );
    case 'flagged':
      return (
        <>
          {capital(possessive)} clock ran out on move {f.atMove} after{' '}
          <b className="font-mono text-[13.5px] font-semibold text-ink">{durationWords(f.finalThink)}</b> of thought,
          with the position {ending ? verdictWords(ending, userSide) : f.verdict}.
        </>
      );
  }
}

export function TimeCard({
  time,
  moves,
  userSide,
  ending,
  names,
}: {
  time: TimeReport;
  moves: MoveAnalysis[];
  userSide: Color | null;
  ending: GameEnding | undefined;
  names: Record<Color, string>;
}) {
  const order: Color[] = userSide === 'b' ? ['b', 'w'] : ['w', 'b'];
  // The flag first, as the prototype reads: it is the one fact about time
  // that decided the game.
  const findings = [...time.findings].sort((a, b) => Number(b.kind === 'flagged') - Number(a.kind === 'flagged'));
  const items: { side: Color; text: React.ReactNode; key: string }[] = findings.map((f, i) => ({
    side: f.side,
    text: sentence(f, userSide, moves, ending),
    key: `${f.kind}-${f.side}-${i}`,
  }));
  if (time.threshold !== null) {
    for (const c of order) {
      if (time.trouble[c].length === 0) {
        items.push({
          side: c,
          text: `${owner(c, userSide).subject} never dropped under ${durationWords(time.threshold)} before moving.`,
          key: `calm-${c}`,
        });
      }
    }
  }

  const control = `${clockFace(time.control.base)}${time.control.increment ? ` + ${time.control.increment / 1000}s` : ''} each`;

  return (
    <Card>
      <CardBody className="px-5 py-[18px]">
        <section>
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
            <Eyebrow>Time</Eyebrow>
            <span className="font-mono text-[12px] text-ink-3">
              {control}
              {time.threshold !== null ? ` · trouble under ${spentShort(time.threshold)}` : ''}
            </span>
          </div>
          {items.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-[9px] p-0">
              {items.map((item) => (
                <li key={item.key} className="relative pl-3.5 text-[14.5px] leading-normal text-ink-2">
                  <span
                    aria-hidden
                    className="absolute top-[.62em] left-0 h-1.5 w-1.5 rounded-full"
                    style={{ background: item.side === userSide ? 'var(--brass)' : 'var(--ink-3)' }}
                  />
                  {item.text}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-[18px] border-t border-rule-2 pt-4">
          <Eyebrow className="mb-2.5">Time used by phase</Eyebrow>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                {['Phase', names.w, names.b].map((h, i) => (
                  <th
                    key={i}
                    className={`border-b border-rule pb-1.5 font-mono text-[9.5px] font-normal tracking-[.13em] text-ink-3 uppercase ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {time.phases.map((p) => (
                <tr key={p.phase} className="border-b border-rule-2">
                  <td className="py-2 text-left text-[14px]">{capital(p.phase)}</td>
                  <td className="py-2 text-right font-mono text-[13.5px] tabular-nums">{clockFace(p.spent.w)}</td>
                  <td className="py-2 text-right font-mono text-[13.5px] tabular-nums">{clockFace(p.spent.b)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 text-left text-[14px]">Median think</td>
                <td className="py-2 text-right font-mono text-[13.5px] tabular-nums">{spentShort(time.median.w)}</td>
                <td className="py-2 text-right font-mono text-[13.5px] tabular-nums">{spentShort(time.median.b)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-[18px] border-t border-rule-2 pt-4">
          <Eyebrow className="mb-2.5">Longest thinks</Eyebrow>
          <div className="grid grid-cols-2 gap-x-[18px] gap-y-1">
            {(['w', 'b'] as const).map((c) => (
              <div key={c} className="min-w-0">
                <h4 className="m-0 mb-1 truncate text-[12.5px] font-semibold text-ink-2">{names[c]}</h4>
                {time.longest[c].map((t) => {
                  const style = CLASS_STYLE[t.classification];
                  return (
                    <div key={t.ply} className="flex items-center gap-2 py-[3px] font-mono text-[13px]">
                      <i
                        aria-hidden
                        className="inline-grid h-[17px] w-[17px] flex-none place-items-center rounded-[3px] text-[9px] leading-none font-bold text-white not-italic"
                        style={{ background: style.color }}
                        dangerouslySetInnerHTML={{ __html: style.glyph }}
                      />
                      <span className="truncate">{t.label}</span>
                      <span className="ml-auto text-ink-3 tabular-nums">{spentShort(t.spent)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </CardBody>
    </Card>
  );
}
