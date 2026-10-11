/**
 * Production answers on several hosts (the project alias, the team alias and
 * one URL per deployment), but Better Auth trusts only the origin of
 * BETTER_AUTH_URL, and session cookies belong to the host that set them. A
 * sign-up on any other host failed with "Invalid origin". So every production
 * request on another host is sent to the canonical one.
 *
 * Only on Vercel production: local dev and previews keep their own hosts.
 */
export function canonicalRedirect(
  url: URL,
  canonical: string | undefined,
  vercelEnv: string | undefined,
): URL | null {
  if (vercelEnv !== 'production' || !canonical) return null;
  const target = new URL(canonical);
  if (url.host === target.host) return null;
  return new URL(url.pathname + url.search, target.origin);
}
