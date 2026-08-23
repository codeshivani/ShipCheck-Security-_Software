import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireUser({ mfa: false });
  if (auth.response) return auth.response;
  return NextResponse.json({
    user: {
      id: auth.user!.id,
      email: auth.user!.email,
      username: auth.user!.user_metadata?.username ?? '',
      github: auth.user!.user_metadata?.github ?? '',
    },
  });
}
