"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GENERIC_ERROR = "Unable to sign in with those credentials.";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => { if (data.user) router.replace("/dashboard"); });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    if (register && !/^[A-Za-z0-9_-]{2,39}$/.test(username.trim())) { setError("Username must be 2–39 letters, numbers, _ or -."); return; }
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) { setError("Use at least 12 characters with upper/lowercase letters and a number."); return; }
    setBusy(true);
    const supabase = createClient();
    if (register) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { username: username.trim(), github: `https://github.com/${username.trim()}` }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      setBusy(false);
      if (error) { setError("Unable to create the account. Check the details and try again."); return; }
      if (!data.session) setMessage("Account created. Check your email to confirm the address, then sign in.");
      else router.replace("/dashboard");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error || !data.user) { setError(GENERIC_ERROR); return; }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    router.replace(aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2" ? "/auth/mfa" : safeNext);
    router.refresh();
  }

  return <main className="min-h-screen grid place-items-center bg-[#070b10] px-4 py-8">
    <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-sc-border bg-white shadow-2xl md:grid-cols-2">
      <div className="hidden min-h-[560px] flex-col items-center justify-center bg-[#02662f] p-10 text-center text-white md:flex"><div className="text-4xl font-black">SHIP<span className="text-emerald-200">CHECK</span></div><h1 className="mt-8 text-3xl font-bold">{register ? "Create your account" : "Welcome back"}</h1><p className="mt-3 max-w-xs text-sm text-white/80">{register ? "Use your email and a strong password." : "Secure, cookie-based authentication."}</p></div>
      <div className="min-h-[560px] bg-white p-7 text-slate-800 sm:p-12"><div className="mx-auto max-w-sm"><div className="text-center text-3xl font-bold">{register ? "Registration" : "Login"}</div><p className="mt-2 text-center text-sm text-slate-500">ShipCheck account security is handled by Supabase Auth.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          {register && <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" required className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>}
          <input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>
          <input type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required minLength={12} className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>
          {!register && <div className="text-right text-sm"><Link href="/auth/forgot-password" className="text-slate-600 hover:text-emerald-700">Forgot Password?</Link></div>}
          {error && <p className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-[#047d02] py-3 font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : register ? "Register" : "Login"}</button>
        </form>
        <button onClick={()=>{setRegister(!register);setError("");setMessage("")}} className="mt-6 w-full text-sm text-slate-500">{register ? "Already have an account? Login" : "Don't have an account? Register"}</button>
      </div></div>
    </div>
  </main>;
}
