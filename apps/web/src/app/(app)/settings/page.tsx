import { DEFAULT_PERSONA_ID } from '@greekgift/coach';
import { schema } from '@greekgift/db';
import { eq } from 'drizzle-orm';

import { Card, CardBody, CardHead, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { requireApproved } from '@/lib/guards';

import { AccountForm } from './account-form';
import { CoachForm } from './coach-form';
import { DangerZone } from './danger-zone';

export const metadata = { title: 'Settings · greekgift' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireApproved();

  const [profile] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id))
    .limit(1);

  return (
    <main className="mx-auto max-w-[760px] px-5 py-10 sm:px-6">
      <Eyebrow onWood>Settings</Eyebrow>
      <h1 className="mt-1.5 mb-6 font-display text-[26px] font-semibold">
        How greekgift behaves
      </h1>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHead>
            <h2 className="text-[17px] font-semibold">Account</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Reviews are keyed by chess.com username, not by your account —
              this is just a shortcut to your own games.
            </p>
          </CardHead>
          <CardBody>
            <AccountForm
              email={user.email}
              chesscomUsername={profile?.chesscomUsername ?? ''}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHead>
            <h2 className="text-[17px] font-semibold">Your coach</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Seven voices, freely selectable, and how much each one explains.
            </p>
          </CardHead>
          <CardBody>
            <CoachForm
              personaId={profile?.personaId ?? DEFAULT_PERSONA_ID}
              audience={profile?.audience ?? 'intermediate'}
            />
          </CardBody>
        </Card>

        <Card style={{ borderColor: 'rgb(158 43 32 / .55)' }}>
          <CardHead style={{ borderBottomColor: 'rgb(158 43 32 / .3)' }}>
            <h2 className="text-[17px] font-semibold text-lacquer">
              Delete your account
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Your reviews stay — they are shared and keyed to the chess.com
              username, not to you. Your login, settings and coach choice go.
            </p>
          </CardHead>
          <CardBody>
            <DangerZone />
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
