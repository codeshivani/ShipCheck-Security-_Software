import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import { isRequestMember, unwrapExpression } from "../analysis/ast-utils";

export const R7_DEFINITION: RuleDefinition = {
  id: "R7",
  name: "Potential Path Traversal",
  cwe: "CWE-22",
  severity: "High",
  description: "Request-controlled path data reaches a filesystem operation without a proven safe-root containment check.",
};

const FS_SINKS = new Set(["readFile","readFileSync","writeFile","writeFileSync","appendFile","appendFileSync","rm","rmSync","unlink","unlinkSync","readdir","readdirSync","createReadStream","createWriteStream"]);
const PATH_BUILDERS = new Set(["join","resolve","normalize"]);

function tainted(node: t.Node, names: Set<string>): boolean {
  const n = unwrapExpression(node);
  if (isRequestMember(n)) return true;
  if (t.isIdentifier(n)) return names.has(n.name);
  if (t.isBinaryExpression(n) && ["+","/"].includes(n.operator)) return tainted(n.left, names) || tainted(n.right, names);
  if (t.isTemplateLiteral(n)) return n.expressions.some(e => tainted(e, names));
  if (t.isCallExpression(n) && (t.isMemberExpression(n.callee) || t.isOptionalMemberExpression(n.callee))) {
    const prop = t.isIdentifier(n.callee.property) ? n.callee.property.name : "";
    return PATH_BUILDERS.has(prop) && n.arguments.some(a => !t.isSpreadElement(a) && tainted(a, names));
  }
  return false;
}

export const r7PathTraversalRule: Rule = {
  definition: R7_DEFINITION,
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
        const c = path.node.callee;
        if (!t.isMemberExpression(c) && !t.isOptionalMemberExpression(c)) return;
        const prop = t.isIdentifier(c.property) ? c.property.name : "";
        if (!FS_SINKS.has(prop)) return;
        const vulnerable = path.node.arguments.some(arg => !t.isSpreadElement(arg) && tainted(arg, names));
        if (!vulnerable) return;
        findings.push(makeFinding({
          file: file.path, line: path.node.loc?.start.line ?? 0, ruleId: "R7",
          ruleName: R7_DEFINITION.name, severity: "High", cwe: "CWE-22",
          status: "match", confidence: "high",
          evidence: ["request-controlled path data reaches a filesystem sink", `filesystem operation: ${prop}`, "safe-root containment was not proven"],
          issue: "Potential path traversal", source: file.source,
        }));
      },
    });
    return findings;
  },
};
