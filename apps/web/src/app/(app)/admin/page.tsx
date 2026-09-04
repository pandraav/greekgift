import { schema } from '@greekgift/db';
import { desc, eq } from 'drizzle-orm';

import {
  Card,
  CardBody,
  CardFoot,
  CardHead,
  Chip,
  Eyebrow,
} from '@/components/ui';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/guards';

import { Queue, type QueueUser } from './queue';

export const metadata = { title: 'Admin · greekgift' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
      createdAt: schema.user.createdAt,
      occupation: schema.userProfiles.occupation,
      note: schema.userProfiles.note,
    })
    .from(schema.user)
    .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.user.id))
    .where(eq(schema.user.status, 'pending'))
    .orderBy(desc(schema.user.createdAt));

  const members = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      role: schema.user.role,
    })
    .from(schema.user)
    .where(eq(schema.user.status, 'approved'))
    .orderBy(desc(schema.user.createdAt));

  const queue: QueueUser[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow onWood>Admin</Eyebrow>
          <h1 className="mt-1.5 font-display text-[26px] font-semibold">
            Who gets in
          </h1>
        </div>
        <Chip tone="brass">
          {queue.length} waiting
        </Chip>
      </div>

      <Card>
        <CardHead>
          <h2 className="text-[17px] font-semibold">Requests</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Approving sends the welcome email over your name and unlocks the
            app. Declining sends nothing and signs them out.
          </p>
        </CardHead>
        <CardBody className="px-0 py-0">
          <Queue initial={queue} />
        </CardBody>
        <CardFoot>
          <span className="text-[13px] text-ink-3">
            {members.length} member{members.length === 1 ? '' : 's'} with access
            {members.filter((m) => m.role === 'admin').length
              ? ` · ${members.filter((m) => m.role === 'admin').length} admin`
              : ''}
          </span>
        </CardFoot>
      </Card>
    </main>
  );
}
