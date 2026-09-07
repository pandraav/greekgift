import { PERSONAS, personaInitials, personaName } from '@greekgift/coach';

import { Avatar } from '@/components/ui';

import { copy } from './copy';
import { Section } from './section';

const c = copy.voices;

/**
 * The seven coaches, default first. Each card quotes the coach's real blunder
 * line from the persona data, so the landing page shows exactly the voice a
 * member gets.
 */
export function Voices() {
  const personas = [...PERSONAS].sort((a, b) => Number(b.isDefault ?? false) - Number(a.isDefault ?? false));

  return (
    <Section kicker={c.kicker} title={c.title} lede={c.lede}>
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(146px,1fr))] gap-[11px] p-0">
        {personas.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-2.5 rounded-[5px] border border-black/30 bg-paper px-[13px] py-[15px] text-ink shadow-paper motion-safe:transition-transform motion-safe:hover:-translate-y-1"
          >
            <Avatar size="md">{personaInitials(p)}</Avatar>
            <span>
              <span className="block text-[14.5px] leading-tight font-semibold">
                {personaName(p)}
              </span>
              <span className="text-[11.5px] text-ink-3 italic">{p.style}</span>
            </span>
            <q className="mt-auto border-t border-rule-2 pt-2.5 text-[13px] leading-[1.45] text-ink-2 italic [quotes:none]">
              {p.lines.blunder}
            </q>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] text-paper/40">{c.fine}</p>
    </Section>
  );
}
