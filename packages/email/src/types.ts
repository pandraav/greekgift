/** The three emails greekgift sends. Rejections deliberately send nothing. */
export type TemplateName = 'verify' | 'approved' | 'reset';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface Message extends RenderedEmail {
  to: string;
  toName?: string;
}

/**
 * Everything that sends mail implements this. Production uses Brevo;
 * development prints to the terminal, which is what makes the whole
 * verify → approve loop exercisable with no credentials.
 */
export interface Transport {
  readonly name: 'brevo' | 'console';
  send(message: Message): Promise<void>;
}

export interface Sender {
  email: string;
  name: string;
}
