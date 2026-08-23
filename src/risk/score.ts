import { Finding, isScoreBearing } from "@/types/findings";
import { RiskReport, SeverityCounts } from "@/types/reports";
import { gradeForScore } from "./grade";

const WEIGHTS = {
  Critical: 22,
  High: 12,
  Medium: 5,
} as const;

export const RISK_DISCLAIMER =
  "A clean result means none of ShipCheck's supported high-confidence rules matched. It does not prove the application is secure.";

/**
 * Only score-bearing (status="match", confidence="high") findings affect the
 * ShipCheck Risk Score. "review" status findings are surfaced separately in
 * the UI and are counted in reviewCount, not in the score formula.
 */
export function computeRiskReport(findings: Finding[]): RiskReport {
  const counts: SeverityCounts = { Critical: 0, High: 0, Medium: 0 };
  let reviewCount = 0;

  for (const f of findings) {
    if (f.status === "review") {
      reviewCount++;
      continue;
    }
    if (f.status === "suppressed") {
      continue;
    }
    if (isScoreBearing(f)) {
      counts[f.severity]++;
    }
  }

  const score = Math.max(
    0,
    100 - WEIGHTS.Critical * counts.Critical - WEIGHTS.High * counts.High - WEIGHTS.Medium * counts.Medium
  );

  return {
    score,
    grade: gradeForScore(score),
    counts,
    reviewCount,
    disclaimer: RISK_DISCLAIMER,
  };
}
