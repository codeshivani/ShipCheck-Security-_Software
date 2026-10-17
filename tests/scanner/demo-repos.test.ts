import { describe, it, expect } from "vitest";
import path from "path";
import { scanDirectory } from "@/scanner/scanner";

const DEMO_ROOT = path.resolve(__dirname, "../../demo");

function ruleIds(findings: { ruleId: string; status: string }[]) {
  return new Set(findings.map((f) => f.ruleId));
}

function matchedRuleIds(findings: { ruleId: string; status: string }[]) {
  return new Set(findings.filter((f) => f.status === "match").map((f) => f.ruleId));
}

describe("seeded demo repositories", () => {
  it("vulnerable-auth trips R1, R2, and R3", async () => {
    const report = await scanDirectory(path.join(DEMO_ROOT, "vulnerable-auth"), "demo://vulnerable-auth");
    const ids = matchedRuleIds(report.findings);
    expect(ids.has("R1")).toBe(true);
    expect(ids.has("R2")).toBe(true);
    expect(ids.has("R3")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });

  it("vulnerable-ecommerce trips R1 and R4", async () => {
    const report = await scanDirectory(path.join(DEMO_ROOT, "vulnerable-ecommerce"), "demo://vulnerable-ecommerce");
    const matches = matchedRuleIds(report.findings);
    const detected = ruleIds(report.findings);
    expect(matches.has("R1")).toBe(true);
    expect(detected.has("R4")).toBe(true);
    expect(report.findings.some(f => f.ruleId === "R4" && f.status === "review")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });

  it("vulnerable-exec trips R2, R3, and R5", async () => {
    const report = await scanDirectory(path.join(DEMO_ROOT, "vulnerable-exec"), "demo://vulnerable-exec");
    const ids = matchedRuleIds(report.findings);
    expect(ids.has("R2")).toBe(true);
    expect(ids.has("R3")).toBe(true);
    expect(ids.has("R5")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });

  it("negative-control routes are not flagged", async () => {
    const report = await scanDirectory(path.join(DEMO_ROOT, "vulnerable-ecommerce"), "demo://vulnerable-ecommerce");
    const flaggedFiles = report.findings
      .filter((f) => f.status === "match")
      .map((f) => `${f.file}:${f.line}`);
    // The "mine/:orderId" ownership-constrained route should never appear.
    const flaggedNearOwnershipRoute = flaggedFiles.some((f) => f.includes("orders.ts") && f.endsWith(":27"));
    expect(flaggedNearOwnershipRoute).toBe(false);
  });
});
