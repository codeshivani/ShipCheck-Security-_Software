import fs from "fs/promises";
import crypto from "crypto";
import { Finding, type FindingContext } from "@/types/findings";
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
export const MAX_CONCURRENT_SCANS = 3;

export { RepoError };

let activeScans = 0;

// Small bounded AST cache: rescans and repeated batch scans often revisit the
// same source. Keeping only small files prevents a large repository from
// turning the cache into a memory sink.
const PARSE_CACHE_MAX = 128;
const PARSE_CACHE_MAX_FILE_BYTES = 256 * 1024;
const parseCache = new Map<string, ParsedFile>();

function cachedParse(relPath: string, source: string): { parsed: ParsedFile; hit: boolean } {
  const key = crypto.createHash("sha1").update(relPath).update("\0").update(source).digest("hex");
  const cached = parseCache.get(key);
  if (cached) {
    parseCache.delete(key);
    parseCache.set(key, cached);
    return { parsed: cached, hit: true };
  }
  const parsed = parseSource(relPath, source);
  if (Buffer.byteLength(source, "utf8") <= PARSE_CACHE_MAX_FILE_BYTES) {
    parseCache.set(key, parsed);
    while (parseCache.size > PARSE_CACHE_MAX) {
      const oldest = parseCache.keys().next().value as string | undefined;
      if (!oldest) break;
      parseCache.delete(oldest);
    }
  }
  return { parsed, hit: false };
}

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

function classifyFindingContext(filePath: string): FindingContext {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/");
  const base = segments[segments.length - 1] ?? normalized;
  if (segments.some(part => ["test", "tests", "__tests__"].includes(part)) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) return "test";
  if (segments.some(part => ["fixtures", "fixture"].includes(part))) return "fixture";
  if (segments.some(part => ["mocks", "mock", "__mocks__"].includes(part))) return "mock";
  if (segments.some(part => ["examples", "example", "samples", "sample", "demo"].includes(part))) return "example";
  if (segments.some(part => ["generated", "gen"].includes(part)) || /\.generated\./.test(base)) return "generated";
  return "production";
}

function normalizeFindingContext(findings: Finding[], warnings: string[]): Finding[] {
  let downgraded = 0;
  const normalized = findings.map((finding) => {
    const context = classifyFindingContext(finding.file);
    if (context === "production") return { ...finding, context };
    if (finding.status === "match") {
      downgraded++;
      return {
        ...finding,
        context,
        status: "review" as const,
        confidence: "medium" as const,
        evidence: [...finding.evidence, `finding is located in ${context} code and is not counted against the production risk score`],
      };
    }
    return { ...finding, context };
  });
  if (downgraded) warnings.push(`${downgraded} finding(s) were moved to review because they occur in test/fixture/mock/example code.`);
  return normalized;
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
  // Read source files concurrently. Disk/network-backed temp directories are
  // the dominant cost for many medium repositories; a small worker pool keeps
  // I/O busy without creating hundreds of open file descriptors.
  const readQueue = [...walk.files];
  const readWorkers = Math.min(12, Math.max(2, readQueue.length));
  const parsedChunks: ParsedFile[][] = Array.from({ length: readWorkers }, () => []);
  await Promise.all(parsedChunks.map(async (chunk, workerIndex) => {
    while (true) {
      throwIfAborted(signal);
      const item = readQueue.pop();
      if (!item) return;
      const { relPath, absPath } = item;
      let source: string;
      try {
        source = await fs.readFile(absPath, "utf-8");
      } catch {
        warnings.push(`Could not read ${relPath} — skipped.`);
        continue;
      }
      const parseStart = performance.now();
      try {
        const parsedResult = cachedParse(relPath, source);
        chunk.push(parsedResult.parsed);
        if (parsedResult.hit) timings.parseCacheHits = (timings.parseCacheHits ?? 0) + 1;
        filesScanned++;
      } catch (err) {
        if (err instanceof ParseError) {
          warnings.push(`Could not parse ${relPath} (syntax not supported) — skipped.`);
          continue;
        }
        throw err;
      }
      timings.parseMs = (timings.parseMs ?? 0) + Math.round(performance.now() - parseStart);
      if (workerIndex === 0 && filesScanned % 25 === 0) throwIfAborted(signal);
    }
  }));
  parsedFiles.push(...parsedChunks.flat());
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

  // Classify findings by source context before scoring. Test fixtures and mocks
  // remain visible to developers but do not distort the production score.
  const contextualFindings = normalizeFindingContext(findings, warnings);

  // Deterministically eliminate exact duplicates and make same-line distinct
  // occurrences collision-safe. Ordering is derived from source evidence, not
  // discovery timing, so IDs remain stable across rescans.
  const orderedFindings = [...contextualFindings].sort((a, b) =>
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
