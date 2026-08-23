import { Finding } from "./findings";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface SeverityCounts {
  Critical: number;
  High: number;
  Medium: number;
}

export interface RiskReport {
  score: number; // 0-100
  grade: Grade;
  counts: SeverityCounts; // score-bearing counts only
  reviewCount: number; // "review" status findings, not score-bearing
  disclaimer: string;
}

export interface ScanReport {
  scanId: string;
  repoUrl: string;
  createdAt: string;
  filesScanned: number;
  filesSkipped: number;
  rulesExecuted: number;
  rulesExpected: number;
  ruleFailures: number;
  findings: Finding[];
  risk: RiskReport;
  warnings: string[]; // e.g. "repo too large, truncated", "N files skipped (parse error)"
  timings?: Record<string, number>; // development diagnostics; no source content
}

export interface RescanComparison {
  before: RiskReport;
  after: RiskReport;
  resolved: Finding[]; // findings present before, absent after
  remaining: Finding[]; // findings present in both (same id)
  introduced: Finding[]; // new findings not present before (rare, but must be handled)
  severityDelta: {
    Critical: [number, number];
    High: [number, number];
    Medium: [number, number];
  };
}

export interface AIExplanation {
  explanation: string;
  impact: string;
  remediation: string;
  patch: string; // unified diff
  degraded?: boolean; // true if AI output was malformed and we fell back
}
