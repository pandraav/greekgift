'use client';

import type { Persona } from '@greekgift/coach';
import type { Audience } from '@greekgift/db';
import type { CoachText, MoveAnalysis } from '@greekgift/engine';
import { useEffect, useState } from 'react';

import { Avatar, Button } from '@/components/ui';

/**
 * What the coach says about the move you are looking at.
 *
 * The whole game is written in one request the first time a voice is opened,
 * so stepping through the moves never waits and switching voice re-reads the
 * game rather than one move. There is nothing to ask for: the note is simply
 * there.
 */

const SLOT_ORDER = ['whatHappened', 'whyItMatters', 'lesson'] as const;

type Status = 'loading' | 'ready' | 'unreviewed' | 'error';

export function CoachCard({
  gameId,
  move,
  persona,
  audience,
  onChangePersona,
}: {
  gameId: string;
  move: MoveAnalysis;
  persona: Persona;
  /** The reader's saved depth, from their profile. */
  audience: Audience;
  onChangePersona: () => void;
}) {
  const [texts, setTexts] = useState<Record<string, CoachText>>({});
  /** Per voice and depth; absent means the read is still in flight. */
  const [loads, setLoads] = useState<Record<string, Status>>({});
  const [attempt, setAttempt] = useState(0);

  const prefix = `${persona.id}:${audience}:`;
  const text = texts[`${prefix}${move.ply}`];
  const status: Status = loads[prefix] ?? 'loading';

  // One read per game, voice and depth. Notes are keyed by all three, so
  // switching voice and switching back costs nothing the second time.
  useEffect(() => {
    if (loads[prefix] === 'ready') return;
    const controller = new AbortController();

    fetch(`/api/games/${gameId}/coach?persona=${persona.id}&audience=${audience}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          setLoads((current) => ({ ...current, [prefix]: 'unreviewed' }));
          return;
        }
        if (!response.ok) throw new Error(`coach ${response.status}`);
        const body = (await response.json()) as { texts: Record<string, CoachText> };
        setTexts((current) => {
          const next = { ...current };
          for (const [ply, value] of Object.entries(body.texts)) next[`${prefix}${ply}`] = value;
          return next;
        });
        setLoads((current) => ({ ...current, [prefix]: 'ready' }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoads((current) => ({ ...current, [prefix]: 'error' }));
      });

    return () => controller.abort();
    // `loads` is read, not depended on: a completed read must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, persona.id, audience, prefix, attempt]);

  return (
    <div className="border-l-[3px] border-lacquer pl-4">
      <div className="mb-3.5 flex items-center gap-3">
        <Avatar size="md">{initials(persona)}</Avatar>
        <span>
          <span className="block text-[15px] leading-tight font-semibold">
            {persona.label}
          </span>
          <span className="text-[12.5px] text-ink-3 italic">{persona.style}</span>
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onChangePersona}>
          Change
        </Button>
      </div>

      {text ? (
        <>
          <h3 className="m-0 mb-2.5 font-display text-[20px] leading-tight font-semibold">
            {text.headline}
          </h3>
          {SLOT_ORDER.map((slot) => (
            <p key={slot} className="m-0 mb-2.5 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">
              {text[slot]}
            </p>
          ))}
          <div className="mt-3 max-w-[44ch] rounded-[var(--r)] border border-felt/50 bg-felt/9 px-3.5 py-2.5">
            <span className="block font-mono text-[10.5px] tracking-[0.13em] text-felt uppercase">
              Better was
            </span>
            <span className="mt-1 block text-[14.5px] leading-relaxed text-felt">
              {text.betterWas}
            </span>
          </div>
        </>
      ) : status === 'error' ? (
        <>
          <p className="mt-0 mb-3 max-w-[42ch] text-[14.5px] text-ink-2">
            {persona.label} could not be reached.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoads((current) => {
                const next = { ...current };
                delete next[prefix];
                return next;
              });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </>
      ) : status === 'unreviewed' ? (
        <p className="mt-0 max-w-[42ch] text-[14.5px] text-ink-2">
          Run the analysis and {persona.label} will read the whole game.
        </p>
      ) : (
        <p className="mt-0 max-w-[42ch] text-[14.5px] text-ink-3">
          {persona.label} is reading the game…
        </p>
      )}
    </div>
  );
}

const initials = (persona: Persona): string =>
  persona.label
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
