import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import type { RepositoryAnalysis } from "../analysis/repository";
import { analyzeAuthorizationFlow } from "../analysis/authorization-flow";
import { analyzeFunctionNode, analyzeInterproceduralFunction } from "../analysis/interprocedural-flow";
import { isRequestMember, unwrapExpression } from "../analysis/ast-utils";

export const R4_DEFINITION: RuleDefinition = {
  id: "R4",
  name: "Potential IDOR",
  cwe: "CWE-639",
  severity: "High",
  description: "A request-controlled identifier flows into a database lookup without evidence that the requested resource is constrained to the authenticated identity or tenant.",
};

function finding(file: ParsedFile, line: number, evidence: string[], status: "match" | "review" = "match", confidence: "high" | "medium" = "high"): Finding {
  return makeFinding({ file: file.path, line, ruleId: "R4", ruleName: R4_DEFINITION.name, severity: R4_DEFINITION.severity, cwe: R4_DEFINITION.cwe, status, confidence, evidence, issue: "Potential insecure direct object reference (IDOR)", source: file.source });
}

function routeRegistration(path: import("@babel/traverse").NodePath<t.CallExpression>): boolean {
  const c = path.node.callee;
  if (!t.isMemberExpression(c) && !t.isOptionalMemberExpression(c)) return false;
  if (!t.isIdentifier(c.property)) return false;
  if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(c.property.name.toLowerCase())) return false;
  return t.isIdentifier(c.object);
}

function directResource(node: t.Node): boolean {
  const n = unwrapExpression(node);
  if (isRequestMember(n)) return true;
  if (t.isObjectExpression(n)) return n.properties.some(p => t.isObjectProperty(p) && directResource(p.value));
  if (t.isArrayExpression(n)) return n.elements.some(e => !!e && directResource(e));
  return false;
}

export const r4IdorRule: Rule = {
  definition: R4_DEFINITION,

  analyze(file: ParsedFile, repository?: RepositoryAnalysis): Finding[] {
    if (!repository) {
      const findings: Finding[] = [];
      traverse(file.ast, {
        Function(path) {
          const flow = analyzeAuthorizationFlow(path.node.body);
          if (!flow.resourceAuthorized && flow.requestResourceValues.length) {
            findings.push(finding(file, path.node.loc?.start.line ?? 0, ["request-controlled identifier reaches a database/resource operation", "resource-level ownership was not proven"], flow.authenticated ? "match" : "review", flow.authenticated ? "high" : "medium"));
          }
        },
      });
      return dedupeFindings(findings);
    }

    const findings: Finding[] = [];
    const analyzeEntry = (handler: t.Function, line: number, handlerFilePath = file.path) => {
      const flow = analyzeFunctionNode(repository, handlerFilePath, handler);
      const vulnerableLookup = flow.lookups.find(l => l.usesResource && !l.constrainedToIdentity);
      if (!vulnerableLookup) return;
      const evidence = [
        "request-controlled identifier flows into a database lookup",
        "cross-function analysis could not prove a resource-to-identity ownership constraint",
        flow.visitedFunctions.length > 1 ? `analyzed ${flow.visitedFunctions.length} function(s) across the repository` : "analysis remained within the entry-point function",
      ];
      findings.push(finding(file, line, evidence, flow.authenticated ? "match" : "review", flow.authenticated ? "high" : "medium"));
    };

    traverse(file.ast, {
      CallExpression(path) {
        if (!routeRegistration(path)) return;
        const args = path.node.arguments;
        const handlerArg = args[args.length - 1];
        const record = !t.isFunction(handlerArg) && t.isIdentifier(handlerArg)
          ? repository.resolveFunction(file.path, handlerArg.name)
          : null;
        const handler = t.isFunction(handlerArg) ? handlerArg : record?.node ?? null;
        if (handler) analyzeEntry(handler, path.node.loc?.start.line ?? 0, record?.filePath ?? file.path);
      },
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!t.isFunctionDeclaration(decl) || !decl.id) return;
        if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(decl.id.name)) return;
        analyzeEntry(decl, decl.loc?.start.line ?? 0);
      },
    });

    return dedupeFindings(findings);
  },
};

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.file}:${f.line}:${f.ruleId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
