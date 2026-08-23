import { describe, it, expect } from "vitest";
import { parseAIResponse, deterministicFallback } from "@/ai/validator";
import { Finding } from "@/types/findings";

const finding: Finding = {
  id: "abc123",
  file: "src/a.ts",
  line: 10,
  ruleId: "R1",
  ruleName: "Missing Endpoint Authorization",
  severity: "Critical",
  cwe: "CWE-862",
  status: "match",
  confidence: "high",
  evidence: ["no guard found"],
  issue: "Potential missing authorization",
};

describe("parseAIResponse", () => {
  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      explanation: "x",
      impact: "y",
      remediation: "z",
      patch: "",
    });
    expect(parseAIResponse(raw)).not.toBeNull();
  });

  it("strips markdown fences defensively", () => {
    const raw = "```json\n" + JSON.stringify({ explanation: "x", impact: "y", remediation: "z", patch: "" }) + "\n```";
    expect(parseAIResponse(raw)).not.toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAIResponse("not json at all")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseAIResponse(JSON.stringify({ explanation: "x" }))).toBeNull();
  });
});

describe("deterministicFallback", () => {
  it("produces a usable explanation without calling the AI", () => {
    const fallback = deterministicFallback(finding);
    expect(fallback.degraded).toBe(true);
    expect(fallback.explanation).toContain("R1");
    expect(fallback.remediation.length).toBeGreaterThan(0);
  });
});
