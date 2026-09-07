import { Eyebrow } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * One band of the landing page: a kicker, a heading, an optional lede, then
 * whatever the section is about. The rule between bands is the only chrome.
 */
export function Section({
  id,
  kicker,
  title,
  lede,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  kicker: string;
  title: React.ReactNode;
  lede?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-6 border-t border-brass-hi/16 py-14 sm:py-[78px]',
        className,
      )}
    >
      <Eyebrow onWood className="mb-3.5 tracking-[.18em]">
        {kicker}
      </Eyebrow>
      <h2 className="type-display font-display text-[clamp(25px,3.2vw,34px)] leading-[1.15] font-semibold tracking-[-.02em]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-2 max-w-[56ch] text-[17px] leading-relaxed text-paper/72">
          {lede}
        </p>
      ) : null}
      <div className={cn('mt-8', bodyClassName)}>{children}</div>
    </section>
  );
}
