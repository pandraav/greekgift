import Link from 'next/link';

import { Mark } from '@/components/mark';
import { Avatar } from '@/components/ui';
import { requireApproved } from '@/lib/guards';

import { TopbarSignOut } from './topbar-sign-out';

const navLink =
  'rounded-[3px] px-3 py-1.5 text-[14.5px] text-paper/62 no-underline hover:bg-white/6 hover:text-paper';

/**
 * Everything behind the gate. `requireApproved` runs on every render — the
 * proxy redirect is a convenience, this is the boundary.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireApproved();
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/50 bg-gradient-to-b from-white/10 to-black/16 px-5 py-3.5 shadow-[0_1px_0_rgb(224_188_120/.18)_inset] sm:px-8">
        <Link href="/" className="no-underline">
          <Mark />
        </Link>

        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          <Link href="/" className={navLink}>
            Home
          </Link>
          <Link href="/settings" className={navLink}>
            Settings
          </Link>
          {user.role === 'admin' ? (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-paper/75">
            <Avatar size="sm">{initials}</Avatar>
            <span className="hidden sm:inline">{user.email}</span>
          </span>
          <TopbarSignOut />
        </div>
      </header>

      {children}
    </>
  );
}
