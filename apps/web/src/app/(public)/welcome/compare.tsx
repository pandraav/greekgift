import { DEFAULT_PERSONA_ID, findPersona, personaInitials, personaName } from '@greekgift/coach';

import { Avatar, Card, CardBody } from '@/components/ui';

import { copy } from './copy';
import { Section } from './section';

const c = copy.compare;

/**
 * The same blunder twice: the verdict every tool gives, then the sentence
 * the player actually wanted. The right-hand card is the product.
 */
export function Compare() {
  const coach = findPersona(DEFAULT_PERSONA_ID);

  return (
    <Section id="why" kicker={c.kicker} title={c.title} lede={c.lede}>
      <div className="grid gap-[22px] lg:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col">
          <p className="mb-[11px] font-mono text-[10.5px] tracking-[.16em] text-paper/45 uppercase">
            {c.leftTag}
          </p>
          <div className="flex flex-1 flex-col justify-center gap-3.5 rounded-[5px] border border-brass-hi/22 bg-black/26 px-[26px] py-6">
            <p className="flex items-center gap-[11px] font-mono text-[26px] font-semibold">
              {c.move}
              <span
                aria-label="blunder"
                className="grid size-[22px] place-items-center rounded-[4px] bg-cls-blunder text-[11px] font-bold text-white"
              >
                ??
              </span>
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-[7px] text-sm">
              {c.facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="self-center font-mono text-[10.5px] tracking-[.13em] text-paper/45 uppercase">
                    {k}
                  </dt>
                  <dd className="font-mono text-[15px] text-paper">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-brass-hi/16 pt-[13px] text-[13.5px] text-paper/50 italic">
              {c.after}
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <p className="mb-[11px] font-mono text-[10.5px] tracking-[.16em] text-brass uppercase">
            {c.rightTag}
          </p>
          <Card className="flex-1">
            <CardBody>
              <div className="mb-[13px] flex items-center gap-[11px]">
                <Avatar size="md">{personaInitials(coach)}</Avatar>
                <span>
                  <span className="block text-[15px] leading-tight font-semibold">
                    {personaName(coach)}
                  </span>
                  <span className="text-[12.5px] text-ink-3 italic">{coach.style}</span>
                </span>
              </div>
              <h3 className="mb-2.5 text-[22px] leading-tight font-semibold">
                {c.noteTitle[0]}
                <br />
                {c.noteTitle[1]}
              </h3>
              {c.note.map((p) => (
                <p key={p} className="mb-2.5 text-[15px] leading-[1.62] text-ink-2 last:mb-0">
                  {p}
                </p>
              ))}
              <p className="mt-3 inline-flex items-baseline gap-2 rounded-[3px] border border-felt/40 bg-felt/10 px-[13px] py-[7px]">
                <span className="font-mono text-[10.5px] tracking-[.13em] text-felt uppercase">
                  {c.betterLabel}
                </span>
                <span className="font-mono text-[15px] font-semibold text-felt">{c.better}</span>
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </Section>
  );
}
