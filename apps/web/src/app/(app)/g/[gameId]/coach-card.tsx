'use client';

import type { Persona } from '@greekgift/coach';
import type { CoachText, MoveAnalysis } from '@greekgift/engine';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, Button } from '@/components/ui';

/**
 * What the coach says about the move you are looking at.
 *
 * Written on demand, one move at a time — most moves in a game are never
 * opened, and paying for sixty notes to have five read is paying for
 * fifty-five nobody wanted. Cached server-side afterwards, so stepping back to
 * a move is instant and a friend opening the same game reads the same words.
 */

const SLOT_ORDER = ['whatHappened', 'whyItMatters', 'lesson'] as const;

export function CoachCard({
  gameId,
  move,
  persona,
  onChangePersona,
}: {
  gameId: string;
  move: MoveAnalysis;
  persona: Persona;
  onChangePersona: () => void;
}) {
  const [texts, setTexts] = useState<Record<string, CoachText>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const key = `${persona.id}:${move.ply}`;
  const text = texts[key];

  // Changing the voice invalidates nothing we hold — the notes are keyed by
  // persona too, so both stay cached and switching back is free.
  const write = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/games/${gameId}/coach`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ply: move.ply, personaId: persona.id }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('The coach could not be reached');
      const { text: written } = (await response.json()) as { text: CoachText };
      setTexts((current) => ({ ...current, [`${persona.id}:${move.ply}`]: written }));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Something went wrong');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }, [gameId, move.ply, persona.id]);

  // Load whatever is already written for this game and voice, so stepping
  // through a game someone has already read costs nothing.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/games/${gameId}/coach?persona=${persona.id}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { texts?: Record<string, CoachText> } | null) => {
        if (!body?.texts) return;
        setTexts((current) => {
          const next = { ...current };
          for (const [ply, value] of Object.entries(body.texts!)) {
            next[`${persona.id}:${ply}`] = value;
          }
          return next;
        });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [gameId, persona.id]);

  useEffect(() => () => inFlight.current?.abort(), []);

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
          {text.source === 'template' ? (
            <p className="mt-3 mb-0 text-[12px] text-ink-3">
              Written from the engine’s own findings — the coach was unavailable, so
              this one is in greekgift’s plain voice.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-0 mb-3 max-w-[42ch] text-[14.5px] text-ink-2">
            {pending
              ? `${persona.label} is looking at ${move.san}…`
              : `Ask ${persona.label} what happened on ${move.san}.`}
          </p>
          {error ? (
            <p className="mt-0 mb-3 text-[13px] text-lacquer">{error}</p>
          ) : null}
          <Button variant="primary" onClick={write} disabled={pending}>
            {pending ? 'Writing…' : error ? 'Try again' : 'Explain this move'}
          </Button>
        </>
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
