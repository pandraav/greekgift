'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  Button,
  Card,
  CardBody,
  CardHead,
  Field,
  Input,
  Notice,
} from '@/components/ui';
import { resetPassword } from '@/lib/auth-client';

const MIN_PASSWORD = 10;

export function ResetForm({
  token,
  linkError,
}: {
  token?: string;
  linkError?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  if (linkError || !token) {
    return (
      <Card lift>
        <CardBody className="py-9 text-center">
          <h1 className="text-[23px] font-semibold">That link is spent</h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[15px] text-ink-2">
            Reset links work once and expire after an hour. Ask for a fresh one.
          </p>
          <p className="mt-5 text-[13px] text-ink-3">
            <Link href="/forgot-password" className="underline">
              Send another link
            </Link>
          </p>
        </CardBody>
      </Card>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setError(null);

    const { error } = await resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) {
      setError(error.message ?? 'That link did not work. Ask for a new one.');
      return;
    }
    router.push('/login');
  }

  return (
    <Card lift>
      <CardHead>
        <h1 className="text-[19px] font-semibold">Choose a new password</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Every other session gets signed out.
        </p>
      </CardHead>
      <CardBody>
        {error ? (
          <Notice tone="lacquer" icon="✕" className="mb-4">
            {error}
          </Notice>
        ) : null}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="New password"
            htmlFor="password"
            error={tooShort}
            help={`At least ${MIN_PASSWORD} characters.`}
          >
            <Input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              invalid={tooShort}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field
            label="Confirm password"
            htmlFor="confirm"
            error={mismatch}
            help={mismatch ? 'Those two do not match yet.' : undefined}
          >
            <Input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              invalid={mismatch}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            disabled={busy || mismatch || tooShort}
          >
            {busy ? 'Saving…' : 'Save and log in'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
