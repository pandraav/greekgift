/**
 * The app's tokens, as plain values.
 *
 * Email clients ignore stylesheets and custom properties, so every colour has
 * to be inlined literally. These are the same hexes as apps/web globals.css —
 * if one changes there, change it here.
 */
export const t = {
  wood: '#1B130C',
  woodTone: '#3A2716',

  paper: '#F7F2E5',
  paper2: '#EFE8D6',
  ink: '#1A150F',
  ink2: '#4E4432',
  ink3: '#8B8068',
  rule: '#DBD1B9',

  brass: '#BE8F3E',
  brassHi: '#E0BC78',
  felt: '#2E5C43',
  lacquer: '#9E2B20',

  radius: '5px',
  serif: "Fraunces, Georgia, 'Times New Roman', serif",
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;
