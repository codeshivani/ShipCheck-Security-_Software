import fs from "fs/promises";
import crypto from "crypto";
import { Finding } from "@/types/findings";
import { ScanReport } from "@/types/reports";
import { computeRiskReport } from "@/risk/score";
import { parseSource, ParseError } from "./parser/parse";
import { walkRepo } from "./repo/walk";
import { cloneRepo, RepoError } from "./repo/clone";
import { ALL_RULES } from "./rules";
import { buildRepositoryAnalysis } from "./analysis/repository";
import { buildSecurityFlow } from "./analysis/security-flow";
import type { ParsedFile } from "./parser/parse";
import { performance } from "perf_hooks";

export const SCAN_TIMEOUT_MS = 60_000;
export const MAX_CONCURRENT_SCANS = 2;

export { RepoError };

let activeScans = 0;

export async function withScanSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    throw new RepoError("ShipCheck is already running the maximum number of scans. Try again when one finishes.", "SCAN_CAPACITY_REACHED");
  }
  activeScans++;
  try {
    return await fn();
  } finally {
    activeScans--;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new RepoError("Scan timed out and was cancelled.", "SCAN_TIMEOUT");
}

export interface ScanOptions {
  signal?: AbortSignal;
}

function ruleCandidate(ruleId: string, source: string): boolean {
  // Cheap prefilters only decide whether to spend AST time on a rule. They are
  // intentionally broad and never replace the rule's actual security decision.
  switch (ruleId) {
    case "R1":
      return /(?:\.get|\.post|\.put|\.patch|\.delete|\.head|\.options)\s*\(|export\s+(?:async\s+)?(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|@(Get|Post|Put|Patch|Delete|Options|Head)\b/i.test(source);
    case "R2":
      return /(?:secret|api[-_]?key|apikey|token|password|passwd|access[-_]?key|private[-_]?key|auth[-_]?key)|(?:sk-|ghp_|AKIA|xox[abprs]-)/i.test(source);
    case "R3":
      return /(?:\.decode\s*\(|jwt|jsonwebtoken|token\s*\.)/i.test(source);
    case "R4":
      return /(?:req|request|ctx|context)\s*\.\s*(?:params|query|body)|(?:findById|findOne|findUnique|findFirst|findByPk|findMany|find\s*\(|select\s*\()/i.test(source);
    case "R5":
      return /(?:eval\s*\(|new\s+Function\s*\(|\bFunction\s*\(|(?:exec|execSync|spawn|spawnSync)\s*\(|\.\s*(?:exec|execSync|spawn|spawnSync)\s*\()/i.test(source);
    default:
      return true;
  }
}

export async function scanDirectory(rootDir: string, repoUrl: string, options: ScanOptions = {}): Promise<ScanReport> {
  const { signal } = options;
  const timings: Record<string, number> = {};
  const totalStart = performance.now();
  const warnings: string[] = [];
  const findings: Finding[] = [];
  let filesScanned = 0;
  let ruleFailures = 0;

  const walkStart = performance.now();
  const walk = await walkRepo(rootDir, signal);
  timings.walkMs = Math.round(performance.now() - walkStart);
  throwIfAborted(signal);

  if (walk.skippedTooMany) warnings.push("Repository contains more files than this scan supports; results are based on a subset.");
  if (walk.skippedTooLarge.length > 0) warnings.push(`${walk.skippedTooLarge.length} file(s) skipped for exceeding the per-file size limit.`);
  if (walk.skippedByTotalBytes.length > 0) warnings.push(`${walk.skippedByTotalBytes.length} file(s) skipped after the aggregate source-byte budget was reached.`);

  const parsedFiles: ParsedFile[] = [];
  const readStart = performance.now();
  for (const { relPath, absPath } of walk.files) {
    throwIfAborted(signal);
    let source: string;
    try {
      source = await fs.readFile(absPath, "utf-8");
    } catch {
      warnings.push(`Could not read ${relPath} — skipped.`);
      continue;
    }

    const parseStart = performance.now();
    try {
      parsedFiles.push(parseSource(relPath, source));
      filesScanned++;
    } catch (err) {
      if (err instanceof ParseError) {
        warnings.push(`Could not parse ${relPath} (syntax not supported) — skipped.`);
        continue;
      }
      throw err;
    }
    timings.parseMs = (timings.parseMs ?? 0) + Math.round(performance.now() - parseStart);
  }
  timings.readParseMs = Math.round(performance.now() - readStart);

  throwIfAborted(signal);
  const analysisStart = performance.now();
  const repository = buildRepositoryAnalysis(parsedFiles);
  timings.repositoryAnalysisMs = Math.round(performance.now() - analysisStart);

  for (const parsed of parsedFiles) {
    throwIfAborted(signal);
    for (const rule of ALL_RULES) {
      throwIfAborted(signal);
      if (!ruleCandidate(rule.definition.id, parsed.source)) continue;
      const ruleStart = performance.now();
      try {
        findings.push(...rule.analyze(parsed, repository));
      } catch (err) {
        ruleFailures++;
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Rule ${rule.definition.id} failed on ${parsed.path}: ${message}`);
      } finally {
        const key = `${rule.definition.id}Ms`;
        timings[key] = (timings[key] ?? 0) + Math.round(performance.now() - ruleStart);
      }
    }
  }

  throwIfAborted(signal);
  const flowStart = performance.now();
  const parsedByPath = new Map(parsedFiles.map(file => [file.path.replace(/\\/g, "/"), file]));
  for (const finding of findings) {
    throwIfAborted(signal);
    const parsed = parsedByPath.get(finding.file.replace(/\\/g, "/"));
    if (!parsed) continue;
    try {
      finding.securityFlow = buildSecurityFlow(finding, parsed);
    } catch {
      warnings.push(`Security flow could not be generated for ${finding.ruleId} at ${finding.file}:${finding.line}.`);
    }
  }
  timings.flowGenerationMs = Math.round(performance.now() - flowStart);

  // Deterministically eliminate exact duplicates and make same-line distinct
  // occurrences collision-safe. Ordering is derived from source evidence, not
  // discovery timing, so IDs remain stable across rescans.
  const orderedFindings = [...findings].sort((a, b) =>
    `${a.file}:${a.ruleId}:${a.line}:${a.issue}:${a.evidence.join("|")}`.localeCompare(
      `${b.file}:${b.ruleId}:${b.line}:${b.issue}:${b.evidence.join("|")}`,
    ),
  );
  const uniqueFindings: Finding[] = [];
  const seenIds = new Set<string>();
  for (const finding of orderedFindings) {
    if (!seenIds.has(finding.id)) {
      seenIds.add(finding.id);
      uniqueFindings.push(finding);
      continue;
    }
    const occurrenceHash = crypto.createHash("sha1")
      .update(`${finding.id}:${finding.issue}:${finding.evidence.join("|")}:${finding.file}:${finding.line}`)
      .digest("hex")
      .slice(0, 6);
    const disambiguated = { ...finding, id: `${finding.id}-${occurrenceHash}` };
    if (!seenIds.has(disambiguated.id)) {
      seenIds.add(disambiguated.id);
      uniqueFindings.push(disambiguated);
    }
  }

  const riskStart = performance.now();
  const risk = computeRiskReport(uniqueFindings);
  timings.riskMs = Math.round(performance.now() - riskStart);
  timings.totalMs = Math.round(performance.now() - totalStart);

  return {
    scanId: crypto.randomBytes(8).toString("hex"),
    repoUrl,
    createdAt: new Date().toISOString(),
    filesScanned,
    filesSkipped: walk.skippedTooLarge.length + walk.skippedByTotalBytes.length,
    rulesExecuted: ALL_RULES.length,
    rulesExpected: ALL_RULES.length,
    ruleFailures,
    findings: uniqueFindings,
    risk,
    warnings,
    timings,
  };
}

export async function scanDirectoryWithTimeout(
  rootDir: string,
  repoUrl: string,
  timeoutMs = SCAN_TIMEOUT_MS,
): Promise<ScanReport> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await scanDirectory(rootDir, repoUrl, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new RepoError("Scan timed out and was cancelled.", "SCAN_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function cloneAndScan(repoUrl: string): Promise<{ report: ScanReport; dir: string; cleanup: () => Promise<void> }> {
  return withScanSlot(async () => {
    let cloned: Awaited<ReturnType<typeof cloneRepo>> | undefined;
    try {
      cloned = await cloneRepo(repoUrl);
      const report = await scanDirectoryWithTimeout(cloned.dir, repoUrl);
      return { report, dir: cloned.dir, cleanup: cloned.cleanup };
    } catch (err) {
      await cloned?.cleanup();
      throw err;
    }
  });
}
