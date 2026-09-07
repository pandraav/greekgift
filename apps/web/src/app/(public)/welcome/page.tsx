import type { Metadata } from 'next';

import { Closer } from './closer';
import { Compare } from './compare';
import { Features } from './features';
import { Hero } from './hero';
import { Steps } from './steps';
import { Voices } from './voices';

export const metadata: Metadata = {
  title: 'greekgift',
  description:
    'Your chess.com games, reviewed by Stockfish in your browser and explained by a coach in words. Invite-only.',
};

/**
 * The public front door. A signed-out visit to `/` is rewritten here by the
 * proxy, so the address bar still says the site's name and nothing else.
 */
export default function WelcomePage() {
  return (
    <main>
      <Hero />
      <Compare />
      <Voices />
      <Steps />
      <Features />
      <Closer />
    </main>
  );
}
