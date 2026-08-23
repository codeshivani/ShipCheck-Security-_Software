"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/clientStore";

const items = [
  ["Dashboard", "/dashboard", "⌂"],
  ["New Scan", "/scan", "⌕"],
  ["Scan History", "/profile", "◷"],
  ["Reports", "/profile#reports", "▤"],
  ["Settings", "/profile#settings", "⚙"],
] as const;

export function AppNav() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{username:string;email:string}|null>(null);
  useEffect(() => setUser(getUser()), [path]);
  function signOut() { logout(); setUser(null); router.push("/login"); }
  const active = (href:string) => href.startsWith("/dashboard") ? path === "/dashboard" : href.startsWith("/scan") ? path === "/scan" : href.startsWith("/profile") ? path.startsWith("/profile") : false;
  return <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-sc-border bg-white lg:flex lg:flex-col">
      <div className="px-7 pt-7">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#172b4d] text-xl font-bold text-white shadow-sm">◆</span>
          <span className="text-xl font-extrabold tracking-tight">SHIP<span className="text-sc-pass">CHECK</span></span>
        </Link>
      </div>
      <nav className="mt-12 space-y-2 px-4">
        {items.map(([label, href, icon]) => <Link key={label} href={href} className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-sm font-semibold transition ${active(href) ? "bg-[#eef8f3] text-sc-pass shadow-sm" : "text-sc-text hover:bg-sc-surface-2"}`}><span className="grid h-8 w-8 place-items-center rounded-xl bg-white text-lg shadow-[5px_5px_12px_rgba(25,36,49,.10),-4px_-4px_10px_rgba(255,255,255,.92)] ring-1 ring-sc-border">{icon}</span>{label}</Link>)}
      </nav>
      <div className="mt-auto p-5">
        <div className="rounded-2xl border border-sc-border bg-[#f8fafb] p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white font-bold ring-1 ring-sc-border">{(user?.username || "R").charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{user?.username || "Guest"}</p><p className="text-xs text-sc-muted">Enterprise Plan</p></div></div>
          {user && <button onClick={signOut} className="mt-3 w-full rounded-xl border border-sc-border bg-white px-3 py-2 text-xs font-semibold hover:bg-sc-surface-2">Logout</button>}
        </div>
      </div>
    </aside>
    <header className="sticky top-0 z-30 border-b border-sc-border bg-white/95 backdrop-blur lg:ml-[260px]">
      <div className="flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="lg:hidden"><Link href="/dashboard" className="text-lg font-extrabold">SHIP<span className="text-sc-pass">CHECK</span></Link></div>
        <div className="hidden lg:block text-sm text-sc-muted">Security Center</div>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className={`rounded-xl px-4 py-2 ${path === "/dashboard" ? "font-semibold text-sc-pass" : "text-sc-muted hover:bg-sc-surface-2"}`}>Dashboard</Link>
          <Link href="/profile" className={`rounded-xl px-4 py-2 ${path.startsWith("/profile") ? "font-semibold text-sc-pass" : "text-sc-muted hover:bg-sc-surface-2"}`}>Profile</Link>
          <span className="hidden px-2 text-sc-text sm:inline">{user?.username || "ram"}</span>
          {user && <button onClick={signOut} className="rounded-xl border border-sc-border bg-white px-4 py-2 font-semibold hover:bg-sc-surface-2">Logout</button>}
        </nav>
      </div>
    </header>
  </>;
}
