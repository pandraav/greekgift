import type { Message, Transport } from './types.ts';

const LINK = /https?:\/\/\S+/g;

/**
 * Prints the mail to stdout instead of sending it.
 *
 * The links are pulled out and printed on their own line because the whole
 * point of this transport is that you copy the verification link out of the
 * terminal and carry on.
 */
export function consoleTransport(): Transport {
  return {
    name: 'console',
    async send(message: Message): Promise<void> {
      const links = [...new Set(message.text.match(LINK) ?? [])];
      const rule = '─'.repeat(64);
      console.log(
        [
          '',
          rule,
          `  email → ${message.to}`,
          `  subject: ${message.subject}`,
          rule,
          message.text
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n'),
          links.length ? `${rule}\n  link: ${links.join('\n  link: ')}` : '',
          rule,
          '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    },
  };
}
