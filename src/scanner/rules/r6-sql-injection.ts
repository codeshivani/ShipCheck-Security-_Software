import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import { isRequestMember, memberChainToString, unwrapExpression } from "../analysis/ast-utils";

export const R6_DEFINITION: RuleDefinition = {
  id: "R6",
  name: "Potential SQL Injection",
  cwe: "CWE-89",
  severity: "Critical",
  description: "Request-controlled data reaches a raw SQL/query execution sink without a parameterized query boundary.",
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

function sinkName(callee: t.Node): string | null {
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return null;
  const property = t.isIdentifier(callee.property) ? callee.property.name : t.isStringLiteral(callee.property) ? callee.property.value : "";
  if (!/^(query|raw|execute|executeRaw|unsafe|unsafeQuery)$/i.test(property)) return null;
  const chain = memberChainToString(callee.object).toLowerCase();
  if (!/(db|database|sql|sequelize|knex|prisma|pool|client|repository|query)/.test(chain)) return null;
  return property;
}

export const r6SqlInjectionRule: Rule = {
  definition: R6_DEFINITION,
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
        const sink = sinkName(path.node.callee);
        if (!sink) return;
        const vulnerable = path.node.arguments.some(arg => !t.isSpreadElement(arg) && tainted(arg, names));
        if (!vulnerable) return;
        findings.push(makeFinding({
          file: file.path, line: path.node.loc?.start.line ?? 0, ruleId: "R6",
          ruleName: R6_DEFINITION.name, severity: "Critical", cwe: "CWE-89",
          status: "match", confidence: "high",
          evidence: ["request-controlled data reaches a raw SQL/query execution sink", `execution method: ${sink}`, "no parameterization proof was found at the sink"],
          issue: "Potential SQL injection", source: file.source,
        }));
      },
    });
    return findings;
  },
};
