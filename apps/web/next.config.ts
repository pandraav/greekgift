import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /** Statically typed hrefs. Worth it: the spec freezes about ten route paths. */
  typedRoutes: true,

  /**
   * PGlite ships wasm and a virtual filesystem that bundlers mangle, so it
   * has to stay external and be required at runtime.
   */
  serverExternalPackages: ['@electric-sql/pglite'],

  /**
   * Turbopack is the default bundler in 16 — for `next build` as well as
   * `next dev`. Never add a `webpack` key here: the build hard-fails if it
   * finds one.
   *
   * Deliberately absent:
   *   transpilePackages — Turbopack already transpiles pnpm workspace packages.
   *   eslint { … }      — the option was removed in 16 along with `next lint`.
   */
  turbopack: {},

  /**
   * `next dev` otherwise regenerates AGENTS.md and CLAUDE.md on every run,
   * which leaves the tree permanently dirty. This project keeps its guidance
   * in docs/ instead.
   */
  agentRules: false,

  /**
   * The Stockfish worker and wasm are served from public/engine under the
   * build's name (`/engine/stockfish-18-lite-single.*`). A new engine build
   * is a new path, so the old one can be cached for a year. Caveat: bumping
   * the `stockfish` package without changing that name keeps the same URL —
   * rename BUILD in scripts/prepare-engine.mjs and ENGINE_BUILD in
   * src/lib/engine/client.ts together when the engine bytes change.
   *
   * `:path+`, not `:path*`: `/engine` itself is a page, and a year-long
   * immutable header on HTML would be a disaster.
   */
  async headers() {
    return [
      {
        source: '/engine/:path+',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
