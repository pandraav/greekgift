import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

/**
 * Display. next/font does support Fraunces's custom SOFT and WONK axes, so
 * the prototype's two <link> tags to fonts.googleapis.com are not needed —
 * the faces are self-hosted.
 *
 * `wght` must NOT appear in `axes`: next/font filters it out of the definable
 * list and throws "Invalid axes value `wght`". Omitting `weight` entirely is
 * what selects the variable font and gives the full 100..900 range.
 *
 * Italic is deliberately not requested. `ital` is a separate file rather than
 * an axis, so asking for it doubles the download, and the display face is
 * never set in italic.
 */
export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT', 'WONK'],
});

/**
 * Interface text. Variable on Google Fonts, so no `weight`. The prototype
 * does use italic 400, and italic is a separate face here too, so it has to
 * be requested explicitly.
 */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-sans',
  style: ['normal', 'italic'],
});

/**
 * Notation, evals, anything read as data.
 *
 * IBM Plex Mono is *not* a variable font in Google's catalogue — there is no
 * "variable" entry and no axes. Omitting `weight` throws "Missing weight for
 * font `IBM Plex Mono`", so the three weights the design actually uses are
 * enumerated.
 */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
});

export const fontVariables = [
  fraunces.variable,
  plexSans.variable,
  plexMono.variable,
].join(' ');
