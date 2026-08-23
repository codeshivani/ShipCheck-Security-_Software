import { describe, it, expect } from "vitest";
import { compareScans } from "@/rescan/compare";
import { ScanReport } from "@/types/reports";
import { Finding } from "@/types/findings";
import { computeRiskReport } from "@/risk/score";

function mkFinding(id: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id,
    file: "src/a.ts",
    line: 1,
    ruleId: "R1",
    ruleName: "Missing Endpoint Authorization",
    severity: "Critical",
    cwe: "CWE-862",
    status: "match",
    confidence: "high",
    evidence: ["e"],
    issue: "issue",
    ...overrides,
  };
}

function mkReport(findings: Finding[]): ScanReport {
  return {
    scanId: "s1",
    repoUrl: "https://github.com/x/y",
    createdAt: new Date().toISOString(),
    filesScanned: 1,
    filesSkipped: 0,
    rulesExecuted: 5,
    rulesExpected: 5,
    ruleFailures: 0,
    findings,
    risk: computeRiskReport(findings),
    warnings: [],
  };
}

describe("compareScans", () => {
  it("classifies a finding as resolved when absent after rescan", () => {
    const before = mkReport([mkFinding("f1")]);
    const after = mkReport([]);
    const cmp = compareScans(before, after);
    expect(cmp.resolved).toHaveLength(1);
    expect(cmp.remaining).toHaveLength(0);
    expect(cmp.after.score).toBe(100);
  });

  it("classifies a finding as remaining when still present", () => {
    const before = mkReport([mkFinding("f1")]);
    const after = mkReport([mkFinding("f1")]);
    const cmp = compareScans(before, after);
    expect(cmp.resolved).toHaveLength(0);
    expect(cmp.remaining).toHaveLength(1);
  });

  it("classifies a new finding as introduced", () => {
    const before = mkReport([]);
    const after = mkReport([mkFinding("f2")]);
    const cmp = compareScans(before, after);
    expect(cmp.introduced).toHaveLength(1);
  });
});
