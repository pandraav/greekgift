'use client';

import type { Route } from 'next';
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
  LinkButton,
  Notice,
  RuleOr,
} from '@/components/ui';
import { signIn } from '@/lib/auth-client';

export function LoginForm({
  next,
  justVerified,
}: {
  next?: string;
  justVerified?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await signIn.email({ email, password });

    if (error) {
      // Better Auth's own message is the useful one here — it distinguishes
      // "email not verified" from bad credentials.
      setError(error.message ?? 'That did not work. Try again.');
      setBusy(false);
      return;
    }
    // typedRoutes cannot know a runtime redirect target, hence the cast.
    // Only same-origin paths are followed, so this is not an open redirect.
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    router.push(target as Route);
    router.refresh();
  }

  return (
    <Card lift>
      <CardHead>
        <h1 className="text-[19px] font-semibold">Log in</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">greekgift is invite-only.</p>
      </CardHead>
      <CardBody>
        {justVerified ? (
          <Notice tone="felt" icon="✓" className="mb-4">
            Email confirmed. Log in and you are through to the waiting room.
          </Notice>
        ) : null}
        {error ? (
          <Notice tone="lacquer" icon="✕" className="mb-4">
            {error}
          </Notice>
        ) : null}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            help={
              <Link href="/forgot-password" className="underline">
                Forgot it?
              </Link>
            }
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" block disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>

          <RuleOr>no account</RuleOr>

          <LinkButton href="/signup" variant="ghost" block>
            Request access
          </LinkButton>
        </form>
      </CardBody>
    </Card>
  );
}
