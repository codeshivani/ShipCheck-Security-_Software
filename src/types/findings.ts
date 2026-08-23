// ShipCheck 2.0 — Finding Evidence Model
// This schema is the core product feature: every scanner finding must be traceable
// to a file/line, a rule, and concrete evidence. The LLM never invents or edits this.

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5";

export type Severity = "Critical" | "High" | "Medium";

export type FindingStatus = "match" | "review" | "suppressed";

export type FindingContext = "production" | "test" | "fixture" | "mock" | "example" | "generated" | "unknown";

export type Confidence = "high" | "medium";

export type SecurityFlowNodeType = "entry" | "request" | "transform" | "decision" | "sink" | "resource" | "secret" | "file" | "unknown";

export interface SecurityFlowNode {
  id: string;
  type: SecurityFlowNodeType;
  label: string;
  file?: string;
  line?: number;
  code?: string;
}

export interface SecurityFlowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  vulnerable?: boolean;
  findingId?: string;
  ruleId?: RuleId;
}

export interface SecurityFlow {
  id: string;
  title: string;
  confidence: "full" | "partial";
  nodes: SecurityFlowNode[];
  edges: SecurityFlowEdge[];
  vulnerableEdgeId?: string;
  fingerprint: string;
}

export interface Finding {
  id: string; // stable id: sha1(file+line+ruleId) truncated
  file: string;
  line: number;
  endLine?: number;
  ruleId: RuleId;
  ruleName: string;
  severity: Severity;
  cwe: string;
  status: FindingStatus;
  confidence: Confidence;
  context?: FindingContext;
  evidence: string[];
  issue: string;
  snippet?: string; // small surrounding code excerpt for UI display
  securityFlow?: SecurityFlow;
}

export interface RuleDefinition {
  id: RuleId;
  name: string;
  cwe: string;
  severity: Severity;
  description: string;
}

// A scan is only "score-bearing" for findings with status "match" and
// confidence "high". "review" findings are surfaced separately in the UI
// and do not automatically move the score, per spec section 7.
export function isScoreBearing(f: Finding): boolean {
  // Findings inside test fixtures/mocks are still surfaced, but do not
  // represent production attack surface and therefore do not affect the
  // headline score. This keeps self-scans honest without hiding evidence.
  return f.status === "match" && f.confidence === "high" && (f.context ?? "production") === "production";
}

export function countFindingsBySeverity(findings: Finding[]): { Critical: number; High: number; Medium: number } {
  const counts = { Critical: 0, High: 0, Medium: 0 };
  for (const finding of findings) {
    if (finding.status === "suppressed") continue;
    counts[finding.severity]++;
  }
  return counts;
}
