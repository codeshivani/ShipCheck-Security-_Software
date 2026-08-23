import { Severity, FindingStatus, Confidence } from "@/types/findings";

const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: "var(--sc-critical)",
  High: "var(--sc-high)",
  Medium: "var(--sc-medium)",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="font-display text-[11px] font-bold tracking-wider px-2 py-0.5 rounded border uppercase"
      style={{ color, borderColor: color, backgroundColor: `${color}14` }}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  const label = status === "match" ? "Match" : status === "review" ? "Review" : "Suppressed";
  const color = status === "match" ? "var(--sc-text)" : status === "review" ? "var(--sc-muted)" : "var(--sc-muted)";
  return (
    <span
      className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase opacity-80"
      style={{ color, borderColor: "var(--sc-border)" }}
    >
      {label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase text-sc-muted border-sc-border">
      {confidence} confidence
    </span>
  );
}
