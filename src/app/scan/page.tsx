"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Finding } from "@/types/findings";
import type { Grade, RescanComparison, ScanReport } from "@/types/reports";
import { FindingRow } from "../components/FindingRow";
import { FindingDetail } from "../components/FindingDetail";
import { AppNav } from "../components/AppNav";
import { saveScan } from "@/lib/clientStore";
import { SecurityFlowMap } from "../components/SecurityFlowMap";
import { saveBatchReport, type BatchReport } from "@/lib/batchStore";
import { ShareButton } from "../components/ShareButton";

type AppState = "input" | "scanning" | "results";
const SCAN_STEPS = ["Cloning public repository", "Reading supported source files", "Running deterministic rules", "Building project security flow", "Calculating risk score"];
const RULES = [
  { id: "R1", name: "Missing Endpoint Authorization", cwe: "CWE-862" },
  { id: "R2", name: "Hardcoded Secret or API Key", cwe: "CWE-798" },
  { id: "R3", name: "Unsafe JWT Handling", cwe: "CWE-347" },
  { id: "R4", name: "Potential IDOR", cwe: "CWE-639" },
  { id: "R5", name: "Untrusted Dynamic Execution", cwe: "CWE-95" },
  { id: "R6", name: "Potential SQL Injection", cwe: "CWE-89" },
  { id: "R7", name: "Potential Path Traversal", cwe: "CWE-22" },
  { id: "R8", name: "Potential SSRF", cwe: "CWE-918" },
] as const;

export default function ScanPage() {
  const [state, setState] = useState<AppState>("input");
  const [repoUrl, setRepoUrl] = useState("");
  const [scanStep, setScanStep] = useState(0);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [comparison, setComparison] = useState<RescanComparison | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialRepo = params.get("repo");
    const reportId = params.get("report");
    // URL and browser-storage state is hydrated only after client mount to avoid
    // server/client rendering different report content.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialRepo) setRepoUrl(initialRepo);
    if (reportId) {
      try {
        const cached = sessionStorage.getItem(`shipcheck_report_${reportId}`) ?? localStorage.getItem(`shipcheck_report_${reportId}`);
        if (cached) {
          const cachedReport = JSON.parse(cached) as ScanReport;
          setReport(cachedReport);
          setState("results");
        }
      } catch { /* ignore malformed cached reports */ }
    }
  }, []);

  async function handleScan(event: FormEvent) {
    event.preventDefault();
    if (!repoUrl.trim()) return;
    setError(null); setComparison(null); setSelected(null); setPendingIds(new Set()); setResolvedIds(new Set()); setState("scanning"); setScanStep(0);
    const timer = window.setInterval(() => setScanStep(v => Math.min(v + 1, SCAN_STEPS.length - 1)), 700);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Scan failed.");
      setReport(data.report);
      saveScan({ scanId: data.report.scanId, repoUrl: data.report.repoUrl, score: data.report.risk.score, grade: data.report.risk.grade, vulnerabilities: data.report.findings.length, critical: data.report.risk.counts.Critical, high: data.report.risk.counts.High, medium: data.report.risk.counts.Medium, fixed: 0, createdAt: data.report.createdAt });
      setState("results");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Scan failed."); setState("input"); }
    finally { window.clearInterval(timer); }
  }

  async function handleRescan() {
    if (!report) return;
    setRescanning(true); setError(null);
    try {
      const response = await fetch("/api/rescan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: report.scanId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Rescan failed.");
      setComparison(data.comparison); setReport(data.report);
      saveScan({ scanId: data.report.scanId, repoUrl: data.report.repoUrl, score: data.report.risk.score, grade: data.report.risk.grade, vulnerabilities: data.report.findings.length, critical: data.report.risk.counts.Critical, high: data.report.risk.counts.High, medium: data.report.risk.counts.Medium, fixed: data.comparison.resolved.length, createdAt: data.report.createdAt });
      setPendingIds(new Set()); setResolvedIds(new Set(data.comparison.resolved.map((finding: Finding) => finding.id)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rescan failed."); }
    finally { setRescanning(false); }
  }

  if (state === "input") return <ProfileScanner initialRepoUrl={repoUrl} error={error} onLegacyRepoScan={handleScan} />;
  if (state === "scanning") return <Scanning step={scanStep} />;
  if (!report) return null;

  const matches = report.findings.filter(f => f.status === "match");
  const reviews = report.findings.filter(f => f.status === "review");
  const total = matches.length + reviews.length;

  return <div className="min-h-screen bg-sc-bg text-sc-text"><AppNav />
    <div className="mx-auto flex max-w-[1500px]">
      <Sidebar onNewScan={() => setState("input")} />
      <main id="report" className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-9">
        <header className="mb-7 flex flex-col gap-5 border-b border-sc-border pb-6 xl:flex-row xl:items-center xl:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sc-muted">Repository</p><div className="mt-1 flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{displayRepo(report.repoUrl)}</h1><a href={report.repoUrl} target="_blank" rel="noreferrer" className="text-sc-muted hover:text-sc-accent">↗</a></div><p className="mt-2 text-xs text-sc-muted"><span className="font-semibold text-sc-pass">● Scan completed</span> · {new Date(report.createdAt).toLocaleString()}</p></div>
          <div className="flex gap-3"><ShareButton scanId={report.scanId} /><button onClick={handleRescan} disabled={rescanning} className="rounded-xl bg-[#172b4d] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#233d66] disabled:opacity-60">{rescanning ? "Rescanning…" : "↻ Rescan repository"}</button></div>
        </header>

        {error && <div className="mb-5 rounded-xl border border-[#f2c4c0] bg-[#fff4f2] px-4 py-3 text-sm text-sc-critical">{error}</div>}
        {comparison && <div className="mb-5 rounded-xl border border-[#bde4d7] bg-[#f0faf6] px-4 py-3 text-sm text-sc-pass">Rescan complete: {comparison.resolved.length} resolved, {comparison.remaining.length} remaining, {comparison.introduced.length} introduced. Score {comparison.before.score} → {comparison.after.score}.</div>}
        {report.warnings.length > 0 && <div className="mb-5 rounded-xl border border-[#ead8a6] bg-[#fffaf0] p-4 text-sm text-sc-high">{report.warnings.map(w => <p key={w}>{w}</p>)}</div>}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_1fr_1.3fr]">
          <ScoreCard score={report.risk.score} grade={report.risk.grade} />
          <FindingSummary report={report} total={total} />
          <ScanFacts report={report} />
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[.1em]">Security rules <span className="font-normal text-sc-muted">({report.rulesExecuted} / {report.rulesExpected} completed)</span></h2><span className="text-xs font-semibold text-sc-pass">✓ Deterministic rules completed</span></div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">{RULES.map(rule => <RuleCard key={rule.id} rule={rule} findings={report.findings.filter(f => f.ruleId === rule.id)} filesScanned={report.filesScanned} failed={report.warnings.some(w => w.startsWith(`Rule ${rule.id} failed`))} />)}</div>
        </section>

        <section className="mt-8 grid gap-4 xl:grid-cols-[1.1fr_1fr]"><ScoreBreakdown report={report} /><FindingsPanel findings={matches} reviews={reviews} pendingIds={pendingIds} resolvedIds={resolvedIds} onSelect={setSelected} /></section>
        <section id="flow" className="mt-8"><SecurityFlowMap findings={report.findings} scanId={report.scanId} /></section>
        <p className="mt-5 max-w-4xl text-xs leading-5 text-sc-muted">{report.risk.disclaimer}</p>
      </main>
    </div>
    {selected && <FindingDetail scanId={report.scanId} finding={selected} verificationPending={pendingIds.has(selected.id)} resolved={resolvedIds.has(selected.id)} onClose={() => setSelected(null)} onApplied={() => setPendingIds(previous => new Set(previous).add(selected.id))} />}
  </div>;
}

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
  fork?: boolean;
};

type BatchResult = { repo: GitHubRepository; report?: ScanReport; error?: string; status: "waiting" | "scanning" | "complete" | "error" };

function ProfileScanner({ initialRepoUrl, error: legacyError, onLegacyRepoScan }: { initialRepoUrl: string; error: string | null; onLegacyRepoScan: (e: FormEvent) => void }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(legacyError);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BatchResult[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initialRepoUrl) {
      const match = initialRepoUrl.match(/github\.com\/([^/]+)(?:\/([^/?#]+))?/i);
      if (match?.[1]) setUsername(match[1]);
    }
  }, [initialRepoUrl]);

  async function handleDirectUrlScan(event: FormEvent) {
    event.preventDefault();
    const url = directUrl.trim();
    if (!/^https:\/\/github\.com\/[^/]+\/[^/?#]+(?:\.git)?(?:[/?#].*)?$/i.test(url)) {
      setLookupError("Enter a valid public GitHub repository URL.");
      return;
    }
    setScanning(true);
    setLookupError(null);
    setResults([]);
    setDone(false);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Scan failed.");
      const report = data.report as ScanReport;
      saveScan({
        scanId: report.scanId,
        repoUrl: report.repoUrl,
        score: report.risk.score,
        grade: report.risk.grade,
        vulnerabilities: report.findings.length,
        critical: report.risk.counts.Critical,
        high: report.risk.counts.High,
        medium: report.risk.counts.Medium,
        fixed: 0,
        createdAt: report.createdAt,
      });
      try {
        sessionStorage.setItem(`shipcheck_report_${report.scanId}`, JSON.stringify(report));
      } catch {
        try { localStorage.setItem(`shipcheck_report_${report.scanId}`, JSON.stringify(report)); } catch {}
      }
      router.push(`/scan?report=${encodeURIComponent(report.scanId)}`);
    } catch (reason) {
      setLookupError(reason instanceof Error ? reason.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function findRepositories(event?: FormEvent) {
    event?.preventDefault();
    const clean = username.trim().replace(/^@/, "");
    if (!clean) { setLookupError("Enter a GitHub username first."); return; }
    setLoading(true); setLookupError(null); setRepositories([]); setSelected(new Set()); setResults([]); setDone(false);
    try {
      const response = await fetch(`/api/github/repos?username=${encodeURIComponent(clean)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to find repositories.");
      setRepositories(data.repositories ?? []);
      setSelected(new Set((data.repositories ?? []).slice(0, 1).map((repo: GitHubRepository) => repo.id)));
    } catch (reason) {
      setLookupError(reason instanceof Error ? reason.message : "Unable to find repositories.");
    } finally { setLoading(false); }
  }

  function toggle(id: number) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visible = filteredRepositories;
    const allSelected = visible.length > 0 && visible.every(repo => selected.has(repo.id));
    setSelected(previous => {
      const next = new Set(previous);
      visible.forEach(repo => allSelected ? next.delete(repo.id) : next.add(repo.id));
      return next;
    });
  }

  async function scanSelected() {
    const chosen = repositories.filter(repo => selected.has(repo.id));
    if (!chosen.length) return;
    setScanning(true);
    setDone(false);

    let finalResults: BatchResult[] = chosen.map(repo => ({ repo, status: "waiting" }));
    setResults(finalResults);

    for (const repo of chosen) {
      finalResults = finalResults.map(item => item.repo.id === repo.id ? { ...item, status: "scanning" } : item);
      setResults(finalResults);
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repoUrl: repo.html_url }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Scan failed.");

        const report = data.report as ScanReport;
        const serialized = JSON.stringify(report);
        try {
          sessionStorage.setItem(`shipcheck_report_${report.scanId}`, serialized);
        } catch {
          try { localStorage.setItem(`shipcheck_report_${report.scanId}`, serialized); } catch { /* optional cache */ }
        }
        saveScan({
          scanId: report.scanId,
          repoUrl: report.repoUrl,
          score: report.risk.score,
          grade: report.risk.grade,
          vulnerabilities: report.findings.length,
          critical: report.risk.counts.Critical,
          high: report.risk.counts.High,
          medium: report.risk.counts.Medium,
          fixed: 0,
          createdAt: report.createdAt,
        });
        finalResults = finalResults.map(item => item.repo.id === repo.id ? { ...item, report, status: "complete" } : item);
      } catch (reason) {
        finalResults = finalResults.map(item => item.repo.id === repo.id ? { ...item, status: "error", error: reason instanceof Error ? reason.message : "Scan failed." } : item);
      }
      setResults(finalResults);
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const batchItems = finalResults.map(item => ({
      repoId: item.repo.id,
      fullName: item.repo.full_name,
      htmlUrl: item.repo.html_url,
      status: item.report ? "complete" as const : "error" as const,
      report: item.report,
      error: item.error,
    }));
    let persistenceWarning: string | undefined;
    try {
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId, username: username.replace(/^@/, ""), items: batchItems }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save the batch report to your account.");
    } catch (reason) {
      persistenceWarning = reason instanceof Error
        ? `Saved in this browser only. ${reason.message}`
        : "Saved in this browser only. Unable to save the batch report to your account.";
    }

    const batch: BatchReport = {
      batchId,
      username: username.replace(/^@/, ""),
      createdAt: new Date().toISOString(),
      items: batchItems,
      persistenceWarning,
    };
    if (!saveBatchReport(batch)) {
      batch.persistenceWarning = [batch.persistenceWarning, "The report could not be saved in browser storage."]
        .filter(Boolean)
        .join(" ");
      setLookupError(batch.persistenceWarning);
    }
    setScanning(false);
    setDone(true);
    router.push(`/reports/batch?batch=${encodeURIComponent(batchId)}`);
  }

  const filteredRepositories = repositories.filter(repo => `${repo.name} ${repo.full_name} ${repo.description ?? ""} ${repo.language ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const selectedCount = selected.size;
  const completed = results.filter(item => item.status === "complete").length;
  const critical = results.reduce((sum, item) => sum + (item.report?.risk.counts.Critical ?? 0), 0);
  const high = results.reduce((sum, item) => sum + (item.report?.risk.counts.High ?? 0), 0);
  const medium = results.reduce((sum, item) => sum + (item.report?.risk.counts.Medium ?? 0), 0);

  return <main className="min-h-screen bg-sc-bg px-5 py-8 sm:px-8"><div className="mx-auto max-w-6xl">
    <Brand />
    <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.4fr]">
      <section className="sc-card p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sc-pass">New security scan</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Start a security scan</h1>
        <p className="mt-3 text-sm leading-6 text-sc-muted">Scan one public GitHub repository directly by URL, or discover a profile and scan multiple repositories in one flow.</p>
        <form onSubmit={handleDirectUrlScan} className="mt-7">
          <label htmlFor="github-repo-url" className="text-xs font-bold uppercase tracking-wide text-sc-muted">GitHub repository URL</label>
          <div className="mt-2 flex overflow-hidden rounded-xl border border-sc-border bg-white focus-within:border-sc-accent">
            <span className="grid w-12 place-items-center border-r border-sc-border text-sc-muted">↗</span>
            <input id="github-repo-url" value={directUrl} onChange={e=>setDirectUrl(e.target.value)} placeholder="https://github.com/owner/repository" className="min-w-0 flex-1 px-4 py-3 text-sm outline-none" />
          </div>
          {lookupError && <p className="mt-3 rounded-lg bg-[#fff4f2] px-3 py-2 text-sm text-sc-critical">{lookupError}</p>}
          <button disabled={loading || scanning} className="mt-4 w-full rounded-xl bg-[#172b4d] px-4 py-3 font-semibold text-white hover:bg-[#233d66] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Scanning repository…" : "Scan Repository"}</button>
        </form>
        <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-sc-muted"><span className="h-px flex-1 bg-sc-border"/><span>or scan a profile</span><span className="h-px flex-1 bg-sc-border"/></div>
        <form onSubmit={findRepositories}>
          <label htmlFor="github-profile" className="text-xs font-bold uppercase tracking-wide text-sc-muted">GitHub username</label>
          <div className="mt-2 flex overflow-hidden rounded-xl border border-sc-border bg-white focus-within:border-sc-accent">
            <span className="grid w-12 place-items-center border-r border-sc-border text-sc-muted">@</span>
            <input id="github-profile" value={username} onChange={e=>setUsername(e.target.value)} placeholder="auth0" className="min-w-0 flex-1 px-4 py-3 text-sm outline-none" />
          </div>
          {lookupError && <p className="mt-3 rounded-lg bg-[#fff4f2] px-3 py-2 text-sm text-sc-critical">{lookupError}</p>}
          <button disabled={loading || scanning} className="mt-4 w-full rounded-xl bg-[#172b4d] px-4 py-3 font-semibold text-white hover:bg-[#233d66] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Finding repositories…" : "Find Repositories"}</button>
        </form>
        <div className="mt-6 rounded-xl bg-sc-surface-2 p-4 text-xs leading-5 text-sc-muted"><strong className="text-sc-text">Public repositories only.</strong> ShipCheck reads source code for static analysis; it does not execute the repository.</div>
        {initialRepoUrl && <form onSubmit={onLegacyRepoScan} className="mt-6 border-t border-sc-border pt-5"><p className="text-xs text-sc-muted">Legacy repository URL</p><button className="mt-2 text-sm font-semibold text-sc-accent underline">Continue with {initialRepoUrl.replace("https://github.com/", "")}</button></form>}
      </section>

      <section className="sc-card min-h-[520px] p-6 sm:p-8">
        {!repositories.length ? <div className="grid min-h-[440px] place-items-center text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sc-surface-2 text-2xl">⌕</div><h2 className="mt-5 text-xl font-bold">Your repositories will appear here</h2><p className="mt-2 max-w-md text-sm leading-6 text-sc-muted">Enter a profile name on the left. You can then search, select multiple repositories, and start a batch security scan.</p></div></div> : <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sc-pass">GitHub profile</p><h2 className="mt-1 text-2xl font-bold">@{username.replace(/^@/, "")}</h2><p className="mt-1 text-sm text-sc-muted">{repositories.length} public repositories found</p></div><button type="button" onClick={scanSelected} disabled={!selectedCount || scanning} className="rounded-xl bg-sc-pass px-5 py-3 text-sm font-bold text-white shadow-sm hover:brightness-95 disabled:opacity-50">{scanning ? "Scanning selected…" : `Scan ${selectedCount} ${selectedCount === 1 ? "Repository" : "Repositories"}`}</button></div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search repositories…" className="min-w-0 flex-1 rounded-xl border border-sc-border bg-white px-4 py-3 text-sm outline-none focus:border-sc-accent"/><button type="button" onClick={toggleAll} disabled={!filteredRepositories.length || scanning} className="rounded-xl border border-sc-border bg-white px-4 py-3 text-sm font-semibold hover:bg-sc-surface-2">{filteredRepositories.length && filteredRepositories.every(repo=>selected.has(repo.id)) ? "Clear visible" : "Select visible"}</button></div>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">{filteredRepositories.map(repo => <label key={repo.id} className={`flex cursor-pointer gap-4 rounded-xl border p-4 transition ${selected.has(repo.id) ? "border-sc-accent/50 bg-[#f6f8ff]" : "border-sc-border bg-white hover:bg-sc-surface-2"}`}><input type="checkbox" checked={selected.has(repo.id)} onChange={()=>toggle(repo.id)} disabled={scanning} className="mt-1 h-4 w-4 accent-[#3569e8]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{repo.name}</span>{repo.language && <span className="rounded-full bg-sc-surface-2 px-2 py-1 text-[10px] font-semibold text-sc-muted">{repo.language}</span>}{repo.fork && <span className="rounded-full bg-sc-surface-2 px-2 py-1 text-[10px] text-sc-muted">Fork</span>}</div><p className="mt-1 line-clamp-1 text-xs text-sc-muted">{repo.description || "No description provided."}</p><p className="mt-2 text-[11px] text-sc-muted">★ {repo.stargazers_count} · Updated {new Date(repo.updated_at).toLocaleDateString()}</p></div></label>)}</div>
        </>}
      </section>
    </div>

    {(results.length > 0 || done) && <section className="mt-6 sc-card p-6 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sc-pass">Batch scan</p><h2 className="mt-1 text-2xl font-bold">Security results</h2><p className="mt-1 text-sm text-sc-muted">{completed} of {results.length} repositories scanned successfully.</p></div><div className="flex gap-5 text-sm"><span><b className="text-sc-critical">{critical}</b> Critical</span><span><b className="text-sc-high">{high}</b> High</span><span><b className="text-sc-medium">{medium}</b> Medium</span></div></div><div className="mt-5 space-y-3">{results.map(item => <div key={item.repo.id} className="rounded-xl border border-sc-border bg-white p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold">{item.repo.full_name}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === "complete" ? "bg-[#f0faf6] text-sc-pass" : item.status === "error" ? "bg-[#fff4f2] text-sc-critical" : "bg-sc-surface-2 text-sc-muted"}`}>{item.status === "scanning" ? "Scanning…" : item.status}</span></div>{item.report ? <p className="mt-1 text-xs text-sc-muted">Score <b className="text-sc-pass">{item.report.risk.score}/100</b> · {item.report.findings.length} findings · Grade {item.report.risk.grade}</p> : item.error ? <p className="mt-1 text-xs text-sc-critical">{item.error}</p> : <p className="mt-1 text-xs text-sc-muted">Waiting in scan queue</p>}</div>{item.report && <button type="button" onClick={()=>{
                const value = JSON.stringify(item.report);
                try { sessionStorage.setItem(`shipcheck_report_${item.report!.scanId}`, value); } catch { try { localStorage.setItem(`shipcheck_report_${item.report!.scanId}`, value); } catch {} }
                router.push(`/scan?report=${encodeURIComponent(item.report!.scanId)}`);
              }} className="rounded-lg border border-sc-border px-4 py-2 text-sm font-semibold hover:bg-sc-surface-2">View Report →</button>}</div>{item.status === "scanning" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sc-surface-2"><div className="h-full w-2/3 animate-pulse rounded-full bg-sc-accent"/></div>}</div>)}</div></section>}
  </div></main>;
}

function Scanning({ step }: { step:number }) { return <main className="flex min-h-screen items-center justify-center bg-sc-bg px-5"><div className="sc-card w-full max-w-md p-8"><Brand /><h1 className="mt-8 text-xl font-bold">Building security report</h1><div className="mt-6 space-y-4">{SCAN_STEPS.map((label,i)=><div key={label} className="flex items-center gap-3 text-sm"><span className={`grid h-7 w-7 place-items-center rounded-full border ${i<step?"border-sc-pass bg-[#f0faf6] text-sc-pass":i===step?"border-sc-accent bg-[#edf2ff] text-sc-accent":"border-sc-border text-sc-muted"}`}>{i<step?"✓":i+1}</span><span className={i<=step?"font-medium":"text-sc-muted"}>{label}{i===step?"…":""}</span></div>)}</div></div></main>; }
function Sidebar({onNewScan}:{onNewScan:()=>void}) { return <aside className="hidden w-[220px] shrink-0 border-r border-sc-border bg-white px-4 py-6 lg:block"><Brand compact /><nav className="mt-9 space-y-2 text-sm"><a className="block rounded-xl bg-[#edf2ff] px-4 py-3 font-semibold text-sc-accent" href="#report">▣ Dashboard</a><button onClick={onNewScan} className="block w-full rounded-xl px-4 py-3 text-left text-sc-muted hover:bg-sc-surface-2">⌕ New scan</button><a className="block rounded-xl px-4 py-3 text-sc-muted hover:bg-sc-surface-2" href="#findings">◫ Scan history</a><a className="block rounded-xl px-4 py-3 text-sc-muted hover:bg-sc-surface-2" href="#flow">▤ Reports</a></nav><div className="mt-[55vh] rounded-2xl bg-[#f7f9fc] p-4"><p className="font-bold">ShipCheck</p><p className="mt-1 text-xs leading-5 text-sc-muted">Evidence-backed security analysis and remediation.</p></div></aside>; }
function Brand({compact=false}:{compact?:boolean}) { return <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#172b4d] text-sm font-bold text-white">◆</span><div><p className="text-lg font-extrabold tracking-tight">SHIP <span className="text-sc-accent">CHECK</span></p>{!compact&&<p className="text-[10px] text-sc-muted">Secure code. Ship confidently.</p>}</div></div>; }
function ScoreCard({score,grade}:{score:number;grade:Grade}) { const color=gradeColor(grade); return <div className="sc-card p-6"><p className="text-xs font-bold uppercase tracking-[.12em] text-sc-muted">Security score</p><div className="mt-4 flex items-center justify-between gap-5"><div><p className="font-display text-5xl font-bold" style={{color}}>{score}<span className="ml-1 text-lg text-sc-muted">/100</span></p><p className="mt-3 text-sm font-semibold" style={{color}}>Grade {grade} · {gradeLabel(grade)}</p></div><div className="grid h-28 w-28 place-items-center rounded-full border-[9px] bg-white text-xl font-bold" style={{borderColor:color,color}}>{score}%</div></div></div>; }
function FindingSummary({report,total}:{report:ScanReport;total:number}) { return <div className="sc-card p-6"><div className="grid grid-cols-3 gap-4"><Metric label="Critical" value={report.risk.counts.Critical} color="var(--sc-critical)"/><Metric label="High" value={report.risk.counts.High} color="var(--sc-high)"/><Metric label="Medium" value={report.risk.counts.Medium} color="var(--sc-medium)"/></div><div className="mt-5 border-t border-sc-border pt-4"><p className="text-xs font-bold uppercase tracking-[.1em] text-sc-muted">Total findings</p><p className="mt-1 font-display text-3xl font-bold">{total}</p><p className="mt-1 text-xs text-sc-muted">{report.risk.reviewCount} marked for review</p></div></div>; }
function Metric({label,value,color}:{label:string;value:number;color:string}) { return <div><p className="font-display text-2xl font-bold" style={{color}}>{value}</p><p className="mt-1 text-xs font-semibold" style={{color}}>{label}</p></div>; }
function ScanFacts({report}:{report:ScanReport}) { return <div className="sc-card p-6"><div className="grid grid-cols-2 gap-5"><Fact label="Files scanned" value={report.filesScanned}/><Fact label="Rules executed" value={`${report.rulesExecuted} / ${report.rulesExpected}`}/><Fact label="Files skipped" value={report.filesSkipped}/><Fact label="Scan type" value="Static analysis"/></div>{report.ruleFailures>0&&<p className="mt-4 text-xs font-semibold text-sc-high">{report.ruleFailures} rule execution failed. Results may be incomplete.</p>}</div>; }
function Fact({label,value}:{label:string;value:string|number}) { return <div><p className="text-xs text-sc-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function RuleCard({rule,findings,filesScanned,failed}:{rule:(typeof RULES)[number];findings:Finding[];filesScanned:number;failed:boolean}) { const matches=findings.filter(f=>f.status==="match").length; const review=findings.filter(f=>f.status==="review").length; const passed=matches===0&&!failed; return <div className="sc-card p-5"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#b8c6e8] bg-[#f5f7ff] text-sm font-bold text-sc-accent">{rule.id}</span><div><h3 className="text-sm font-bold leading-5">{rule.name}</h3><p className="mt-1 text-xs text-sc-muted">{rule.cwe}</p></div></div><div className="mt-5 flex items-end justify-between"><div><p className="text-xs text-sc-muted">Files reviewed</p><p className="font-display text-lg">{filesScanned}</p></div><div className="text-right"><p className="text-xs text-sc-muted">Issues</p><p className="font-display text-lg">{findings.length}</p></div></div><div className={`mt-4 rounded-xl px-3 py-2 text-center text-xs font-bold ${passed?"bg-[#f0faf6] text-sc-pass":"bg-[#fff4f2] text-sc-critical"}`}>{failed?"⚠ Incomplete":passed?"✓ Passed":`${matches} match${matches===1?"":"es"}${review?` · ${review} review`:""}`}</div></div>; }
function ScoreBreakdown({report}:{report:ScanReport}) { const deductions=100-report.risk.score; return <div className="sc-card p-6"><h2 className="text-sm font-bold uppercase tracking-[.1em]">Score breakdown</h2><div className="mt-5 grid grid-cols-[112px_1fr] gap-5"><div className="grid aspect-square place-items-center rounded-full border-[9px] border-sc-pass font-display text-3xl font-bold text-sc-pass">{report.risk.score}</div><dl className="space-y-2 text-sm"><ScoreLine label="Starting score" value="100"/><ScoreLine label="Critical deductions" value={report.risk.counts.Critical*22}/><ScoreLine label="High deductions" value={report.risk.counts.High*12}/><ScoreLine label="Medium deductions" value={report.risk.counts.Medium*5}/><div className="mt-2 border-t border-sc-border pt-2"><ScoreLine label="Final score" value={report.risk.score} strong/></div></dl></div><p className="mt-5 rounded-xl bg-[#f0faf6] px-4 py-3 text-xs font-medium text-sc-pass">{deductions===0?"No score deductions from supported high-confidence rules.":`${deductions} points deducted from supported high-confidence findings.`}</p></div>; }
function ScoreLine({label,value,strong=false}:{label:string;value:string|number;strong?:boolean}) { return <div className={`flex justify-between ${strong?"font-bold text-sc-pass":"text-sc-muted"}`}><dt>{label}</dt><dd className="font-display text-sc-text">{value}</dd></div>; }
function FindingsPanel({findings,reviews,pendingIds,resolvedIds,onSelect}:{findings:Finding[];reviews:Finding[];pendingIds:Set<string>;resolvedIds:Set<string>;onSelect:(f:Finding)=>void}) { return <div id="findings" className="sc-card p-6"><h2 className="text-sm font-bold uppercase tracking-[.1em]">Findings <span className="font-normal text-sc-muted">({findings.length})</span></h2>{findings.length===0?<p className="mt-5 rounded-xl bg-[#f0faf6] p-4 text-sm font-medium text-sc-pass">No supported high-confidence rule matches found.</p>:<div className="mt-4 space-y-2">{findings.map(f=><FindingRow key={f.id} finding={f} verificationPending={pendingIds.has(f.id)} resolved={resolvedIds.has(f.id)} onSelect={()=>onSelect(f)}/>)}</div>}{reviews.length>0&&<div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-sc-muted">Review recommended ({reviews.length})</p><div className="mt-2 space-y-2">{reviews.map(f=><FindingRow key={f.id} finding={f} onSelect={()=>onSelect(f)}/>)}</div></div>}</div>; }
function gradeLabel(g:Grade){return ({A:"Excellent",B:"Good",C:"Needs attention",D:"High risk",F:"Critical risk"})[g];}
function gradeColor(g:Grade){return g==="A"||g==="B"?"var(--sc-pass)":g==="C"?"var(--sc-medium)":g==="D"?"var(--sc-high)":"var(--sc-critical)";}
function displayRepo(url:string){return url.replace(/^https:\/\/github\.com\//,"").replace(/\.git$/,"");}
