"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, saveUser } from "@/lib/clientStore";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (getUser()) router.replace("/profile"); }, [router]);

  function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!username.trim() || !password.trim() || (register && !email.trim())) { setError("Please fill all required fields."); return; }
    const user = { username: username.trim(), email: email.trim() || `${username.trim()}@shipcheck.local`, github: `https://github.com/${username.trim()}` };
    saveUser(user);
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[#070b10] px-4 py-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-sc-border bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden min-h-[560px] flex-col items-center justify-center bg-[#02662f] p-10 text-center text-white md:flex">
          <div className="text-4xl font-black">SHIP<span className="text-emerald-200">CHECK</span></div>
          <h1 className="mt-8 text-3xl font-bold">{register ? "Welcome!" : "Hello, Welcome!"}</h1>
          <p className="mt-3 max-w-xs text-sm text-white/80">{register ? "Already have an account?" : "Don't have an account?"}</p>
          <button onClick={() => setRegister(!register)} className="mt-6 rounded-lg border-2 border-white px-8 py-2 font-semibold">{register ? "Login" : "Register"}</button>
        </div>
        <div className="min-h-[560px] bg-white p-7 text-slate-800 sm:p-12">
          <div className="mx-auto max-w-sm">
            <div className="text-center text-3xl font-bold">{register ? "Registration" : "Login"}</div>
            <p className="mt-2 text-center text-sm text-slate-500">ShipCheck V1 demo profile access.</p>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" required className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>
              {register && <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" required className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>}
              <input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required className="w-full rounded-lg bg-slate-100 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-600"/>
              {!register && <div className="text-right text-sm"><button type="button" className="text-slate-600 hover:text-emerald-700">Forgot Password?</button></div>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="w-full rounded-lg bg-[#047d02] py-3 font-semibold text-white">{register ? "Register" : "Login"}</button>
            </form>
            <button onClick={()=>setRegister(!register)} className="mt-6 w-full text-sm text-slate-500 md:hidden">{register ? "Already have an account? Login" : "Don't have an account? Register"}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
