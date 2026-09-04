import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 ships native flat config, so it is imported directly.
 * Do not route it through @eslint/eslintrc's FlatCompat — the shared plugin
 * objects are circular and the compat layer throws while validating them.
 */
const config = [
  {
    // public/ holds vendored third-party assets — the minified Stockfish
    // worker among them. Linting somebody else's build output is noise.
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
