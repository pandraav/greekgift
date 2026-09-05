'use client';

import { PERSONAS, USE_CREATOR_LABELS, type Persona } from '@greekgift/coach';
import { useEffect } from 'react';

import { Button } from '@/components/ui';

/**
 * Choosing a voice.
 *
 * Every persona is selectable at every rating — no gating, no warnings, no
 * recommendations. How much gets explained follows the reader's own setting,
 * separately, so voice and difficulty never fight each other and the voice is
 * entirely the reader's to pick.
 */

export function PersonaPicker({
  open,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  current: Persona;
  onPick: (persona: Persona) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a coach"
      className="fixed inset-0 z-80 grid place-items-center bg-[rgba(12,8,4,.72)] p-4 sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-full w-[min(900px,100%)] overflow-auto rounded-[var(--r-lg)] border border-black/40 bg-paper text-ink shadow-[var(--shadow-lift)]">
        <div className="flex items-baseline gap-3 border-b border-rule px-5 py-4">
          <h2 className="m-0 font-display text-[20px] font-semibold">Who explains it</h2>
          <p className="m-0 text-[13px] text-ink-3">
            The voice changes. The chess does not.
          </p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid sm:grid-cols-2">
          {PERSONAS.map((persona) => {
            const chosen = persona.id === current.id;
            return (
              <button
                key={persona.id}
                type="button"
                aria-pressed={chosen}
                onClick={() => onPick(persona)}
                className={`flex gap-3.5 border-r border-b border-rule-2 border-l-[3px] px-5 py-4 text-left last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 ${
                  chosen ? 'border-l-lacquer bg-paper-2' : 'border-l-transparent hover:bg-paper-2'
                }`}
              >
                <span className="min-w-0">
                  <span className="mb-px flex flex-wrap items-baseline gap-2 text-[16px] font-semibold">
                    {USE_CREATOR_LABELS ? persona.label : persona.style}
                    <span className="font-mono text-[11.5px] font-normal text-ink-3">
                      {persona.rating}
                    </span>
                  </span>
                  <span className="mb-1.5 block text-[12.5px] text-ink-3 italic">
                    {persona.style}
                  </span>
                  <span className="mb-2 block text-[13.5px] leading-normal text-ink-2">
                    {persona.description}
                  </span>
                  <span className="block border-l-2 border-rule pl-2.5 text-[13px] leading-snug italic">
                    {persona.lines.blunder ?? persona.lines.reviewStart}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
