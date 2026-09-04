'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  Button,
  Card,
  CardBody,
  CardHead,
  Field,
  Input,
} from '@/components/ui';
import { requestPasswordReset } from '@/lib/auth-client';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await requestPasswordReset({ email, redirectTo: '/reset-password' });
    // Deliberately not branching on the result: a different message for a
    // known address would leak the membership list.
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card lift>
        <CardBody className="py-9 text-center">
          <h1 className="text-[23px] font-semibold">Check your email</h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[15px] text-ink-2">
            If <b>{email}</b> has an account, a reset link is on its way. It
            works once and expires in an hour.
          </p>
          <p className="mt-5 text-[13px] text-ink-3">
            <Link href="/login" className="underline">
              Back to log in
            </Link>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card lift>
      <CardHead>
        <h1 className="text-[19px] font-semibold">Forgot your password</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          We will send a link that lets you choose a new one.
        </p>
      </CardHead>
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? 'Sending…' : 'Send the link'}
          </Button>
          <p className="text-center text-[12.5px] text-ink-3">
            <Link href="/login" className="underline">
              Back to log in
            </Link>
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
