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

export function ApprovedEmail({ name, url, creator }: MailProps) {
  const who = firstName(name);
  return (
    <Shell preview="You are in.">
      <H1>You are in</H1>
      <P>
        {who
          ? `${who} — you are in. Sign in with the password you chose when you asked.`
          : 'You are in. Sign in with the password you chose when you asked.'}
      </P>
      <Cta href={url}>Open greekgift</Cta>
      <P>
        Put in a chess.com username and it will read your games. Everything runs
        in your browser, so nothing is queued behind anyone else.
      </P>
      <Signature
        creator={creator}
        aside="It is a hobby project on a free tier — if something breaks, tell me and I will probably fix it that evening."
      />
      <Fallback url={url} />
    </Shell>
  );
}

ApprovedEmail.PreviewProps = {
  name: 'Ada Marek',
  url: 'https://greekgift.app/login',
  creator: { name: 'Ravi', signOff: '— Ravi' },
} satisfies MailProps;

export default ApprovedEmail;
