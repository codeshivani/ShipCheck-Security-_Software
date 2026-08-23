import { Finding } from "@/types/findings";
import { AIExplanation } from "@/types/reports";
import { getLLMProvider, isLLMConfigured } from "./client";
import { buildFindingPrompt, SYSTEM_PROMPT } from "./prompts";
import { parseAIResponse, deterministicFallback } from "./validator";
import { cacheKey, getCached, setCached } from "./cache";

/**
 * Produces the explanation/impact/remediation/patch for a single finding.
 * Always resolves (never throws) — on any AI failure it falls back to
 * deterministic guidance so the scan/demo flow keeps working (spec 8 & 9).
 */
export async function explainFinding(finding: Finding, fileSource: string): Promise<AIExplanation> {
  const key = cacheKey(fileSource, finding.ruleId + ":" + finding.line);

  const cached = await getCached(key);
  if (cached) return cached;

  if (!isLLMConfigured()) {
    return deterministicFallback(finding);
  }

  try {
    const provider = getLLMProvider();
    const raw = await provider.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildFindingPrompt(finding, fileSource) }],
      maxTokens: 1200,
    });

    const parsed = parseAIResponse(raw);
    if (!parsed) {
      // Malformed output — degrade gracefully rather than crash.
      const fallback = deterministicFallback(finding);
      return fallback;
    }

    const result: AIExplanation = { ...parsed, degraded: false };
    await setCached(key, result);
    return result;
  } catch {
    return deterministicFallback(finding);
  }
}
