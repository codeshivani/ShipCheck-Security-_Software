'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MfaPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') { router.replace('/dashboard'); return; }
      const { data, error } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.find(item => item.status === 'verified');
      if (error || !factor) setError('No verified authenticator factor is available. Contact support.');
      else setFactorId(factor.id);
    })();
  }, [router]);

  async function verify(e: FormEvent) {
    e.preventDefault(); if (!factorId) return; setBusy(true); setError('');
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) { setBusy(false); setError('Unable to start MFA verification.'); return; }
    const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
    setBusy(false);
    if (result.error) { setError('Invalid verification code.'); return; }
    router.replace('/dashboard'); router.refresh();
  }

  return <main className="min-h-screen grid place-items-center bg-[#070b10] px-4"><div className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl"><h1 className="text-2xl font-bold">Two-factor verification</h1><p className="mt-2 text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p><form onSubmit={verify} className="mt-7 space-y-4"><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} className="w-full rounded-lg bg-slate-100 px-4 py-3 text-center text-2xl tracking-[.4em]" placeholder="000000"/>{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy || !factorId} className="w-full rounded-lg bg-[#047d02] py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Verifying…' : 'Verify'}</button></form></div></main>;
}
