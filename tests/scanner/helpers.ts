import { parseSource } from "@/scanner/parser/parse";
import { Rule } from "@/scanner/rules/types";
import { Finding } from "@/types/findings";
import { buildRepositoryAnalysis } from "@/scanner/analysis/repository";

export function runRule(rule: Rule, filePath: string, source: string): Finding[] {
  const parsed = parseSource(filePath, source);
  return rule.analyze(parsed);
}

export function runRuleAcrossFiles(rule: Rule, files: Record<string, string>): Finding[] {
  const parsedFiles = Object.entries(files).map(([filePath, source]) => parseSource(filePath, source));
  const repository = buildRepositoryAnalysis(parsedFiles);
  return parsedFiles.flatMap((file) => rule.analyze(file, repository));
}
