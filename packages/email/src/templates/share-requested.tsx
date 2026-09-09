import * as React from 'react';

import { Cta, Fallback, H1, P, Shell, Signature, firstName, type Creator } from './layout.tsx';

export interface ShareRequestedProps {
  /** The owner. */
  name: string;
  url: string;
  creator: Creator;
  requesterName: string;
  gameTitle: string;
}

export function ShareRequestedEmail({ name, url, creator, requesterName, gameTitle }: ShareRequestedProps) {
  const who = firstName(name);
  return (
    <Shell preview={`${requesterName} asked to see ${gameTitle}.`}>
      <H1>{requesterName} wants to see a game</H1>
      <P>
        {who ? `${who} — ` : ''}
        {requesterName} asked to see {gameTitle}. Say yes and their coach reads it in their own voice; say no and nothing happens.
      </P>
      <Cta href={url}>See the request</Cta>
      <P>The bell on the home page has it. Approve or decline there.</P>
      <Signature creator={creator} aside="You get one of these for every request. There is no digest, because there are not many of you." />
      <Fallback url={url} />
    </Shell>
  );
}

ShareRequestedEmail.PreviewProps = {
  name: 'Ravi Pandey',
  url: 'https://greekgift.app/',
  creator: { name: 'Ravi', signOff: '— Ravi' },
  requesterName: 'Priya Nair',
  gameTitle: 'Vardges_Tovmasian vs GothamChess',
} satisfies ShareRequestedProps;

export default ShareRequestedEmail;
