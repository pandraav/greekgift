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
  Notice,
  Textarea,
} from '@/components/ui';
import { signUp } from '@/lib/auth-client';
import { creator } from '@/lib/creator';

const MIN_PASSWORD = 10;

export function SignupForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    occupation: '',
    password: '',
    confirm: '',
    note: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;
  const tooShort = form.password.length > 0 && form.password.length < MIN_PASSWORD;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch || tooShort) return;
    if (!form.note.trim()) {
      setError('Say something in the last box — blank requests get declined.');
      return;
    }

    setBusy(true);
    setError(null);

    const { error } = await signUp.email({
      name: form.name,
      email: form.email,
      password: form.password,
      // Extra keys survive to the databaseHook, which writes user_profiles.
      occupation: form.occupation,
      note: form.note,
    } as Parameters<typeof signUp.email>[0]);

    setBusy(false);
    if (error) {
      setError(error.message ?? 'That did not work. Try again.');
      return;
    }
    setSubmitted(true);
  }

  /**
   * Always the same message.
   *
   * Better Auth turns on sign-up enumeration protection whenever email
   * verification is required: signing up with an address that already exists
   * returns success and sends nothing. Saying "account created" would be a
   * lie in that case, and "email already in use" would leak the membership
   * list. "Check your email" is true either way.
   */
  if (submitted) {
    return (
      <Card lift>
        <CardBody className="py-9 text-center">
          <h1 className="text-[23px] font-semibold">Check your email</h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[15px] text-ink-2">
            If that address can be signed up, a confirmation link is on its way
            to <b>{form.email}</b>. Click it, and your request goes to{' '}
            {creator.name}.
          </p>
          <p className="mt-5 text-[13px] text-ink-3">
            Already confirmed?{' '}
            <Link href="/login" className="underline">
              Log in
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card lift>
      <CardHead>
        <h1 className="text-[19px] font-semibold">Request access</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {creator.blurb} Pick your password now — once {creator.name} says
          yes, you just log in.
        </p>
      </CardHead>
      <CardBody>
        {error ? (
          <Notice tone="lacquer" icon="✕" className="mb-4">
            {error}
          </Notice>
        ) : null}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Your name" htmlFor="name">
            <Input
              id="name"
              required
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={set('name')}
            />
          </Field>

          <Field label="Email" htmlFor="email" help="Where the approval lands.">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
            />
          </Field>

          <Field
            label="Occupation"
            htmlFor="occupation"
            help={`Just so ${creator.name} can place you.`}
          >
            <Input
              id="occupation"
              required
              placeholder="Radiographer, student, retired…"
              value={form.occupation}
              onChange={set('occupation')}
            />
          </Field>

          <Field
            label="Choose a password"
            htmlFor="password"
            error={tooShort}
            help={
              tooShort
                ? `At least ${MIN_PASSWORD} characters.`
                : `At least ${MIN_PASSWORD} characters. You will use this the moment you are approved.`
            }
          >
            <Input
              id="password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              placeholder="••••••••••"
              invalid={tooShort}
              value={form.password}
              onChange={set('password')}
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
              placeholder="••••••••••"
              invalid={mismatch}
              value={form.confirm}
              onChange={set('confirm')}
            />
          </Field>

          <Field
            label={`How do you know ${creator.name}?`}
            htmlFor="note"
            help={`Say something here — ${creator.name} declines blank requests.`}
          >
            <Textarea
              id="note"
              required
              placeholder="A sentence is plenty."
              value={form.note}
              onChange={set('note')}
            />
          </Field>

          <Button
            type="submit"
            variant="brass"
            size="lg"
            block
            disabled={busy || mismatch || tooShort}
          >
            {busy ? 'Sending…' : 'Send request'}
          </Button>

          <p className="text-center text-[12.5px] text-ink-3">
            Already approved?{' '}
            <Link href="/login" className="underline">
              Log in
            </Link>
            .
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
