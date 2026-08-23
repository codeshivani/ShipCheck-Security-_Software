'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(''); setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` });
    setBusy(false);
    if (error) { setError('Unable to start password reset. Please try again.'); return; }
    setMessage('If an account exists for that email, a password reset email has been sent.');
  }

  return <main className="min-h-screen grid place-items-center bg-[#070b10] px-4"><div className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl"><h1 className="text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm text-slate-500">We will not reveal whether an account exists.</p><form onSubmit={submit} className="mt-7 space-y-4"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg bg-slate-100 px-4 py-3"/><button disabled={busy} className="w-full rounded-lg bg-[#047d02] py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send reset email'}</button></form>{message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}{error && <p className="mt-4 text-sm text-red-600">{error}</p>}<Link href="/login" className="mt-6 block text-center text-sm text-slate-500">← Back to login</Link></div></main>;
}
