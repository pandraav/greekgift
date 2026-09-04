import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Mark } from '@/components/mark';
import { Avatar, Card, CardBody, Notice } from '@/components/ui';
import { creator } from '@/lib/creator';
import { requireUser } from '@/lib/guards';

import { SignOutButton } from './sign-out-button';

export const metadata = { title: 'Awaiting approval · greekgift' };

export default async function PendingPage() {
  const user = await requireUser();

  // Approved users have no business here.
  if (user.status === 'approved') redirect('/');

  const rejected = user.status === 'rejected';

  return (
    <main className="mx-auto w-full max-w-[520px] px-5 py-10 sm:py-14">
      <div className="mb-7 flex justify-center">
        <Mark />
      </div>

      <Card lift>
        <CardBody className="px-8 py-9 text-center">
          <div className="mb-4 flex justify-center">
            <Avatar size="xl">{rejected ? '✕' : '⏳'}</Avatar>
          </div>

          <h1 className="mb-2.5 text-[25px] font-semibold">
            {rejected ? 'Not this time' : 'Your request is in'}
          </h1>

          <p className="mx-auto mb-5 max-w-[40ch] text-[15.5px] text-ink-2">
            {rejected ? (
              <>
                {creator.name} looked at your request and turned it down.
                Nothing else happens from here.
              </>
            ) : (
              <>
                Sent as <b>{user.email}</b>. You will get an email the moment it
                is approved — there is nothing else for you to do.
              </>
            )}
          </p>

          {!rejected ? (
            <Notice tone="brass" icon="!" className="text-left">
              Approvals are manual and can take a day. If you have waited longer
              than that, poke the person who sent you here.
            </Notice>
          ) : null}

          <div className="mt-6 flex justify-center gap-2">
            <SignOutButton />
            <Link
              href="/login"
              className="inline-flex items-center rounded-[3px] border border-rule px-3 py-1.5 text-[13px] font-semibold text-ink no-underline hover:bg-ink/6"
            >
              Back to log in
            </Link>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
