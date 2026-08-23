import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import type { RepositoryAnalysis } from "../analysis/repository";
import { analyzeTaintNode, analyzeTaintFunction } from "../analysis/taint-flow";
import { isRequestMember } from "../analysis/ast-utils";
import { unwrapExpression } from "../analysis/ast-utils";

export const R5_DEFINITION: RuleDefinition = {
  id: "R5",
  name: "Untrusted Dynamic Execution",
  cwe: "CWE-95",
  severity: "Critical",
  description: "A request-derived value flows into a dangerous execution sink (eval, new Function, exec, etc.).",
};

function finding(file: ParsedFile, line: number, label: string, crossFile = false): Finding {
  return makeFinding({
    file: file.path,
    line,
    ruleId: "R5",
    ruleName: R5_DEFINITION.name,
    severity: R5_DEFINITION.severity,
    cwe: R5_DEFINITION.cwe,
    status: "match",
    confidence: "high",
    evidence: [
      crossFile ? "request-derived value crosses a function/module boundary before reaching this execution sink" : "request-derived value reaches this execution sink",
      `dangerous execution sink: ${label}`,
    ],
    issue: "Untrusted input reaches a dangerous execution sink",
    source: file.source,
  });
}


function localTaint(node: t.Node, tainted: Set<string>): boolean {
  const n = unwrapExpression(node);
  if (isRequestMember(n)) return true;
  if (t.isIdentifier(n)) return tainted.has(n.name);
  if (t.isBinaryExpression(n) && n.operator === "+") return localTaint(n.left, tainted) || localTaint(n.right, tainted);
  if (t.isTemplateLiteral(n)) return n.expressions.some(e => localTaint(e, tainted));
  return false;
}

function localSink(callee: t.Node): string | null {
  if (t.isIdentifier(callee) && callee.name === "eval") return "eval()";
  if (t.isIdentifier(callee) && callee.name === "Function") return "Function()";
  if (t.isIdentifier(callee) && ["exec", "execSync", "spawn", "spawnSync"].includes(callee.name)) return `child_process-style ${callee.name}()`;
  if ((t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && t.isIdentifier(callee.property) && ["exec", "execSync", "spawn", "spawnSync"].includes(callee.property.name)) return `child_process-style ${callee.property.name}()`;
  return null;
}

function localAnalyze(file: ParsedFile): Finding[] {
  const findings: Finding[] = [];
  const tainted = new Set<string>();
  traverse(file.ast, {
    VariableDeclarator(path) {
      if (t.isIdentifier(path.node.id) && path.node.init && localTaint(path.node.init, tainted)) tainted.add(path.node.id.name);
    },
    AssignmentExpression(path) {
      if (t.isIdentifier(path.node.left) && localTaint(path.node.right, tainted)) tainted.add(path.node.left.name);
    },
    CallExpression(path) {
      const label = localSink(path.node.callee);
      if (!label || !path.node.arguments.some(a => !t.isSpreadElement(a) && localTaint(a, tainted))) return;
      findings.push(finding(file, path.node.loc?.start.line ?? 0, label));
    },
    NewExpression(path) {
      if (!t.isIdentifier(path.node.callee) || path.node.callee.name !== "Function") return;
      if (!path.node.arguments.some(a => localTaint(a as t.Node, tainted))) return;
      findings.push(finding(file, path.node.loc?.start.line ?? 0, "new Function()"));
    },
  });
  return findings;
}

export const r5DynamicExecRule: Rule = {
  definition: R5_DEFINITION,

  analyze(file: ParsedFile, repository?: RepositoryAnalysis): Finding[] {
    if (!repository) return localAnalyze(file);
    const findings: Finding[] = [];
    const seen = new Set<string>();

    const add = (sinkFilePath: string, line: number, label: string, crossFile: boolean) => {
      const key = `${sinkFilePath}:${line}:${label}`;
      if (seen.has(key)) return;
      seen.add(key);
      const sinkFile = repository.files.get(sinkFilePath) ?? file;
      findings.push(finding(sinkFile, line, label, crossFile));
    };

    // Named functions are analyzed as possible entry points. Anonymous route
    // handlers are handled below; the taint engine only propagates values into
    // callees when the call argument is actually tainted.
    for (const record of repository.functions.values()) {
      if (record.filePath !== file.path) continue;
      const sinks = analyzeTaintFunction(repository, file.path, record.name);
      for (const sink of sinks) add(sink.filePath, sink.line, sink.label, sink.filePath !== file.path);
    }

    traverse(file.ast, {
      Function(path) {
        // Named functions have already been analyzed above. Anonymous route
        // callbacks and other inline functions need a direct entry point.
        if (t.isFunctionDeclaration(path.node) && path.node.id) return;
        const sinks = analyzeTaintNode(repository, file.path, path.node);
        for (const sink of sinks) add(sink.filePath, sink.line, sink.label, sink.filePath !== file.path);
      },
      NewExpression(path) {
        if (!t.isIdentifier(path.node.callee) || path.node.callee.name !== "Function") return;
        // The generic taint engine intentionally covers call sinks. Handle
        // new Function separately because Babel represents it as a NewExpression.
        const source = path.node.arguments.some(arg => isRequestMember(arg as t.Node));
        if (source) add(file.path, path.node.loc?.start.line ?? 0, "new Function()", false);
      },
    });

    return findings;
  },
};
