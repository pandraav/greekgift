import { consoleTransport } from './console.ts';
import { brevoTransport } from './brevo.ts';
import {
  approvedEmail,
  resetEmail,
  verifyEmail,
  type Creator,
} from './templates/index.ts';
import type { RenderedEmail, Sender, Transport } from './types.ts';

export * from './types.ts';
export { approvedEmail, resetEmail, verifyEmail, type Creator };

export interface MailerConfig {
  /** Brevo API key. Anything falsy or placeholder-shaped falls back to console. */
  apiKey: string | undefined;
  from: Sender;
  /** Absolute app URL, used to build the links inside each template. */
  appUrl: string;
  /** Who the mail is from. Every template signs off with this. */
  creator: Creator;
}

export interface Mailer {
  readonly transport: Transport['name'];
  sendVerify(to: string, name: string, url: string): Promise<void>;
  sendApproved(to: string, name: string): Promise<void>;
  sendReset(to: string, name: string, url: string): Promise<void>;
}

/**
 * A key that is absent, empty, or still the `.env.example` placeholder means
 * "no Brevo account yet" rather than "misconfigured". Development prints the
 * mail instead, so the sign-up → verify → approve loop is fully walkable with
 * no credentials.
 */
export function looksUnset(key: string | undefined): boolean {
  if (!key) return true;
  const k = key.trim();
  return k === '' || k.startsWith('xkeysib-placeholder') || k === 'placeholder';
}

export function createMailer(config: MailerConfig): Mailer {
  const transport: Transport = looksUnset(config.apiKey)
    ? consoleTransport()
    : brevoTransport(config.apiKey!, config.from);

  /**
   * Never rejects.
   *
   * Better Auth calls these from inside sign-up, and the call sites use
   * `void` rather than `await` (awaiting a mail send there is a timing-attack
   * vector). An unhandled rejection from a refused send would otherwise take
   * down the process, so a transport failure is logged and swallowed — the
   * account still exists and the mail can be resent.
   */
  const deliver = async (
    to: string,
    name: string,
    email: Promise<RenderedEmail>,
  ) => {
    let rendered: RenderedEmail;
    try {
      rendered = await email;
    } catch (error) {
      console.error(`[email] could not render a message for ${to}`, error);
      return;
    }
    try {
      await transport.send({ to, toName: name, ...rendered });
    } catch (error) {
      console.error(
        `[email:${transport.name}] could not send "${rendered.subject}" to ${to}`,
        error instanceof Error ? error.message : error,
      );
    }
  };

  return {
    transport: transport.name,
    sendVerify: (to, name, url) =>
      deliver(to, name, verifyEmail({ name, url, creator: config.creator })),
    sendApproved: (to, name) =>
      deliver(
        to,
        name,
        approvedEmail({
          name,
          url: `${config.appUrl}/login`,
          creator: config.creator,
        }),
      ),
    sendReset: (to, name, url) =>
      deliver(to, name, resetEmail({ name, url, creator: config.creator })),
  };
}
