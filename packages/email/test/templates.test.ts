import { describe, expect, it } from 'vitest';

import { shareApprovedEmail, shareRequestedEmail } from '../src/templates/index.ts';

const creator = { name: 'Ravi', signOff: '— Ravi' };

describe('share emails render both parts', () => {
  it('requested: subject names requester and game; button goes home', async () => {
    const mail = await shareRequestedEmail({
      name: 'Ravi Pandey',
      url: 'https://greekgift.app/',
      creator,
      requesterName: 'Priya Nair',
      gameTitle: 'Vardges_Tovmasian vs GothamChess',
    });
    expect(mail.subject).toBe('Priya Nair asked to see Vardges_Tovmasian vs GothamChess');
    expect(mail.html).toContain('https://greekgift.app/');
    expect(mail.html).toContain('See the request');
    expect(mail.text).toContain('Priya Nair');
  });

  it('approved: subject names owner and game; button opens the game', async () => {
    const mail = await shareApprovedEmail({
      name: 'Priya Nair',
      url: 'https://greekgift.app/g/123456789',
      creator,
      ownerName: 'Ravi Pandey',
      gameTitle: 'Vardges_Tovmasian vs GothamChess',
    });
    expect(mail.subject).toBe('Ravi Pandey shared Vardges_Tovmasian vs GothamChess with you');
    expect(mail.html).toContain('/g/123456789');
    expect(mail.html).toContain('Open the game');
  });
});
