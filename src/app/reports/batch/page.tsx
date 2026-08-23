"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/app/components/AppNav";
import { getBatchReport, type BatchReport } from "@/lib/batchStore";
import { countFindingsBySeverity } from "@/types/findings";

export default function BatchReportPage() {
  const [batch, setBatch] = useState<BatchReport | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("batch");
    if (id) setBatch(getBatchReport(id));
  }, []);

  const complete = useMemo(() => batch?.items.filter(item => item.status === "complete") ?? [], [batch]);
  const failed = useMemo(() => batch?.items.filter(item => item.status === "error") ?? [], [batch]);
  const score = complete.length ? Math.round(complete.reduce((sum, item) => sum + (item.report?.risk.score ?? 0), 0) / complete.length) : 0;
  const critical = complete.reduce((sum, item) => sum + (item.report ? countFindingsBySeverity(item.report.findings).Critical : 0), 0);
  const high = complete.reduce((sum, item) => sum + (item.report ? countFindingsBySeverity(item.report.findings).High : 0), 0);
  const medium = complete.reduce((sum, item) => sum + (item.report ? countFindingsBySeverity(item.report.findings).Medium : 0), 0);
  const findings = complete.reduce((sum, item) => sum + (item.report?.findings.length ?? 0), 0);
  const review = complete.reduce((sum, item) => sum + (item.report?.risk.reviewCount ?? 0), 0);

  if (!batch) return <><AppNav /><main className="mx-auto w-[94%] max-w-5xl py-16"><div className="sc-card p-10 text-center"><h1 className="text-2xl font-bold">Batch report unavailable</h1><p className="mt-2 text-sm text-sc-muted">The report data is no longer available in this browser session.</p><Link href="/scan" className="mt-6 inline-block rounded-xl bg-[#172b4d] px-5 py-3 font-semibold text-white">Start a New Scan</Link></div></main></>;

  return <><AppNav /><main className="mx-auto w-[94%] max-w-6xl py-6 sm:py-8 lg:ml-[260px]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-sc-pass">Batch security report</p><h1 className="mt-2 text-3xl font-bold">GitHub profile: @{batch.username}</h1><p className="mt-2 text-sm text-sc-muted">Generated {new Date(batch.createdAt).toLocaleString()}</p></div>
      <Link href="/scan" className="rounded-xl border border-sc-border bg-white px-5 py-3 text-sm font-semibold hover:bg-sc-surface-2">← Scan more repositories</Link>
    </div>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Repositories" value={batch.items.length} />
      <Stat label="Completed" value={complete.length} />
      <Stat label="Avg. score" value={`${score}/100`} pass />
      <Stat label="Findings" value={findings} critical={findings > 0} />
      <Stat label="Critical detected" value={critical} critical={critical > 0} />
      <Stat label="Review only" value={review} />
    </section>

    <section className="mt-6 sc-card overflow-hidden">
      <div className="border-b border-sc-border p-6"><h2 className="text-xl font-bold">Repository reports</h2><p className="mt-1 text-sm text-sc-muted">Open the full security report for any scanned repository.</p></div>
      <div className="divide-y divide-sc-border">
        {batch.items.map(item => <article key={item.repoId} className="sc-tile m-3 p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><a href={item.htmlUrl} target="_blank" rel="noreferrer" className="font-bold hover:text-sc-accent">{item.fullName} ↗</a><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.status === "complete" ? "bg-[#f0faf6] text-sc-pass" : "bg-[#fff4f2] text-sc-critical"}`}>{item.status}</span></div>{item.report ? <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>Score <b className="text-sc-pass">{item.report.risk.score}/100</b></span><span>Grade <b>{item.report.risk.grade}</b></span><span>Findings <b>{item.report.findings.length}</b></span><span className="text-sc-muted">{item.report.risk.reviewCount} review only</span><span>Critical detected <b className={countFindingsBySeverity(item.report.findings).Critical ? "text-sc-critical" : ""}>{countFindingsBySeverity(item.report.findings).Critical}</b></span><span>High detected <b className={countFindingsBySeverity(item.report.findings).High ? "text-sc-high" : ""}>{countFindingsBySeverity(item.report.findings).High}</b></span><span>Medium detected <b>{countFindingsBySeverity(item.report.findings).Medium}</b></span></div> : <p className="mt-2 text-sm text-sc-critical">{item.error ?? "Scan failed."}</p>}</div>{item.report && <Link href={`/scan?report=${encodeURIComponent(item.report.scanId)}`} className="shrink-0 rounded-xl bg-[#172b4d] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#233d66]">View Full Report →</Link>}</div></article>)}
      </div>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-3">
      <Stat label="High" value={high} critical={high > 0} />
      <Stat label="Medium" value={medium} />
      <Stat label="Failed scans" value={failed.length} critical={failed.length > 0} />
    </section>
  </main></>;
}

function Stat({label,value,pass,critical}:{label:string;value:string|number;pass?:boolean;critical?:boolean}) { return <article className="sc-card p-6"><p className="text-xs font-bold uppercase tracking-wide text-sc-muted">{label}</p><p className={`mt-2 text-3xl font-bold ${critical ? "text-sc-critical" : pass ? "text-sc-pass" : "text-sc-text"}`}>{value}</p></article>; }
