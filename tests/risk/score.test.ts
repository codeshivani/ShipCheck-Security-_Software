import { describe, it, expect } from "vitest";
import { computeRiskReport } from "@/risk/score";
import { Finding } from "@/types/findings";

function mkFinding(overrides: Partial<Finding>): Finding {
  return {
    id: Math.random().toString(36),
    file: "src/a.ts",
    line: 1,
    ruleId: "R1",
    ruleName: "Missing Endpoint Authorization",
    severity: "Critical",
    cwe: "CWE-862",
    status: "match",
    confidence: "high",
    evidence: ["evidence"],
    issue: "issue",
    ...overrides,
  };
}

describe("computeRiskReport", () => {
  it("returns 100/A for no findings", () => {
    const r = computeRiskReport([]);
    expect(r.score).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("subtracts weights per severity for score-bearing findings", () => {
    const findings = [
      mkFinding({ severity: "Critical" }),
      mkFinding({ severity: "High", ruleId: "R4", cwe: "CWE-639" }),
      mkFinding({ severity: "Medium", ruleId: "R2", cwe: "CWE-798" }),
    ];
    const r = computeRiskReport(findings);
    // 100 - 22 - 12 - 5 = 61
    expect(r.score).toBe(61);
    expect(r.grade).toBe("C");
  });

  it("does not let review-status findings affect the score", () => {
    const findings = [mkFinding({ status: "review", confidence: "medium" })];
    const r = computeRiskReport(findings);
    expect(r.score).toBe(100);
    expect(r.reviewCount).toBe(1);
  });

  it("does not let suppressed findings affect the score", () => {
    const findings = [mkFinding({ status: "suppressed" })];
    const r = computeRiskReport(findings);
    expect(r.score).toBe(100);
  });

  it("clamps score at 0", () => {
    const findings = Array.from({ length: 10 }, () => mkFinding({ severity: "Critical" }));
    const r = computeRiskReport(findings);
    expect(r.score).toBe(0);
    expect(r.grade).toBe("F");
  });
});
