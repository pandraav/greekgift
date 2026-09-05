'use client';

import { PERSONAS, USE_CREATOR_LABELS, type Persona } from '@greekgift/coach';
import type { Audience } from '@greekgift/db';
import { useState } from 'react';

import { Notice } from '@/components/ui';

/**
 * Picking a coach, and how much it explains.
 *
 * The two are deliberately independent. Every voice is available at every
 * level — nobody is told they are not ready for a persona — and the depth is
 * the reader's own call rather than something inferred from their rating.
 */

const LEVELS: { id: Audience; label: string; blurb: string }[] = [
  {
    id: 'beginner',
    label: 'Explain everything',
    blurb: 'Names the pattern and says what to look for next time.',
  },
  {
    id: 'intermediate',
    label: 'Assume I know the terms',
    blurb: 'No definitions. What was missed, and why it mattered.',
  },
  {
    id: 'advanced',
    label: 'Keep it short',
    blurb: 'The line, the point, nothing you would find obvious.',
  },
];

export function CoachForm({
  personaId,
  audience,
}: {
  personaId: string;
  audience: Audience;
}) {
  const [chosen, setChosen] = useState(personaId);
  const [level, setLevel] = useState<Audience>(audience);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async (next: { personaId?: string; audience?: Audience }) => {
    setState('saving');
    try {
      const response = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      setState(response.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  };

  const pick = (persona: Persona) => {
    setChosen(persona.id);
    void save({ personaId: persona.id });
  };

  const setDepth = (next: Audience) => {
    setLevel(next);
    void save({ audience: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mt-0 mb-3 text-[13.5px] text-ink-2">
          Every voice is available whatever you are rated. The chess underneath is
          identical — only the telling changes.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {PERSONAS.map((persona) => {
            const active = persona.id === chosen;
            return (
              <button
                key={persona.id}
                type="button"
                aria-pressed={active}
                onClick={() => pick(persona)}
                className={`rounded-[var(--r)] border px-3.5 py-3 text-left ${
                  active
                    ? 'border-lacquer bg-lacquer/8'
                    : 'border-rule bg-paper-2 hover:border-ink'
                }`}
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[14.5px] font-semibold">
                    {USE_CREATOR_LABELS ? persona.label : persona.style}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3">{persona.rating}</span>
                </span>
                <span className="mt-0.5 block text-[12.5px] text-ink-3 italic">
                  {persona.style}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mt-0 mb-1 text-[14.5px] font-semibold">How much to explain</h3>
        <p className="mt-0 mb-3 text-[13px] text-ink-3">
          Separate from the voice, on purpose.
        </p>
        <div className="flex flex-col gap-2">
          {LEVELS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={level === option.id}
              onClick={() => setDepth(option.id)}
              className={`rounded-[var(--r)] border px-3.5 py-2.5 text-left ${
                level === option.id
                  ? 'border-brass bg-brass/10'
                  : 'border-rule bg-paper-2 hover:border-ink'
              }`}
            >
              <span className="block text-[14px] font-semibold">{option.label}</span>
              <span className="block text-[12.5px] text-ink-3">{option.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      {state === 'error' ? (
        <Notice tone="lacquer" icon="!">
          That did not save. Try again in a moment.
        </Notice>
      ) : state === 'saved' ? (
        <p className="m-0 text-[13px] text-felt">Saved.</p>
      ) : state === 'saving' ? (
        <p className="m-0 text-[13px] text-ink-3">Saving…</p>
      ) : null}

      <p className="m-0 text-[12.5px] text-ink-3">
        Each coach is written in a creator’s style. None of them is that person, and
        none of them speaks for them.
      </p>
    </div>
  );
}
