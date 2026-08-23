import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import { isRequestMember, unwrapExpression } from "../analysis/ast-utils";

export const R8_DEFINITION: RuleDefinition = {
  id: "R8",
  name: "Potential SSRF",
  cwe: "CWE-918",
  severity: "High",
  description: "A request-controlled URL reaches an outbound HTTP client without evidence of destination validation.",
};

function tainted(node: t.Node, names: Set<string>): boolean {
  const n = unwrapExpression(node);
  if (isRequestMember(n)) return true;
  if (t.isIdentifier(n)) return names.has(n.name);
  if (t.isBinaryExpression(n) && n.operator === "+") return tainted(n.left, names) || tainted(n.right, names);
  if (t.isTemplateLiteral(n)) return n.expressions.some(e => tainted(e, names));
  if (t.isObjectExpression(n)) return n.properties.some(p => t.isObjectProperty(p) && tainted(p.value, names));
  return false;
}

function isOutbound(callee: t.Node): boolean {
  if (t.isIdentifier(callee)) return /^(fetch|request)$/i.test(callee.name);
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return false;
  const prop = t.isIdentifier(callee.property) ? callee.property.name : "";
  return /^(request|get|post|put|patch|delete)$/i.test(prop);
}

export const r8SsrfRule: Rule = {
  definition: R8_DEFINITION,
  analyze(file: ParsedFile): Finding[] {
    const findings: Finding[] = [];
    const names = new Set<string>();
    traverse(file.ast, {
      VariableDeclarator(path) {
        if (t.isIdentifier(path.node.id) && path.node.init && tainted(path.node.init, names)) names.add(path.node.id.name);
      },
      AssignmentExpression(path) {
        if (t.isIdentifier(path.node.left) && tainted(path.node.right, names)) names.add(path.node.left.name);
      },
      CallExpression(path) {
        if (!isOutbound(path.node.callee)) return;
        const vulnerable = path.node.arguments.some(arg => !t.isSpreadElement(arg) && tainted(arg, names));
        if (!vulnerable) return;
        findings.push(makeFinding({
          file: file.path, line: path.node.loc?.start.line ?? 0, ruleId: "R8",
          ruleName: R8_DEFINITION.name, severity: "High", cwe: "CWE-918",
          status: "match", confidence: "high",
          evidence: ["request-controlled URL reaches an outbound HTTP client", "destination validation was not proven before the network request"],
          issue: "Potential server-side request forgery (SSRF)", source: file.source,
        }));
      },
    });
    return findings;
  },
};
