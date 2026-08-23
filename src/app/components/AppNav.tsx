"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AppNav() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{username:string;email:string}|null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { username: data.user.user_metadata?.username ?? data.user.email?.split("@")[0] ?? "User", email: data.user.email ?? "" } : null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { username: session.user.user_metadata?.username ?? session.user.email?.split("@")[0] ?? "User", email: session.user.email ?? "" } : null));
    return () => listener.subscription.unsubscribe();
  }, [path]);
  async function signOut() { await createClient().auth.signOut({ scope: "global" }); router.replace("/login"); router.refresh(); }
  return <header className="sticky top-0 z-40 border-b border-sc-border bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8"><Link href="/dashboard" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#172b4d] text-xl font-bold text-white shadow-sm">◆</span><span className="text-lg font-extrabold tracking-tight">SHIP <span className="text-sc-accent">CHECK</span></span></Link><nav className="flex items-center gap-2 text-sm"><Link className={`rounded-xl px-4 py-2 ${path === "/dashboard" ? "bg-[#edf2ff] font-semibold text-sc-accent" : "text-sc-muted hover:bg-sc-surface-2"}`} href="/dashboard">Dashboard</Link><Link className={`rounded-xl px-4 py-2 ${path.startsWith("/profile") ? "bg-[#edf2ff] font-semibold text-sc-accent" : "text-sc-muted hover:bg-sc-surface-2"}`} href="/profile">Profile</Link>{user ? <><span className="hidden rounded-xl bg-sc-surface-2 px-3 py-2 text-xs text-sc-muted sm:inline">{user.username}</span><button onClick={signOut} className="rounded-xl border border-sc-border px-4 py-2 text-sc-muted hover:bg-sc-surface-2">Logout</button></> : null}</nav></div></header>;
}
