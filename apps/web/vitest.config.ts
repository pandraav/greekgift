import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Node, not jsdom: everything under test is server code. `server-only` is
 * aliased to an empty module because the real package throws outside a React
 * Server Components bundle.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
