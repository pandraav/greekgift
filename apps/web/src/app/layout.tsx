import type { Metadata } from 'next';

import { TableTop } from '@/components/table-top';

import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'greekgift',
  description:
    'A chess game reviewer that tells you what actually went wrong, in words.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // No `dark` class and no theme script: the design is committed to one theme.
  return (
    <html lang="en" className={fontVariables}>
      <body className="antialiased">
        <TableTop />
        <div className="relative z-[2]">{children}</div>
      </body>
    </html>
  );
}
