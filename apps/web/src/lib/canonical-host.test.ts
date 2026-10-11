import { describe, expect, it } from 'vitest';

import { canonicalRedirect } from './canonical-host';

const canonical = 'https://greekgift.vercel.app';

describe('canonicalRedirect', () => {
  it('sends another production host to the canonical one, keeping path and query', () => {
    const to = canonicalRedirect(
      new URL('https://greekgift-pnd4.vercel.app/review/123?from=w'),
      canonical,
      'production',
    );
    expect(to?.toString()).toBe('https://greekgift.vercel.app/review/123?from=w');
  });

  it('sends a per-deployment URL to the canonical one', () => {
    const to = canonicalRedirect(
      new URL('https://greekgift-iwr1d7w2b-pnd4.vercel.app/signup'),
      canonical,
      'production',
    );
    expect(to?.toString()).toBe('https://greekgift.vercel.app/signup');
  });

  it('leaves the canonical host alone', () => {
    expect(
      canonicalRedirect(new URL('https://greekgift.vercel.app/login'), canonical, 'production'),
    ).toBeNull();
  });

  it('never redirects outside production', () => {
    expect(
      canonicalRedirect(new URL('http://127.0.0.1:3000/login'), 'http://localhost:3000', undefined),
    ).toBeNull();
    expect(
      canonicalRedirect(new URL('https://greekgift-abc-pnd4.vercel.app/'), canonical, 'preview'),
    ).toBeNull();
  });

  it('does nothing without a canonical URL', () => {
    expect(
      canonicalRedirect(new URL('https://greekgift-pnd4.vercel.app/'), undefined, 'production'),
    ).toBeNull();
  });
});
