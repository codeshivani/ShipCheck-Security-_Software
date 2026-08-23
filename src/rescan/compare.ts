import { Finding } from "@/types/findings";
import { RescanComparison, ScanReport } from "@/types/reports";

/**
 * Compares a before/after ScanReport pair. The rescan (deterministic scanner
 * output) is the sole authority on whether a finding was resolved — never the
 * AI's claim that a patch "fixed" something.
 */
export function compareScans(before: ScanReport, after: ScanReport): RescanComparison {
  const beforeIds = new Map(before.findings.map((f) => [f.id, f]));
  const afterIds = new Map(after.findings.map((f) => [f.id, f]));

  const resolved: Finding[] = [];
  const remaining: Finding[] = [];
  const introduced: Finding[] = [];

  for (const [id, f] of beforeIds) {
    if (afterIds.has(id)) {
      remaining.push(f);
    } else {
      resolved.push(f);
    }
  }

  for (const [id, f] of afterIds) {
    if (!beforeIds.has(id)) {
      introduced.push(f);
    }
  }

  return {
    before: before.risk,
    after: after.risk,
    resolved,
    remaining,
    introduced,
    severityDelta: {
      Critical: [before.risk.counts.Critical, after.risk.counts.Critical],
      High: [before.risk.counts.High, after.risk.counts.High],
      Medium: [before.risk.counts.Medium, after.risk.counts.Medium],
    },
  };
}
