import { SecurityFlowMap } from "../components/SecurityFlowMap";
import { buildSecurityFlow } from "@/scanner/analysis/security-flow";
import { parseSource } from "@/scanner/parser/parse";
import { makeFinding } from "@/scanner/findings/factory";
import type { Finding } from "@/types/findings";

const fixtures: Array<{ name: string; file: string; source: string; ruleId: "R4"|"R5"|"R3"; line: number }> = [
  {
    name: "Orders IDOR",
    file: "routes/orders.ts",
    ruleId: "R4",
    line: 1,
    source: `router.get("/orders/:id", (req, res) => {
  const order = Order.findById(req.params.id);
  res.json(order);
});`,
  },
  {
    name: "Document IDOR",
    file: "routes/documents.ts",
    ruleId: "R4",
    line: 1,
    source: `router.get("/documents/:documentId", (req, res) => {
  const document = Document.findOne(req.params.documentId);
  res.json(document);
});`,
  },
  {
    name: "Command execution",
    file: "routes/run.ts",
    ruleId: "R5",
    line: 2,
    source: `router.post("/run", (req, res) => {
  exec(req.body.command);
});`,
  },
  {
    name: "Unverified JWT",
    file: "routes/admin.ts",
    ruleId: "R3",
    line: 2,
    source: `function admin(req, res) {
  const payload = jwt.decode(req.headers.authorization);
  if (payload.role === "admin") res.json({ ok: true });
}`,
  },
];

function fixtureFinding(item: typeof fixtures[number]): Finding {
  const meta = {
    R3: ["Unsafe JWT Handling", "CWE-347", "High"],
    R4: ["Potential IDOR", "CWE-639", "High"],
    R5: ["Untrusted Dynamic Execution", "CWE-95", "Critical"],
  } as const;
  const [ruleName, cwe, severity] = meta[item.ruleId];
  const parsed = parseSource(item.file, item.source);
  const finding = makeFinding({
    file: item.file,
    line: item.line,
    ruleId: item.ruleId,
    ruleName,
    severity,
    cwe,
    status: "match",
    confidence: "high",
    evidence: ["Flow Lab fixture evidence"],
    issue: ruleName,
    source: item.source,
  });
  finding.securityFlow = buildSecurityFlow(finding, parsed);
  return finding;
}

export default function FlowLabPage() {
  const findings = fixtures.map(fixtureFinding);

  return (
    <main className="min-h-screen bg-sc-bg px-5 py-8 text-sc-text">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6">
          <p className="font-display text-xs uppercase tracking-wider text-sc-pass">Development verification</p>
          <h1 className="mt-2 text-3xl font-bold">ShipCheck Flow Lab</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-sc-muted">
            These fixtures deliberately use different routes, identifiers, resources, and sinks. The graph fingerprint
            should change because the evidence changes — not because the UI randomizes the graph.
          </p>
        </div>
        <SecurityFlowMap findings={findings} />
      </div>
    </main>
  );
}
