import * as React from 'react';

import { Cta, Fallback, H1, P, Shell, Signature, firstName, type Creator } from './layout.tsx';

export interface ShareApprovedProps {
  /** The requester. */
  name: string;
  url: string;
  creator: Creator;
  ownerName: string;
  gameTitle: string;
}

export function ShareApprovedEmail({ name, url, creator, ownerName, gameTitle }: ShareApprovedProps) {
  const who = firstName(name);
  return (
    <Shell preview={`${ownerName} shared ${gameTitle} with you.`}>
      <H1>{ownerName} said yes</H1>
      <P>
        {who ? `${who} — ` : ''}
        {gameTitle} is in your library now. Your coach reads it in your own voice.
      </P>
      <Cta href={url}>Open the game</Cta>
      <Signature creator={creator} aside="It stays in your library. Nobody has to approve it twice." />
      <Fallback url={url} />
    </Shell>
  );
}

ShareApprovedEmail.PreviewProps = {
  name: 'Priya Nair',
  url: 'https://greekgift.app/g/123456789',
  creator: { name: 'Ravi', signOff: '— Ravi' },
  ownerName: 'Ravi Pandey',
  gameTitle: 'Vardges_Tovmasian vs GothamChess',
} satisfies ShareApprovedProps;

export default ShareApprovedEmail;
