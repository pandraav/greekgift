import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
const isPglite = !url || url.startsWith('pglite:') || url.startsWith('file:');

export default defineConfig(
  isPglite
    ? {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'postgresql',
        driver: 'pglite',
        dbCredentials: { url: process.env.PGLITE_DIR ?? '../../.pglite' },
      }
    : {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'postgresql',
        dbCredentials: { url: url! },
      },
);
