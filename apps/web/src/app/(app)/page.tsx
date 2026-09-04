import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { Card, CardBody, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';

import { UsernameForm } from './username-form';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireApproved();

  const [profile] = await db
    .select({ username: schema.userProfiles.chesscomUsername })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id))
    .limit(1);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
      <Eyebrow onWood>chess.com game review</Eyebrow>
      <h1 className="type-hero mt-3 font-display text-[clamp(34px,8vw,56px)] leading-none font-semibold tracking-[-0.035em]">
        You hung a knight.
        <br />
        Let&rsquo;s talk about it.
      </h1>
      <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-paper/70">
        Put in a chess.com username. greekgift reads the games, runs the engine
        in your browser, and tells you what actually went wrong.
      </p>

      <Card lift className="mt-7 max-w-[560px]">
        <CardBody>
          <UsernameForm initial={profile?.username ?? ''} />
        </CardBody>
      </Card>

      {!profile?.username ? (
        <p className="mt-4 max-w-[50ch] text-[13.5px] text-paper/45">
          Save your own username in{' '}
          <a href="/settings" className="underline">
            settings
          </a>{' '}
          and this box fills itself in next time.
        </p>
      ) : null}
    </main>
  );
}
