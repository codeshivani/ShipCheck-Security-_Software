"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/app/components/AppNav";
import { getRepositories, getStoredScans, getUser, type StoredScan } from "@/lib/clientStore";

export default function DashboardPage() {
  const [user, setUser] = useState<{ username: string; email: string; github: string } | null>(null);
  const [scans, setScans] = useState<StoredScan[]>([]);
  const [repos, setRepos] = useState<string[]>([]);

  useEffect(() => {
    setUser(getUser());
    setScans(getStoredScans());
    setRepos(getRepositories());
  }, []);

  const average = useMemo(() => scans.length ? Math.round(scans.reduce((sum, scan) => sum + scan.score, 0) / scans.length) : 0, [scans]);
  const vulnerabilities = useMemo(() => scans.reduce((sum, scan) => sum + scan.vulnerabilities, 0), [scans]);
  const fixed = useMemo(() => scans.reduce((sum, scan) => sum + scan.fixed, 0), [scans]);
  const latest = scans[0];

  return (
    <>
      <AppNav />
      <main className="mx-auto w-[94%] max-w-[1480px] py-6 sm:py-8 lg:ml-[260px]">
        <section className="sc-card p-7 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm text-sc-pass">SHIPCHECK SECURITY CENTER</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Welcome back{user?.username ? `, ${user.username}` : ""}.</h1>
              <p className="mt-3 max-w-2xl text-sc-muted">Scan public GitHub repositories, review security findings, and verify fixes with a real rescan.</p>
            </div>
            <Link href="/scan" className="rounded-xl bg-[#172b4d] px-6 py-3 text-center font-semibold text-white hover:brightness-110">Start New Security Scan</Link>
          </div>
        </section>

        <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon="◉" title="Security Score" value={`${average}/100`} />
          <Stat icon="⌁" title="Total Scans" value={scans.length} />
          <Stat icon="!" title="Vulnerabilities" value={vulnerabilities} danger={vulnerabilities>0} />
          <Stat icon="✓" title="Verified Fixes" value={fixed} />
        </section>

        <section className="mt-7 grid gap-7 xl:grid-cols-[1.05fr_1fr]">
          <div className="sc-card p-7">
            <div className="flex items-center justify-between gap-4">
              <div><h2 className="text-xl font-bold">Recent Scan</h2><p className="text-sm text-sc-muted">Your latest repository security result.</p></div>
              <Link href="/profile" className="text-sm text-sc-pass hover:underline">View profile →</Link>
            </div>
            {latest ? (
              <div className="mt-5 rounded-xl border border-sc-border bg-white p-5">
                <p className="font-semibold">{latest.repoUrl.replace("https://github.com/", "").replace(/\.git$/, "")}</p>
                <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <Mini label="Score" value={`${latest.score}/100`} />
                  <Mini label="Grade" value={latest.grade} />
                  <Mini label="Issues" value={latest.vulnerabilities} />
                  <Mini label="Critical" value={latest.critical} />
                </div>
                <Link href={`/scan?repo=${encodeURIComponent(latest.repoUrl)}`} className="mt-5 inline-block rounded-lg border border-sc-pass/40 px-4 py-2 text-sm text-sc-pass hover:bg-sc-pass/10">Scan Again</Link>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-sc-border p-8 text-center">
                <p className="font-semibold">No scans yet</p>
                <p className="mt-2 text-sm text-sc-muted">Run your first repository scan to populate your security dashboard.</p>
                <Link href="/scan" className="mt-5 inline-block rounded-lg bg-[#172b4d] px-4 py-2 text-sm font-semibold text-white">Start First Scan</Link>
              </div>
            )}
          </div>

          <div className="sc-card p-7">
            <h2 className="text-xl font-bold">Saved Repositories</h2>
            <p className="text-sm text-sc-muted">Repositories you've scanned before.</p>
            <div className="mt-5 space-y-3">
              {repos.length ? repos.slice(0, 5).map(url => (
                <Link key={url} href={`/scan?repo=${encodeURIComponent(url)}`} className="block rounded-xl border border-sc-border bg-white p-4 hover:border-sc-pass/40">
                  <p className="font-medium">{url.replace("https://github.com/", "").replace(/\.git$/, "")}</p>
                  <p className="mt-1 text-xs text-sc-muted">Click to scan again →</p>
                </Link>
              )) : <p className="rounded-xl border border-sc-border p-5 text-sm text-sc-muted">No repositories saved yet.</p>}
            </div>
          </div>
        </section>

        <section className="mt-7 sc-card p-7">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Security Activity</h2><p className="text-sm text-sc-muted">Latest scan history and scores.</p></div><Link href="/profile" className="text-sm text-sc-pass">Full history →</Link></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-sc-muted"><tr><th className="p-3">Repository</th><th className="p-3">Score</th><th className="p-3">Grade</th><th className="p-3">Issues</th><th className="p-3">Date</th></tr></thead><tbody>{scans.slice(0, 5).map(scan => <tr key={scan.scanId} className="border-t border-sc-border"><td className="p-3">{scan.repoUrl.replace("https://github.com/", "").replace(/\.git$/, "")}</td><td className="p-3 font-bold text-sc-pass">{scan.score}/100</td><td className="p-3">{scan.grade}</td><td className="p-3">{scan.vulnerabilities}</td><td className="p-3 text-sc-muted">{new Date(scan.createdAt).toLocaleString()}</td></tr>)}{!scans.length && <tr><td colSpan={5} className="p-8 text-center text-sc-muted">No scan activity yet.</td></tr>}</tbody></table></div>
        </section>
      </main>
    </>
  );
}

function Stat({ title, value, icon, danger=false }: { title: string; value: string | number; icon: string; danger?: boolean }) { return <article className="sc-tile p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-sc-muted">{title}</p><p className={`mt-4 font-display text-3xl font-bold ${danger ? "text-sc-critical" : "text-sc-pass"}`}>{value}</p></div><span className={`sc-tile-icon text-lg font-bold ${danger ? "text-sc-critical bg-[#fff5f3]" : "text-sc-pass"}`}>{icon}</span></div></article>; }
function Mini({ label, value }: { label: string; value: string | number }) { return <div><p className="text-xs text-sc-muted">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>; }
