"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/app/components/AppNav";
import { getRepositories, getStoredScans, getUser, removeRepository, saveUser, StoredScan } from "@/lib/clientStore";

export default function ProfilePage() {
  const [user, setUser] = useState({username:"",email:"",github:""});
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [repos, setRepos] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setUser(getUser() || {username:"Guest",email:"",github:""}); setScans(getStoredScans()); setRepos(getRepositories()); }, []);

  const avg = scans.length ? Math.round(scans.reduce((a,s)=>a+s.score,0)/scans.length) : 0;
  const vulns = scans.reduce((a,s)=>a+s.vulnerabilities,0);
  const fixed = scans.reduce((a,s)=>a+s.fixed,0);
  const critical = scans.reduce((a,s)=>a+s.critical,0);
  const high = scans.reduce((a,s)=>a+s.high,0);
  const medium = scans.reduce((a,s)=>a+s.medium,0);
  const low = Math.max(0, vulns - critical - high - medium);
  const chart = scans.slice(0, 7).reverse();

  function save() { saveUser(user); setEditing(false); }
  function scanAgain(url:string) { window.location.href = `/scan?repo=${encodeURIComponent(url)}`; }
  function remove(url:string) { removeRepository(url); setRepos(getRepositories()); }

  return <><AppNav/><main id="reports" className="mx-auto w-[94%] max-w-[1200px] py-6 sm:py-8 lg:ml-[260px]">
    <section className="sc-card p-7 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-sc-pass text-4xl font-bold text-[#07110e]">{(user.username||"G").charAt(0).toUpperCase()}</div>
        <div className="flex-1">
          {editing ? <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <input value={user.username} onChange={e=>setUser({...user,username:e.target.value})} className="rounded-lg border border-sc-border bg-white px-3 py-2"/>
            <input value={user.email} onChange={e=>setUser({...user,email:e.target.value})} className="rounded-lg border border-sc-border bg-white px-3 py-2"/>
            <input value={user.github} onChange={e=>setUser({...user,github:e.target.value})} className="rounded-lg border border-sc-border bg-white px-3 py-2 sm:col-span-2"/>
          </div> : <><h1 className="text-3xl font-bold">{user.username}</h1><p className="mt-1 text-sc-muted">{user.email}</p><p className="mt-1 text-sm text-sc-pass">{user.github}</p></>}
          <button onClick={()=>editing?save():setEditing(true)} className="mt-4 rounded-lg bg-sc-pass px-4 py-2 text-sm font-semibold text-[#07110e]">{editing?"Save Changes":"Edit Profile"}</button>
        </div>
      </div>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat title="Total Scans" value={scans.length}/><Stat title="Average Score" value={`${avg}/100`}/><Stat title="Vulnerabilities" value={vulns}/><Stat title="Fixed" value={fixed}/>
    </section>

    <section className="mt-6 sc-card p-7">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Scan History</h2><p className="text-sm text-sc-muted">Every scan launched from ShipCheck is stored here.</p></div><Link href="/scan" className="rounded-lg bg-sc-pass px-4 py-2 text-sm font-semibold text-[#07110e]">New Scan</Link></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-sc-muted"><tr><th className="p-3">Repository</th><th className="p-3">Score</th><th className="p-3">Grade</th><th className="p-3">Issues</th><th className="p-3">Date</th></tr></thead><tbody>{scans.length ? scans.map(s=><tr key={s.scanId} className="border-t border-sc-border"><td className="p-3">{s.repoUrl.replace("https://github.com/","").replace(/\.git$/,"")}</td><td className="p-3 font-bold text-sc-pass">{s.score}/100</td><td className="p-3">{s.grade}</td><td className="p-3">{s.vulnerabilities}</td><td className="p-3 text-sc-muted">{new Date(s.createdAt).toLocaleString()}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-sc-muted">No scans yet. Run your first repository scan.</td></tr>}</tbody></table></div>
    </section>

    <section className="mt-6 sc-card p-7">
      <h2 className="text-xl font-bold">Saved Repositories</h2><p className="text-sm text-sc-muted">Quickly scan repositories you have already connected.</p>
      <div className="mt-5 grid gap-3">{repos.length ? repos.map(url=><div key={url} className="sc-tile flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{url.replace("https://github.com/","").replace(/\.git$/,"")}</p><p className="text-xs text-sc-muted">{url}</p></div><div className="flex gap-2"><button onClick={()=>scanAgain(url)} className="rounded-lg bg-sc-pass px-3 py-2 text-sm font-semibold text-[#07110e]">Scan Again</button><button onClick={()=>remove(url)} className="rounded-lg border border-sc-border px-3 py-2 text-sm text-sc-muted">Remove</button></div></div>) : <p className="rounded-lg border border-sc-border p-5 text-sm text-sc-muted">Repositories appear here after your first scan.</p>}</div>
    </section>

    <section className="mt-6 sc-card p-7">
      <h2 className="text-xl font-bold">Vulnerability Breakdown</h2><p className="text-sm text-sc-muted">Aggregated from your saved scan history.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><V title="Critical" value={critical} cls="text-sc-critical"/><V title="High" value={high} cls="text-sc-high"/><V title="Medium" value={medium} cls="text-sc-medium"/><V title="Low" value={low} cls="text-sc-pass"/></div>
      <div className="mt-5"><div className="flex justify-between text-xs"><span>Resolution progress</span><span>{vulns ? Math.round(fixed/vulns*100):0}%</span></div><div className="mt-2 h-2 overflow-hidden rounded bg-sc-surface-2"><div className="h-full bg-sc-pass" style={{width:`${vulns ? Math.min(100,fixed/vulns*100):0}%`}}/></div></div>
    </section>
  </main></>
}
function Stat({title,value}:{title:string;value:string|number}){return <article className="rounded-xl border border-sc-border bg-sc-surface p-5"><p className="text-xs uppercase text-sc-muted">{title}</p><p className="mt-3 font-display text-3xl font-bold text-sc-pass">{value}</p></article>}
function V({title,value,cls}:{title:string;value:number;cls:string}){return <div className="sc-tile p-5"><p className={`text-sm font-semibold ${cls}`}>{title}</p><p className={`mt-2 font-display text-4xl font-bold ${cls}`}>{value}</p><p className="mt-1 text-xs text-sc-muted">Issues detected</p></div>}
