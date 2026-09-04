import type { Message, Sender, Transport } from './types.ts';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo transactional email over plain fetch.
 *
 * The @getbrevo/brevo SDK wraps exactly one endpoint for this use, so it is
 * not worth the dependency.
 */
export function brevoTransport(apiKey: string, from: Sender): Transport {
  return {
    name: 'brevo',
    async send(message: Message): Promise<void> {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name },
          to: [{ email: message.to, name: message.toName || undefined }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `Brevo refused the message (${response.status}): ${detail.slice(0, 300)}`,
        );
      }
    },
  };
}
