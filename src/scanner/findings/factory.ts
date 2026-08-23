import crypto from "crypto";
import { Confidence, Finding, FindingStatus, RuleId, Severity } from "@/types/findings";

export interface RawFindingInput {
  file: string;
  line: number;
  endLine?: number;
  ruleId: RuleId;
  ruleName: string;
  severity: Severity;
  cwe: string;
  status: FindingStatus;
  confidence: Confidence;
  evidence: string[];
  issue: string;
  source?: string; // full file source, used to extract a snippet
  column?: number;
  fingerprintKey?: string;
}

/**
 * Finding identity is derived from the flagged line's own (trimmed) source
 * text, not its line number. This keeps a finding's identity stable across
 * a rescan even when an earlier edit in the same file shifts line numbers —
 * e.g. inserting an auth-guard line above an unrelated finding must not make
 * that unrelated finding look "resolved" and "newly introduced" in the same
 * rescan. If the flagged code itself changes (or disappears), the identity
 * changes (or the finding disappears) — which is the correct behavior for
 * the rescan comparison in src/rescan/compare.ts.
 */
export function makeFindingId(file: string, ruleId: string, lineText: string, fingerprintKey = ""): string {
  return crypto.createHash("sha1").update(`${file}:${ruleId}:${lineText.trim()}:${fingerprintKey}`).digest("hex").slice(0, 12);
}

/**
 * Extracts a small excerpt (line +/- 2) around a finding for UI display.
 * This is display-only context; it is never fed back into scoring.
 */
export function extractSnippet(source: string, line: number, context = 2): string {
  const lines = source.split("\n");
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join("\n");
}

export function makeFinding(input: RawFindingInput): Finding {
  const sourceLines = input.source?.split("\n") ?? [];
  const lineText = sourceLines[input.line - 1] ?? "";
  const snippet = input.source ? extractSnippet(input.source, input.line) : undefined;
  return {
    id: makeFindingId(input.file, input.ruleId, lineText, input.fingerprintKey ?? `${input.column ?? 0}`),
    file: input.file,
    line: input.line,
    endLine: input.endLine,
    ruleId: input.ruleId,
    ruleName: input.ruleName,
    severity: input.severity,
    cwe: input.cwe,
    status: input.status,
    confidence: input.confidence,
    evidence: input.evidence,
    issue: input.issue,
    snippet,
  };
}
