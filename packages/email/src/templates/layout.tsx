import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

import { t } from './theme.ts';

export interface Creator {
  name: string;
  signOff: string;
}

/* ── the shell ────────────────────────────────────────────────────────────
   Walnut ground, one paper card, the wordmark, then whatever the message is.
   Same materials as the app, minus everything an email client would throw
   away: no grain filter, no gradients on the ground, no custom properties.
   ------------------------------------------------------------------------ */

export function Shell({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        {/* Apple Mail and Thunderbird honour these; Gmail falls back to the
            stack, which is why every fallback is a real face. */}
        <Font
          fontFamily="Fraunces"
          fallbackFontFamily="Georgia"
          webFont={{
            url: 'https://fonts.gstatic.com/s/fraunces/v37/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib1603gg7S2nfgRYIcnrDCiw.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
        <Font
          fontFamily="IBM Plex Sans"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: 'https://fonts.gstatic.com/s/ibmplexsans/v22/zYX9KVElMYYaJe8bpLHnCwDKhdHeFaxOedc.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: '32px 16px',
          backgroundColor: t.wood,
          fontFamily: t.sans,
        }}
      >
        <Container
          style={{
            maxWidth: '520px',
            backgroundColor: t.paper,
            borderRadius: t.radius,
            padding: '34px 32px',
            color: t.ink,
            fontSize: '15px',
            lineHeight: '1.6',
          }}
        >
          <Section style={{ paddingBottom: '22px' }}>
            <Text
              style={{
                margin: 0,
                fontFamily: t.serif,
                fontSize: '21px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: t.ink,
              }}
            >
              greek
              <span style={{ fontWeight: 400, fontStyle: 'italic', color: t.ink2 }}>
                gift
              </span>
            </Text>
          </Section>

          <Hr style={{ margin: 0, borderColor: t.rule, borderTopWidth: '1px' }} />

          <Section style={{ paddingTop: '24px' }}>{children}</Section>
        </Container>
      </Body>
    </Html>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 12px',
        fontFamily: t.serif,
        fontSize: '24px',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: '1.2',
        color: t.ink,
      }}
    >
      {children}
    </Text>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ margin: '0 0 14px', color: t.ink2, fontSize: '15px' }}>
      {children}
    </Text>
  );
}

export function Cta({ href, children }: { href: string; children: string }) {
  return (
    <Section style={{ margin: '22px 0' }}>
      <Button
        href={href}
        style={{
          backgroundColor: t.brass,
          borderRadius: '3px',
          color: t.wood,
          fontSize: '15px',
          fontWeight: 600,
          textDecoration: 'none',
          padding: '12px 22px',
          display: 'inline-block',
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/**
 * The sign-off. This is what makes the mail read as coming from a person
 * rather than from a product.
 */
export function Signature({
  creator,
  aside,
}: {
  creator: Creator;
  aside: string;
}) {
  return (
    <Section style={{ marginTop: '28px' }}>
      <Hr style={{ margin: '0 0 18px', borderColor: t.rule, borderTopWidth: '1px' }} />
      <Text style={{ margin: 0, color: t.ink2, fontSize: '15px' }}>
        {creator.signOff}
      </Text>
      <Text
        style={{
          margin: '10px 0 0',
          color: t.ink3,
          fontSize: '12.5px',
          lineHeight: '1.5',
        }}
      >
        {aside}
      </Text>
    </Section>
  );
}

/** Some clients strip the button; the raw URL has to be reachable. */
export function Fallback({ url }: { url: string }) {
  return (
    <Text
      style={{
        margin: '18px 0 0',
        color: t.ink3,
        fontSize: '12.5px',
        wordBreak: 'break-all',
      }}
    >
      If the button does nothing, paste this in:{' '}
      <Link href={url} style={{ color: t.ink3 }}>
        {url}
      </Link>
    </Text>
  );
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
