import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, supabase, aal: null };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { user: data.user, supabase, aal };
}

export async function requireUser(options: { mfa?: boolean } = {}) {
  const auth = await getCurrentUser();
  if (!auth.user) {
    return { user: null, supabase: auth.supabase, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  if (options.mfa !== false && auth.aal?.currentLevel === 'aal1' && auth.aal?.nextLevel === 'aal2') {
    return { user: null, supabase: auth.supabase, response: NextResponse.json({ error: 'MFA verification required.', code: 'MFA_REQUIRED' }, { status: 403 }) };
  }
  return { user: auth.user, supabase: auth.supabase, response: null };
}

export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  try {
    const requestOrigin = req.nextUrl.origin;
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : requestOrigin;
    const receivedOrigin = new URL(origin).origin;
    if (receivedOrigin !== requestOrigin && receivedOrigin !== configuredOrigin) {
      return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  return null;
}
