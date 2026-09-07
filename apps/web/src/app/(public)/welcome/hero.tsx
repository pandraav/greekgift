import Link from 'next/link';

import { DEFAULT_PERSONA_ID, findPersona, personaInitials, personaName } from '@greekgift/coach';

import { Board } from '@/components/board/board';
import { Avatar, Eyebrow, buttonClass } from '@/components/ui';
import { cn } from '@/lib/utils';

import { copy } from './copy';

const c = copy.hero;

/**
 * The position after Black's tenth move in the game the comparison section
 * dissects. The knight on e5 forks nothing: White simply takes it. The red
 * arrow is what happened, the green one is the move that was there instead.
 */
const HERO_FEN = 'r2q1rk1/pb2bppp/1p2pn2/2ppn3/3P1B2/2PBPN2/PP1NQPPP/4RRK1 w - - 4 11';

export function Hero() {
  const coach = findPersona(DEFAULT_PERSONA_ID);

  return (
    <section className="grid items-center gap-[70px] py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14 lg:py-12 lg:pb-[60px]">
      <div>
        <Eyebrow onWood className="mb-3.5 tracking-[.18em]">
          {c.kicker}
        </Eyebrow>
        <h1 className="type-hero mb-5 font-display text-[clamp(40px,5.4vw,66px)] leading-none font-semibold tracking-[-.035em]">
          {c.title[0]}
          <br />
          {c.title[1]}
        </h1>
        <p className="mb-7 max-w-[50ch] text-lg leading-relaxed text-paper/74">{c.sub}</p>

        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href="/signup"
            className={cn(buttonClass({ variant: 'brass', size: 'lg' }), 'no-underline')}
          >
            {c.primary}
          </Link>
          <a
            href="#why"
            className={cn(buttonClass({ variant: 'onwood', size: 'lg' }), 'no-underline')}
          >
            {c.secondary}
          </a>
        </div>

        <ol className="mt-[26px] flex list-none flex-wrap items-center gap-[7px] p-0" aria-label="How it works">
          {c.pipe.map((step, i) => (
            <li key={step} className="flex items-center gap-[7px]">
              <span
                className={cn(
                  'rounded-full border px-[9px] py-1 font-mono text-[11px] whitespace-nowrap',
                  i === 0
                    ? 'border-brass bg-brass/20 font-semibold text-brass-hi'
                    : 'border-brass-hi/35 bg-brass-hi/8 text-paper/80',
                )}
              >
                {step}
              </span>
              {i < c.pipe.length - 1 ? (
                <span aria-hidden className="text-[13px] text-brass">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-[18px] text-[13.5px] text-paper/45">{c.fine}</p>
      </div>

      <div className="relative mx-auto w-full max-w-[420px] pb-14 lg:pb-0">
        <div className="[&_[data-square]]:cursor-default">
          <Board
            fen={HERO_FEN}
            coordinates={false}
            lastMoveTo="e5"
            badge={{ square: 'e5', glyph: '??', color: 'var(--c-blunder)' }}
            arrows={[
              { from: 'f6', to: 'h5', color: '#2E5C43', width: 34 },
              { from: 'f3', to: 'e5', color: '#9E2B20', width: 34 },
            ]}
          />
        </div>

        <aside className="absolute right-0 -bottom-10 z-10 w-[280px] -rotate-[1.6deg] rounded-[5px] border border-black/35 bg-paper px-[18px] py-4 text-ink shadow-lift sm:-right-10 sm:-bottom-[58px] sm:w-[306px]">
          <div className="mb-[9px] flex items-center gap-[9px]">
            <Avatar size="sm">{personaInitials(coach)}</Avatar>
            <span>
              <b className="text-[13.5px] font-semibold">{personaName(coach)}</b>{' '}
              <i className="text-xs text-ink-3">{coach.style}</i>
            </span>
          </div>
          <p className="text-sm leading-[1.55] text-ink-2">{c.slip}</p>
        </aside>
      </div>
    </section>
  );
}
