import Link from 'next/link';

import { Mark } from '@/components/mark';
import { buttonClass } from '@/components/ui';
import { cn } from '@/lib/utils';

import { copy } from './welcome/copy';

/**
 * The shell for anything a stranger can read: a header with the two ways in,
 * the page, and a footer. Sits on the wood like the rest of the app; nothing
 * here needs a session.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1240px] px-5 sm:px-[34px]">
      <header className="flex items-center gap-4 py-5">
        <Link href="/" className="no-underline">
          <Mark />
        </Link>
        <nav className="ml-auto flex items-center gap-2.5">
          <Link
            href="/login"
            className={cn(buttonClass({ variant: 'onwood', size: 'sm' }), 'no-underline')}
          >
            {copy.nav.login}
          </Link>
          <Link
            href="/signup"
            className={cn(buttonClass({ variant: 'brass', size: 'sm' }), 'no-underline')}
          >
            {copy.nav.request}
          </Link>
        </nav>
      </header>

      {children}

      <footer className="mt-16 flex flex-wrap items-center gap-5 border-t border-brass-hi/16 pt-8 pb-14">
        <Link href="/" className="no-underline">
          <Mark className="text-[18px]" />
        </Link>
        <p className="text-[13px] text-paper/42">{copy.footer.line}</p>
      </footer>
    </div>
  );
}
