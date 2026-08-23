'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { setError('Use at least 12 characters with upper/lowercase letters and a number.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError('Unable to update the password. The reset link may be expired.'); return; }
    router.replace('/dashboard');
  }

  return <main className="min-h-screen grid place-items-center bg-[#070b10] px-4"><div className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-900 shadow-2xl"><h1 className="text-2xl font-bold">Choose a new password</h1><p className="mt-2 text-sm text-slate-500">Use a strong password that you do not reuse elsewhere.</p><form onSubmit={submit} className="mt-7 space-y-4"><input type="password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password" className="w-full rounded-lg bg-slate-100 px-4 py-3"/><input type="password" required minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm password" className="w-full rounded-lg bg-slate-100 px-4 py-3"/>{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-[#047d02] py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Updating…' : 'Update password'}</button></form></div></main>;
}
