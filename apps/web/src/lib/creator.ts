/**
 * The person behind greekgift.
 *
 * This is invite-only and approved by hand, so the app should say who is
 * doing the approving rather than hiding behind "the admin". Everything the
 * UI and the emails say about him comes from here — edit this one file and
 * the sign-up form, the waiting room, the footer and all three emails follow.
 */
export const creator = {
  /** Used in running copy: "how do you know Ravi?" */
  name: 'Ravi',

  /** Used where a full name reads better — the footer, the email sign-off. */
  fullName: 'Ravi Pandey',

  /** Goes in the Brevo sender name, so mail arrives from a person. */
  sendingAs: 'Ravi at greekgift',

  /**
   * One line, shown under the wordmark on the sign-up screen. Keep it short
   * and true — it is the first thing a stranger asking for access reads.
   */
  blurb: 'I built this for me and a handful of friends. If you are one of them, say so below.',

  /** Shown in the footer. */
  footer: 'Made by Ravi, for a handful of friends.',

  /** How the emails sign off. */
  signOff: '— Ravi',
} as const;
