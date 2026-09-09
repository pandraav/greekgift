import Link from 'next/link';

import { Avatar } from '@/components/ui';

export interface AccountTab {
  username: string;
  displayName: string;
  thisWeek: number;
}

export function AccountTabs({ tabs, current }: { tabs: AccountTab[]; current: string }) {
  return (
    <nav aria-label="Linked chess.com accounts" className="mb-[22px] flex flex-wrap items-center gap-2">
      {tabs.map((t) => {
        const selected = t.username === current;
        return (
          <Link
            key={t.username}
            aria-current={selected ? 'page' : undefined}
            href={`/u/${t.username}`}
            className={`inline-flex items-center gap-[9px] rounded-full border py-1.5 pr-3.5 pl-1.5 no-underline ${
              selected
                ? 'border-brass bg-black/40 text-paper shadow-[0_0_0_1px_rgb(190_143_62/.35)]'
                : 'border-brass-hi/25 bg-black/18 text-paper/70 hover:bg-black/30 hover:text-paper'
            }`}
          >
            <Avatar size="sm">{t.displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'}</Avatar>
            <span className="text-[14px] font-semibold">{t.displayName}</span>
            <span className="font-mono text-[11.5px] text-paper/50">{t.thisWeek} this week</span>
          </Link>
        );
      })}
      <Link href="/" className="rounded-full border border-dashed border-brass-hi/35 px-2.5 py-1.5 text-[13.5px] text-brass-hi no-underline hover:bg-white/6">
        + Add account
      </Link>
    </nav>
  );
}
