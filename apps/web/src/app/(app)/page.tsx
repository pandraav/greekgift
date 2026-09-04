import { Eyebrow } from '@/components/ui';
import { requireApproved } from '@/lib/guards';

export default async function Home() {
  const user = await requireApproved();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Eyebrow onWood>chess.com game review</Eyebrow>
      <h1 className="type-hero mt-3 font-display text-5xl leading-none font-semibold tracking-[-0.035em] sm:text-6xl">
        You hung a knight.
        <br />
        Let&rsquo;s talk about it.
      </h1>
      <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-paper/70">
        You are in, {user.name.split(' ')[0]}. The username entry and game list
        land in the next milestone.
      </p>
    </main>
  );
}
