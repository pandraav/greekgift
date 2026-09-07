import { copy } from './copy';
import { Section } from './section';

const c = copy.steps;

/** Three steps in order, which is why they are numbered. */
export function Steps() {
  return (
    <Section kicker={c.kicker} title={c.title}>
      <ol className="grid list-none gap-[26px] p-0 lg:grid-cols-3 lg:gap-0">
        {c.items.map((s, i) => (
          <li
            key={s.title}
            className="border-l border-brass-hi/20 pl-[22px] lg:px-[30px] lg:first:border-l-0 lg:first:pl-0"
          >
            <span className="type-display mb-3 block font-display text-[46px] leading-none font-semibold tracking-[-.04em] text-brass">
              {i + 1}
            </span>
            <h3 className="mb-2 text-[19px] font-semibold">{s.title}</h3>
            <p className="text-[14.5px] leading-relaxed text-paper/66">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
