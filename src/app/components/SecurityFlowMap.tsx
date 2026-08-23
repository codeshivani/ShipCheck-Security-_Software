"use client";

import { useEffect, useMemo, useState } from "react";
import type { Finding, SecurityFlowNode, SecurityFlow } from "@/types/findings";
import type { AIExplanation } from "@/types/reports";

const TYPE_COLORS: Record<SecurityFlowNode["type"], string> = {
  entry: "#18876a", request: "#3569e8", transform: "#6d4bd8", decision: "#c58a00",
  sink: "#d92d20", resource: "#6b7785", secret: "#d92d20", file: "#64748b", unknown: "#94a3b8",
};

const FALLBACK_NODES: SecurityFlowNode[] = [
  { id: "entry", type: "entry", label: "Application entry" },
  { id: "request", type: "request", label: "Incoming request" },
  { id: "auth", type: "decision", label: "Authentication / validation" },
  { id: "logic", type: "transform", label: "Business logic" },
  { id: "resource", type: "resource", label: "Protected resource" },
  { id: "sink", type: "sink", label: "Sensitive operation" },
];

const FALLBACK_EDGES = FALLBACK_NODES.slice(0, -1).map((node, i) => ({
  id: `fallback-${i}`, from: node.id, to: FALLBACK_NODES[i + 1].id, label: i === 1 ? "user input" : "data flow",
}));

function genericErrorNode(finding: Finding) {
  if (finding.ruleId === "R1") return "auth";
  if (finding.ruleId === "R2") return "sink";
  if (finding.ruleId === "R3") return "auth";
  if (finding.ruleId === "R4") return "resource";
  if (finding.ruleId === "R5") return "sink";
  return "logic";
}

export function SecurityFlowMap({ findings, scanId }: { findings: Finding[]; scanId?: string }) {
  const candidates = findings.filter(f => f.status !== "suppressed");
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const [explanation, setExplanation] = useState<AIExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const selected = candidates.find(f => f.id === selectedId) ?? candidates[0] ?? null;

  const model = useMemo(() => {
    if (!selected) return null;
    const original = selected.securityFlow;
    if (original) {
      const vulnerableEdge = original.edges.find(e => e.id === original.vulnerableEdgeId || e.vulnerable || e.findingId === selected.id);
      const errorNode = vulnerableEdge?.to ?? original.nodes.find(n => n.file === selected.file && n.line === selected.line)?.id ?? original.nodes[original.nodes.length - 1]?.id;
      return { flow: original, errorNode };
    }
    const flow: SecurityFlow = {
      id: `fallback-${selected.id}`,
      title: `${selected.ruleId} security flow`,
      confidence: "partial",
      nodes: FALLBACK_NODES,
      edges: FALLBACK_EDGES.map(e => ({ ...e, vulnerable: e.to === genericErrorNode(selected), findingId: selected.id, ruleId: selected.ruleId })),
      vulnerableEdgeId: FALLBACK_EDGES.find(e => e.to === genericErrorNode(selected))?.id,
      fingerprint: "derived-from-finding",
    };
    return { flow, errorNode: genericErrorNode(selected) };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    if (!selected || !scanId) return;
    setLoading(true); setExplanation(null);
    fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId, findingId: selected.id }) })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Unable to explain finding"); return data.result as AIExplanation; })
      .then(result => { if (!cancelled) setExplanation(result); })
      .catch(() => { if (!cancelled) setExplanation(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id, scanId]);

  if (!selected || !model) {
    return <section className="sc-card p-7"><p className="text-sm font-semibold">Security flow report</p><p className="mt-2 text-sm text-sc-muted">No findings were produced. The scan contains no error node to report.</p></section>;
  }

  const { flow, errorNode } = model;
  const width = Math.max(1080, flow.nodes.length * 190);
  const nodeY = 90;
  const nodeW = 150;
  const nodeH = 96;

  return (
    <section className="sc-card overflow-hidden sc-fade-up">
      <div className="border-b border-sc-border bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-sc-accent"><span className="h-2 w-2 rounded-full bg-sc-accent" /> Report flow</div>
            <h2 className="mt-2 text-2xl font-bold">Where the security error occurs</h2>
            <p className="mt-1 text-sm text-sc-muted">The blinking red node is the evidence-linked vulnerability point. Select another finding to trace its path.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-[#fff4f2] px-3 py-2 text-xs font-semibold text-sc-critical"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sc-critical" /> Error node highlighted</div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {candidates.map(f => <button key={f.id} onClick={() => setSelectedId(f.id)} className={`min-w-max rounded-xl border px-3 py-2 text-left text-xs transition ${f.id === selected.id ? "border-sc-accent bg-[#edf2ff] text-sc-accent" : "border-sc-border bg-white text-sc-muted hover:bg-sc-surface-2"}`}><span className="font-bold">{f.ruleId}</span> · {f.issue}</button>)}
        </div>
      </div>

      <div className="overflow-x-auto bg-[#f8fafc] px-4 py-8">
        <svg viewBox={`0 0 ${width} 250`} className="mx-auto h-[250px] min-w-[1080px]" role="img" aria-label="Security error flow chart">
          <defs>
            <marker id="sc-arrow-light" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa5b1" /></marker>
          </defs>
          {flow.edges.map((edge, i) => {
            const from = flow.nodes.findIndex(n => n.id === edge.from);
            const to = flow.nodes.findIndex(n => n.id === edge.to);
            if (from < 0 || to < 0) return null;
            const x1 = 35 + from * 190 + nodeW;
            const x2 = 35 + to * 190;
            const y = nodeY + nodeH / 2;
            const bad = edge.id === flow.vulnerableEdgeId || edge.vulnerable || edge.findingId === selected.id;
            return <g key={edge.id}><line x1={x1} y1={y} x2={x2} y2={y} stroke={bad ? "#d92d20" : "#9aa5b1"} strokeWidth={bad ? 3 : 2} markerEnd="url(#sc-arrow-light)" className={bad ? "sc-flow-vulnerable" : ""} /><text x={(x1 + x2) / 2} y={y - 12} textAnchor="middle" fontSize="10" fill={bad ? "#d92d20" : "#7b8794"}>{edge.label ?? "data flow"}</text></g>;
          })}
          {flow.nodes.map((node, i) => {
            const x = 35 + i * 190;
            const bad = node.id === errorNode;
            const c = TYPE_COLORS[node.type] ?? TYPE_COLORS.unknown;
            return <g key={node.id} className={bad ? "sc-error-node" : ""}>
              {bad && <rect x={x - 5} y={nodeY - 5} width={nodeW + 10} height={nodeH + 10} rx="18" fill="none" stroke="#d92d20" strokeWidth="4" opacity=".35" className="sc-error-ring" />}
              <rect x={x} y={nodeY} width={nodeW} height={nodeH} rx="15" fill="#fff" stroke={bad ? "#d92d20" : "#dfe5ec"} strokeWidth={bad ? 3 : 1.5} />
              <circle cx={x + 18} cy={nodeY + 19} r="6" fill={c} />
              <text x={x + 31} y={nodeY + 22} fontSize="9" fontWeight="700" fill="#6b7785">{node.type.toUpperCase()}</text>
              <text x={x + 14} y={nodeY + 51} fontSize="12" fontWeight="700" fill="#17212b">{node.label.slice(0, 22)}</text>
              {node.file && <text x={x + 14} y={nodeY + 72} fontSize="9" fill="#6b7785">{`${node.file}:${node.line ?? "?"}`.slice(0, 22)}</text>}
              {bad && <text x={x + nodeW / 2} y={nodeY + 113} textAnchor="middle" fontSize="10" fontWeight="800" fill="#d92d20">ERROR HERE</text>}
            </g>;
          })}
        </svg>
      </div>

      <div className="grid border-t border-sc-border xl:grid-cols-[1.05fr_1fr]">
        <div className="p-6 xl:border-r">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.13em] text-sc-critical">Detected problem</p><h3 className="mt-2 text-xl font-bold">{selected.issue}</h3></div>
            <span className="rounded-lg bg-[#fff4f2] px-2.5 py-1 text-xs font-bold text-sc-critical">{selected.ruleId} · {selected.cwe}</span>
          </div>
          <p className="mt-2 text-xs text-sc-muted">Location: <span className="font-display text-sc-text">{selected.file}:{selected.line}</span></p>
          <div className="mt-5 rounded-xl border border-sc-border bg-[#f8fafc] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-sc-muted">Evidence</p>
            <ul className="mt-2 space-y-2 text-sm">{selected.evidence.map((e, i) => <li key={i} className="flex gap-2"><span className="text-sc-critical">•</span><span>{e}</span></li>)}</ul>
          </div>
        </div>
        <div className="p-6">
          {loading ? <div className="rounded-xl bg-[#f8fafc] p-5 text-sm text-sc-muted"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sc-accent" /> Building explanation and fix...</div> : explanation ? <div className="space-y-5">
            <div><p className="text-xs font-bold uppercase tracking-[.13em] text-sc-accent">Why the error occurs</p><p className="mt-2 text-sm leading-6 text-sc-text">{explanation.explanation}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[.13em] text-sc-high">Impact</p><p className="mt-2 text-sm leading-6 text-sc-text">{explanation.impact}</p></div>
            <div className="rounded-xl border border-[#bde4d7] bg-[#f0faf6] p-4"><p className="text-xs font-bold uppercase tracking-[.13em] text-sc-pass">Fix solution</p><p className="mt-2 text-sm leading-6 text-sc-text">{explanation.remediation}</p></div>
            {explanation.degraded && <p className="text-xs text-sc-muted">Using ShipCheck deterministic remediation guidance because AI explanation was unavailable.</p>}
          </div> : <div className="rounded-xl border border-sc-border bg-[#f8fafc] p-5 text-sm text-sc-muted">Explanation is unavailable right now. Open the finding for the full evidence and remediation workflow.</div>}
        </div>
      </div>
    </section>
  );
}
