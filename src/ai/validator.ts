import { z } from "zod";
import { Finding } from "@/types/findings";
import { AIExplanation } from "@/types/reports";

const AIResponseSchema = z.object({
  explanation: z.string().min(1),
  impact: z.string().min(1),
  remediation: z.string().min(1),
  patch: z.string(),
});

/**
 * Parses and validates raw LLM output. If the model wrapped its JSON in
 * markdown fences despite instructions not to, we strip those defensively.
 * Returns null if the output cannot be salvaged — callers must fall back to
 * deterministic guidance rather than crashing (spec section 8/16).
 */
export function parseAIResponse(raw: string): z.infer<typeof AIResponseSchema> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const result = AIResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic, rule-specific fallback guidance used when the LLM is
 * unavailable or returns malformed output. Ensures the app never blocks the
 * demo flow on an AI failure.
 */
export function deterministicFallback(finding: Finding): AIExplanation {
  const remediationByRule: Record<string, string> = {
    R1: "Add an authorization check (e.g. session/auth middleware, or an explicit ownership check) before this handler performs its data operation.",
    R2: "Remove the hardcoded secret from source. Load it from an environment variable or secret manager instead, and rotate the exposed credential.",
    R3: "Use jwt.verify() with the expected secret/public key instead of jwt.decode(), and validate issuer/audience before trusting any claim in the token.",
    R4: "Add an ownership or tenant constraint to the query (e.g. filter by the authenticated user's ID) so the identifier alone cannot access another user's data.",
    R5: "Avoid passing request-derived input into eval/new Function/exec-style APIs. Use a safe parser, allowlist, or parameterized API instead.",
  };

  return {
    explanation: `${finding.issue}. This was flagged by rule ${finding.ruleId} (${finding.cwe}) based on: ${finding.evidence.join("; ")}.`,
    impact: `Findings of this type (${finding.severity} severity, ${finding.cwe}) can allow unauthorized access to data or code execution, depending on how the affected code is reached.`,
    remediation: remediationByRule[finding.ruleId] ?? "Review this finding and apply the standard mitigation for its CWE category.",
    patch: "",
    degraded: true,
  };
}
