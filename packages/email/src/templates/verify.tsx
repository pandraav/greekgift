import * as React from 'react';

import {
  Cta,
  Fallback,
  H1,
  P,
  Shell,
  Signature,
  firstName,
  type Creator,
} from './layout.tsx';

export interface MailProps {
  name: string;
  url: string;
  creator: Creator;
}

export function VerifyEmail({ name, url, creator }: MailProps) {
  const who = firstName(name);
  return (
    <Shell preview="One click and your request comes to me.">
      <H1>Confirm your email</H1>
      <P>
        {who ? `${who} — one click and your request comes to me.` : 'One click and your request comes to me.'}
      </P>
      <Cta href={url}>Confirm my email</Cta>
      <P>Until you do, you will not be able to sign in.</P>
      <Signature
        creator={creator}
        aside="I read every request by hand, so this can take a day. There is nothing else for you to do in the meantime."
      />
      <Fallback url={url} />
    </Shell>
  );
}

VerifyEmail.PreviewProps = {
  name: 'Ada Marek',
  url: 'https://greekgift.app/api/auth/verify-email?token=abc123',
  creator: { name: 'Ravi', signOff: '— Ravi' },
} satisfies MailProps;

export default VerifyEmail;
