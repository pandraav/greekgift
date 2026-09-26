'use client';

import type { Color, GameEnding, MoveAnalysis } from '@greekgift/engine';
import { useMemo } from 'react';

import { Button, Card, CardBody, Eyebrow } from '@/components/ui';
import { clockFace, spentShort } from '@/lib/clock-format';
import { formatScore, numberedLine, pvToSan } from '@/lib/lines';

import {
  endingSay,
  endingTitle,
  endingTone,
  holdSentence,
  loserOf,
  resultText,
} from './ending-copy';

/**
 * The card after the last ply (design §14.6): how the game ended, what the
 * position was worth at that moment, and both clocks. It sits at the top of
 * the aside, so the board above it never moves.
 */

const ACCENT = { loss: 'var(--lacquer)', win: 'var(--felt)', neutral: 'var(--ink-3)' } as const;

export function GameOverCard({
  ending,
  moves,
  userSide,
  names,
  momentCount,
  onReport,
  onWalk,
}: {
  ending: GameEnding;
  moves: MoveAnalysis[];
  userSide: Color | null;
  names: Record<Color, string>;
  momentCount: number;
  onReport: () => void;
  onWalk: () => void;
}) {
  // The loser's better move, when it was their turn in the final position and
  // the engine had a line there: "30. Ng5 would have held it."
  const hold = useMemo(() => {
    const last = moves.at(-1);
    const loser = loserOf(ending);
    const top = last?.evalAfter.lines[0];
    if (!last || !loser || !top) return null;
    const toMove = last.fenAfter.split(' ')[1] === 'w' ? 'w' : 'b';
    if (toMove !== loser) return null;
    const sans = pvToSan(last.fenAfter, top.pv, 1);
    return sans.length ? numberedLine(last.fenAfter, sans) : null;
  }, [ending, moves]);

  const evalText = formatScore(ending.evalAtEnd);
  const say = [endingSay(ending, userSide, evalText), holdSentence(ending, userSide, hold)]
    .filter(Boolean)
    .join(' ');
  const flagged =
    ending.kind === 'timeout' || ending.kind === 'timeout_vs_insufficient' ? loserOf(ending) ?? null : null;

  return (
    <Card className="border-t-[3px]" style={{ borderTopColor: ACCENT[endingTone(ending, userSide)] }}>
      <CardBody className="px-5 py-[18px]">
        <Eyebrow>Game over · {resultText(ending)}</Eyebrow>
        <h3 className="mt-1.5 mb-2 font-display text-[22px] leading-[1.2] font-semibold tracking-[-.01em]">
          {endingTitle(ending, userSide)}
        </h3>
        {say ? <p className="m-0 max-w-[40ch] text-[15px] leading-[1.55] text-ink-2">{say}</p> : null}

        {ending.clocks ? (
          <div className="mt-3.5 grid grid-cols-2 overflow-hidden rounded-[var(--r)] border border-rule">
            {(['w', 'b'] as const).map((c) => (
              <div
                key={c}
                className={`flex min-w-0 items-center gap-2 px-3 py-[9px] text-[13.5px] ${c === 'b' ? 'border-l border-rule' : ''}`}
              >
                <i
                  aria-hidden
                  className={`h-2.5 w-2.5 flex-none rounded-full border-[1.5px] border-ink ${c === 'w' ? 'bg-white' : 'bg-ink'}`}
                />
                <span className="min-w-0 truncate">{names[c]}</span>
                <span
                  className={`ml-auto font-mono text-[15px] font-semibold tabular-nums ${
                    flagged === c ? 'text-lacquer' : ''
                  }`}
                >
                  {clockFace(ending.clocks![c])}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-2.5 mb-0 font-mono text-[12px] text-ink-3">
          Eval at the end {evalText}
          {ending.finalThink !== undefined ? ` · last think ${spentShort(ending.finalThink)}, unfinished` : ''}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="brass" onClick={onReport}>
            See the report
          </Button>
          <Button variant="ghost" onClick={onWalk} disabled={momentCount === 0}>
            Walk the key moments
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
