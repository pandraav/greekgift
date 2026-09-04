import { getCookieCache, getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the exported function
 * with it. Runs on the Node runtime; the runtime is not configurable here.
 *
 * This is a redirect convenience, NOT the security boundary. Every route
 * handler and page re-checks server-side via lib/guards.ts.
 */

/** Reachable signed out. */
const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password'];

/** Reachable while signed in but not yet approved. */
const ALWAYS = ['/pending', '/api/auth', '/api/me/profile'];

const under = (path: string, roots: string[]) =>
  roots.some((r) => path === r || path.startsWith(`${r}/`));

/** Only the fields the gate reads. Better Auth does not export its payload type. */
interface Cached {
  user: {
    id: string;
    email: string;
    role: 'admin' | 'member';
    status: 'pending' | 'approved' | 'rejected';
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Better Auth's own endpoints must never be gated.
  if (under(pathname, ['/api/auth'])) return NextResponse.next();

  const cached = (await getCookieCache(request, {
    secret: process.env.BETTER_AUTH_SECRET,
  })) as Cached | null;

  // `cached` is null both when signed out AND when the cache has simply
  // expired, so presence is checked separately.
  const signedIn = cached !== null || getSessionCookie(request) !== null;

  if (!signedIn) {
    if (under(pathname, PUBLIC)) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (under(pathname, PUBLIC)) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (under(pathname, ALWAYS)) return NextResponse.next();

  // Cache expired rather than unapproved: let the server-side guard decide.
  if (!cached) return NextResponse.next();

  if (cached.user.status !== 'approved') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'forbidden', status: cached.user.status },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL('/pending', request.url));
  }

  const wantsAdmin =
    under(pathname, ['/admin']) || pathname.startsWith('/api/admin');
  if (wantsAdmin && cached.user.role !== 'admin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)',
  ],
};
