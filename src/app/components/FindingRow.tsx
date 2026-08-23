import { Finding } from "@/types/findings";
import { SeverityBadge, StatusBadge } from "./Badges";

export function FindingRow({
  finding,
  onSelect,
  verificationPending,
  resolved,
}: {
  finding: Finding;
  onSelect: () => void;
  verificationPending?: boolean;
  resolved?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border border-sc-border bg-white hover:bg-sc-surface-2 transition-colors px-4 py-3 flex items-center justify-between gap-4 sc-focus ${
        resolved ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <SeverityBadge severity={finding.severity} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-sc-text truncate">{finding.issue}</div>
          <div className="text-xs text-sc-muted font-display truncate">
            {finding.file}:{finding.line} · {finding.cwe}
          </div>
          {finding.context && finding.context !== "production" && (
            <span className="mt-1 inline-flex rounded-full border border-[#ead8a6] bg-[#fffaf0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sc-high">
              {finding.context} context · not score-bearing
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {resolved && (
          <span className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase text-sc-pass border-sc-pass">
            Resolved
          </span>
        )}
        {verificationPending && !resolved && (
          <span className="font-display text-[11px] tracking-wider px-2 py-0.5 rounded border uppercase text-sc-medium border-sc-medium">
            Pending
          </span>
        )}
        <StatusBadge status={finding.status} />
      </div>
    </button>
  );
}
