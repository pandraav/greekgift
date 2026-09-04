/**
 * `pnpm env:check` — imports the env module so zod runs, and exits non-zero
 * if anything is missing. Runs in CI before build.
 */
import { env } from './env.ts';

const names = Object.keys(env).sort();
console.log(`env ok — ${names.length} variables`);
for (const n of names) {
  const secret = /SECRET|KEY|URL$/.test(n) && !n.startsWith('NEXT_PUBLIC');
  const value = String((env as Record<string, unknown>)[n] ?? '');
  console.log(`  ${n} = ${secret ? `${value.slice(0, 8)}…` : value}`);
}
