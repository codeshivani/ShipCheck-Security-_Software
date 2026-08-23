import { describe, expect, it } from "vitest";
import { parseSource } from "@/scanner/parser/parse";
import { buildSecurityFlow } from "@/scanner/analysis/security-flow";
import { makeFinding } from "@/scanner/findings/factory";

function finding(ruleId: "R1"|"R2"|"R3"|"R4"|"R5", line: number, source: string) {
  const defs = {
    R1: ["Missing Endpoint Authorization", "CWE-862", "Critical"],
    R2: ["Hardcoded Secret", "CWE-798", "Critical"],
    R3: ["Unsafe JWT Handling", "CWE-347", "High"],
    R4: ["Potential IDOR", "CWE-639", "High"],
    R5: ["Untrusted Dynamic Execution", "CWE-95", "Critical"],
  } as const;
  const [ruleName, cwe, severity] = defs[ruleId];
  return makeFinding({
    file: "src/app.ts",
    line,
    ruleId,
    ruleName,
    severity,
    cwe,
    status: "match",
    confidence: "high",
    evidence: ["test evidence"],
    issue: ruleName,
    source,
  });
}

describe("project-specific security flows", () => {
  it("creates a deterministic flow with a vulnerable edge for R4", () => {
    const source = `router.get("/orders/:id", (req, res) => {
  const order = Order.findById(req.params.id);
  res.json(order);
});`;
    const f = finding("R4", 1, source);
    const flow = buildSecurityFlow(f, parseSource("src/app.ts", source));
    expect(flow.nodes.length).toBeGreaterThanOrEqual(3);
    expect(flow.edges.some(e => e.vulnerable)).toBe(true);
    expect(flow.vulnerableEdgeId).toBeTruthy();
    expect(flow.fingerprint).toHaveLength(16);
  });

  it("produces structurally different fingerprints for different project flows", () => {
    const a = `router.get("/orders/:id", (req, res) => {
  const order = Order.findById(req.params.id);
  res.json(order);
});`;
    const b = `router.get("/documents/:documentId", (req, res) => {
  const doc = Document.findOne(req.params.documentId);
  res.json(doc);
});`;
    const fa = finding("R4", 1, a);
    const fb = finding("R4", 1, b);
    const ga = buildSecurityFlow(fa, parseSource("src/orders.ts", a));
    const gb = buildSecurityFlow(fb, parseSource("src/documents.ts", b));
    expect(ga.fingerprint).not.toBe(gb.fingerprint);
  });

  it("never places the raw secret into the R2 flow", () => {
    const knownSecret = ["sk-", "abcdefghij1234567890XY"].join("");
    const source = `export const key = "${knownSecret}";`;
    const f = finding("R2", 1, source);
    const flow = buildSecurityFlow(f, parseSource("src/config.ts", source));
    expect(JSON.stringify(flow)).not.toContain(knownSecret);
    expect(flow.nodes.some(n => n.label.includes("Redacted"))).toBe(true);
  });
});
