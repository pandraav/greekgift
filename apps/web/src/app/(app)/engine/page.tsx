import { Eyebrow } from '@/components/ui';
import { requireApproved } from '@/lib/guards';

import { Bench } from './bench';

export const metadata = { title: 'Engine · greekgift' };

export default async function EnginePage() {
  await requireApproved();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6">
      <Eyebrow onWood>Engine</Eyebrow>
      <h1 className="mt-1.5 mb-2 font-display text-[26px] font-semibold">
        Stockfish, in this browser
      </h1>
      <p className="mb-6 max-w-[54ch] text-[15px] text-paper/65">
        Nothing is sent to a server. The first run downloads the engine once
        and the browser caches it; after that it starts instantly.
      </p>
      <Bench />
    </main>
  );
}
