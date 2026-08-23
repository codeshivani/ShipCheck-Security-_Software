import { notFound } from "next/navigation";
import { getShare } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getShare(token);
  if (!shared) notFound();
  const report = shared.report;
  return (
    <main className="min-h-screen bg-sc-bg px-5 py-10 text-sc-text sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sc-pass">ShipCheck shared report</p>
        <h1 className="mt-2 text-3xl font-bold">{report.repoUrl.replace("https://github.com/", "")}</h1>
        <p className="mt-2 text-sm text-sc-muted">Read-only report · generated {new Date(report.createdAt).toLocaleString()}</p>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Score" value={`${report.risk.score}/100`} />
          <Stat label="Grade" value={report.risk.grade} />
          <Stat label="Findings" value={report.findings.length} />
        </section>
        <section className="mt-6 rounded-2xl border border-sc-border bg-white p-6">
          <h2 className="text-xl font-bold">Findings</h2>
          <div className="mt-5 space-y-3">
            {report.findings.length ? report.findings.map(f => (
              <article key={f.id} className="rounded-xl border border-sc-border p-4">
                <div className="flex flex-wrap items-center gap-2"><strong>{f.ruleId} · {f.ruleName}</strong><span className="text-xs text-sc-muted">{f.severity} · {f.cwe} · {f.confidence}</span></div>
                <p className="mt-2 text-sm text-sc-muted">{f.issue}</p>
                <p className="mt-2 text-xs">{f.file}:{f.line}</p>
              </article>
            )) : <p className="text-sm text-sc-muted">No findings.</p>}
          </div>
        </section>
        <p className="mt-5 text-xs text-sc-muted">Static-analysis report only. ShipCheck does not execute the scanned repository.</p>
      </div>
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-sc-border bg-white p-5"><p className="text-xs uppercase text-sc-muted">{label}</p><p className="mt-2 text-3xl font-bold text-sc-pass">{value}</p></div>; }
