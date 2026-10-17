import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from './config';

const PUBLIC_PREFIXES = ['/login', '/auth', '/reports/shared', '/api/health', '/setup'];
const PROTECTED_PAGES = ['/dashboard', '/profile', '/flow-lab'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedPage(pathname: string) {
  return PROTECTED_PAGES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function updateSession(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const pathname = request.nextUrl.pathname;

  // A fresh clone should start cleanly even before the developer creates .env.local.
  // Keep health/setup available so the app explains what is missing instead of
  // crashing inside @supabase/ssr with an opaque runtime error.
  if (!config) {
    if (pathname === '/setup' || pathname.startsWith('/api/health')) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/setup';
    url.search = '';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && !isPublic(pathname) && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const url = request.nextUrl.clone();
    url.pathname = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2' ? '/auth/mfa' : '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (user && isProtectedPage(pathname) && pathname !== '/auth/mfa') {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/mfa';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
