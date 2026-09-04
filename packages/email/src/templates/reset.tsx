import * as React from 'react';

import {
  Cta,
  Fallback,
  H1,
  P,
  Shell,
  Signature,
  firstName,
} from './layout.tsx';
import type { MailProps } from './verify.tsx';

export function ResetEmail({ name, url, creator }: MailProps) {
  const who = firstName(name);
  return (
    <Shell preview="This link works once and expires in an hour.">
      <H1>Reset your password</H1>
      <P>
        {who
          ? `${who} — this link works once and expires in an hour.`
          : 'This link works once and expires in an hour.'}
      </P>
      <Cta href={url}>Choose a new password</Cta>
      <P>If you did not ask for this, nothing has changed and you can ignore it.</P>
      <Signature
        creator={creator}
        aside="Every other session gets signed out when you set a new one."
      />
      <Fallback url={url} />
    </Shell>
  );
}

ResetEmail.PreviewProps = {
  name: 'Ada Marek',
  url: 'https://greekgift.app/reset-password?token=abc123',
  creator: { name: 'Ravi', signOff: '— Ravi' },
} satisfies MailProps;

export default ResetEmail;
