import { render } from '@react-email/render';

import type { RenderedEmail } from '../types.ts';
import { ApprovedEmail } from './approved.tsx';
import type { Creator } from './layout.tsx';
import { ResetEmail } from './reset.tsx';
import { VerifyEmail } from './verify.tsx';
import type { MailProps } from './verify.tsx';

export type { Creator, MailProps };
export { ApprovedEmail, ResetEmail, VerifyEmail };

/**
 * Renders a template to both parts.
 *
 * The plain-text alternative is generated from the same tree rather than
 * hand-written, so it cannot drift from the HTML — which is exactly how the
 * two versions used to disagree.
 */
async function renderBoth(
  element: React.ReactElement,
  subject: string,
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element, { pretty: false }),
    render(element, { plainText: true }),
  ]);
  return { subject, html, text };
}

export const verifyEmail = (p: MailProps) =>
  renderBoth(VerifyEmail(p), 'Confirm your email for greekgift');

export const approvedEmail = (p: MailProps) =>
  renderBoth(ApprovedEmail(p), 'You are in');

export const resetEmail = (p: MailProps) =>
  renderBoth(ResetEmail(p), 'Reset your greekgift password');
