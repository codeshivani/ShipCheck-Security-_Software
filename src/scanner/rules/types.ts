import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import type { RepositoryAnalysis } from "../analysis/repository";

export interface Rule {
  definition: RuleDefinition;
  /**
   * Analyze a single parsed file and return zero or more findings.
   * Rules must not throw for "no match" — only for unrecoverable internal
   * errors, which the scanner orchestrator will catch and log as a warning.
   */
  analyze(file: ParsedFile, repository?: RepositoryAnalysis): Finding[];
}
