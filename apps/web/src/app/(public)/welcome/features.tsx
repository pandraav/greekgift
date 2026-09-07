import { copy } from './copy';
import { Section } from './section';

const c = copy.features;

/** What a review contains, as a tiled grid with hairline gutters. */
export function Features() {
  return (
    <Section kicker={c.kicker} title={c.title}>
      <ul className="grid list-none grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-brass-hi/18 bg-brass-hi/18 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {c.items.map((f) => (
          <li key={f.title} className="bg-[#221709] px-6 py-[22px]">
            <span className="mb-2 block font-mono text-xs text-brass">{f.mark}</span>
            <h3 className="mb-[7px] text-base font-semibold">{f.title}</h3>
            <p className="text-sm leading-[1.55] text-paper/62">{f.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
