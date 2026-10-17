import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";

export const R2_DEFINITION: RuleDefinition = {
  id: "R2",
  name: "Hardcoded Secret",
  cwe: "CWE-798",
  severity: "Critical",
  description: "Known secret/key prefixes or high-entropy secret-like literals hardcoded in source.",
};

// Known secret prefixes with a human-readable label for evidence.
const KNOWN_PREFIXES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsk-[a-zA-Z0-9]{16,}\b/, label: "matches OpenAI/Stripe-style secret key prefix 'sk-'" },
  { pattern: /\bghp_[a-zA-Z0-9]{20,}\b/, label: "matches GitHub personal access token prefix 'ghp_'" },
  { pattern: /\bAKIA[0-9A-Z]{12,}\b/, label: "matches AWS access key ID prefix 'AKIA'" },
  { pattern: /\bxoxb-[a-zA-Z0-9-]{10,}\b/, label: "matches Slack bot token prefix 'xoxb-'" },
  { pattern: /\bxox[aprs]-[a-zA-Z0-9-]{10,}\b/, label: "matches Slack token prefix" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, label: "matches GitHub fine-grained token prefix" },
  { pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/, label: "matches live Stripe secret key prefix" },
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/, label: "matches Google API key prefix" },
];

const OBVIOUS_PLACEHOLDER_PATTERN = /(your[-_]?api[-_]?key|xxxx|placeholder|changeme|example|dummy|fake|test[-_]?key|<[a-z-]+>|\$\{)/i;

// Variable/property names that suggest the literal is intended as a secret.
const SECRET_NAME_PATTERN = /(secret|api[-_]?key|apikey|token|password|passwd|access[-_]?key|private[-_]?key|auth[-_]?key)/i;

function isExampleOrFixture(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return [".env.example", ".env.sample", ".env.template"].includes(basename) ||
    normalized.split("/").includes("__fixtures__");
}

function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const ch of str) freq[ch] = (freq[ch] ?? 0) + 1;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isHighEntropyCandidate(value: string): boolean {
  if (value.length < 20 || value.length > 200) return false;
  if (OBVIOUS_PLACEHOLDER_PATTERN.test(value)) return false;
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return false; // require alnum mix
  if (/\s/.test(value)) return false; // secrets don't usually contain whitespace
  return shannonEntropy(value) >= 3.5;
}

function getEnclosingVariableName(path: import("@babel/traverse").NodePath<t.StringLiteral>): string | null {
  const parent = path.parent;
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
  if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) return parent.key.name;
  if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) return parent.left.name;
  return null;
}

export const r2SecretsRule: Rule = {
  definition: R2_DEFINITION,

  analyze(file: ParsedFile): Finding[] {
    if (isExampleOrFixture(file.path)) return [];

    const findings: Finding[] = [];
    const seenLines = new Set<number>();

    traverse(file.ast, {
      StringLiteral(path) {
        const value = path.node.value;
        const line = path.node.loc?.start.line ?? 0;
        const occurrence = typeof path.node.start === "number" ? path.node.start : line * 1000;
        if (seenLines.has(occurrence)) return; // avoid dup on same line for same rule pass edge case

        // 1. Known prefix match — high confidence regardless of variable name.
        for (const { pattern, label } of KNOWN_PREFIXES) {
          if (pattern.test(value)) {
            findings.push(
              makeFinding({
                file: file.path,
                line,
                ruleId: "R2",
                ruleName: R2_DEFINITION.name,
                severity: R2_DEFINITION.severity,
                cwe: R2_DEFINITION.cwe,
                status: "match",
                confidence: "high",
                evidence: [label, "hardcoded string literal in source"],
                issue: "Hardcoded secret detected",
                source: file.source,
                fingerprintKey: `literal:${value.slice(0, 12)}`,
              })
            );
            seenLines.add(occurrence);
            return;
          }
        }

        if (OBVIOUS_PLACEHOLDER_PATTERN.test(value)) return;

        // 2. High-entropy literal assigned to a secret-sounding name — medium confidence,
        //    marked for review rather than an automatic score-bearing match, since a
        //    high-entropy string alone is not proof of a real secret.
        const varName = getEnclosingVariableName(path);
        if (varName && SECRET_NAME_PATTERN.test(varName) && isHighEntropyCandidate(value)) {
          findings.push(
            makeFinding({
              file: file.path,
              line,
              ruleId: "R2",
              ruleName: R2_DEFINITION.name,
              severity: R2_DEFINITION.severity,
              cwe: R2_DEFINITION.cwe,
              status: "review",
              confidence: "medium",
              evidence: [
                `assigned to variable/property named '${varName}'`,
                "high-entropy string literal, not a recognized placeholder",
              ],
              issue: "Possible hardcoded secret (unconfirmed)",
              source: file.source,
              fingerprintKey: `literal:${varName}:${value.slice(0, 12)}`,
            })
          );
          seenLines.add(occurrence);
        }
      },
    });

    return findings;
  },
};
