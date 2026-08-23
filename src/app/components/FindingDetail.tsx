"use client";

import { useState } from "react";
import { Finding } from "@/types/findings";
import { AIExplanation } from "@/types/reports";
import { SeverityBadge, StatusBadge, ConfidenceBadge } from "./Badges";
import { DiffView } from "./DiffView";

interface FindingDetailProps {
  scanId: string;
  finding: Finding;
  onClose: () => void;
  onApplied: () => void;
  verificationPending?: boolean;
  resolved?: boolean;
}

type Phase = "evidence" | "explaining" | "explained" | "applying" | "applied";

export function FindingDetail({ scanId, finding, onClose, onApplied, verificationPending, resolved }: FindingDetailProps) {
  const [phase, setPhase] = useState<Phase>("evidence");
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExplain() {
    setPhase("explaining");
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId, findingId: finding.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to explain finding.");
      setExplanation(data.result);
      setPhase("explained");
    } catch (err) {
      setError((err as Error).message);
      setPhase("evidence");
    }
  }

  async function handleApply() {
    if (!explanation?.patch) return;
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch("/api/patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scanId, findingId: finding.id, diff: explanation.patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply patch.");
      setPhase("applied");
      onApplied();
    } catch (err) {
      setError((err as Error).message);
      setPhase("explained");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-sc-bg border-l border-sc-border overflow-y-auto sc-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-sc-bg/95 backdrop-blur border-b border-sc-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-display text-xs text-sc-muted">{finding.ruleId}</span>
              <SeverityBadge severity={finding.severity} />
              <StatusBadge status={finding.status} />
              <ConfidenceBadge confidence={finding.confidence} />
              {resolved && (
                <span className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase text-sc-pass border-sc-pass">
                  Resolved
                </span>
              )}
              {verificationPending && !resolved && (
                <span className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase text-sc-medium border-sc-medium">
                  Verification pending
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold">{finding.issue}</h2>
            <p className="font-display text-xs text-sc-muted mt-1">
              {finding.file}:{finding.line} · {finding.cwe}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sc-muted hover:text-sc-text px-2 py-1 rounded sc-focus"
            aria-label="Close finding detail"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-6">
          {/* Evidence */}
          <section>
            <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">
              What did the scanner see?
            </h3>
            <ul className="flex flex-col gap-1.5">
              {finding.evidence.map((e, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-sc-accent">›</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </section>

          {finding.snippet && (
            <section>
              <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">Source</h3>
              <pre className="font-display text-xs leading-relaxed rounded-lg border border-sc-border bg-sc-surface overflow-x-auto p-4 whitespace-pre">
                {finding.snippet}
              </pre>
            </section>
          )}

          {/* AI Explanation trigger / result */}
          {phase === "evidence" && (
            <button
              onClick={handleExplain}
              className="self-start rounded-lg bg-sc-accent hover:bg-sc-accent-dim transition-colors text-white text-sm font-medium px-4 py-2 sc-focus"
            >
              Explain this finding
            </button>
          )}

          {phase === "explaining" && (
            <div className="text-sm text-sc-muted font-display flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-sc-accent animate-pulse" />
              Asking ShipCheck AI for an explanation…
            </div>
          )}

          {error && (
            <div className="text-sm text-sc-critical border border-sc-critical/40 bg-sc-critical/10 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {explanation && (phase === "explained" || phase === "applying" || phase === "applied") && (
            <>
              {explanation.degraded && (
                <div className="text-xs text-sc-medium border border-sc-medium/40 bg-sc-medium/10 rounded-lg px-3 py-2 font-display">
                  AI explanation unavailable — showing deterministic remediation guidance instead.
                </div>
              )}

              <section>
                <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">Why this matters</h3>
                <p className="text-sm leading-relaxed">{explanation.explanation}</p>
              </section>

              <section>
                <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">Potential impact</h3>
                <p className="text-sm leading-relaxed">{explanation.impact}</p>
              </section>

              <section>
                <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">
                  Recommended remediation
                </h3>
                <p className="text-sm leading-relaxed">{explanation.remediation}</p>
              </section>

              {explanation.patch && (
                <section>
                  <h3 className="font-display text-xs uppercase tracking-wider text-sc-muted mb-2">Patch</h3>
                  <DiffView diff={explanation.patch} />

                  {phase === "explained" && (
                    <button
                      onClick={handleApply}
                      className="mt-3 rounded-lg bg-sc-pass hover:opacity-90 transition-opacity text-sc-bg text-sm font-semibold px-4 py-2 sc-focus"
                    >
                      Apply fix locally
                    </button>
                  )}
                  {phase === "applying" && (
                    <div className="mt-3 text-sm text-sc-muted font-display">Applying patch…</div>
                  )}
                  {phase === "applied" && (
                    <div className="mt-3 text-sm text-sc-pass font-display">
                      ✓ Patch applied locally. Rescan to verify the fix.
                    </div>
                  )}
                </section>
              )}

              {!explanation.patch && phase !== "applying" && (
                <div className="text-xs text-sc-muted font-display">
                  No automatic patch was generated for this finding — apply the remediation guidance manually, then
                  rescan.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
