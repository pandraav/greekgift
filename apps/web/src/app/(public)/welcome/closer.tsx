import Link from 'next/link';

import { buttonClass } from '@/components/ui';
import { creator } from '@/lib/creator';
import { cn } from '@/lib/utils';

import { copy } from './copy';

const c = copy.closer;

/** The last word: it is invite-only, and here is who does the inviting. */
export function Closer() {
  return (
    <section className="pt-14 sm:pt-[78px]">
      <div className="grid items-center gap-[34px] rounded-[5px] bg-paper px-7 py-8 text-ink shadow-lift sm:px-[46px] sm:py-11 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="type-display mb-2.5 font-display text-[clamp(24px,3vw,32px)] leading-tight font-semibold tracking-[-.02em]">
            {c.title}
          </h2>
          <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-ink-2">
            {c.body.replace('{name}', creator.name)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/signup"
            className={cn(buttonClass({ variant: 'primary', size: 'lg' }), 'no-underline')}
          >
            {c.primary}
          </Link>
          <Link
            href="/login"
            className={cn(buttonClass({ variant: 'ghost', size: 'lg' }), 'no-underline')}
          >
            {c.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
