import crypto from "crypto";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { Finding, SecurityFlow, SecurityFlowEdge, SecurityFlowNode } from "@/types/findings";
import type { ParsedFile } from "../parser/parse";
import { memberChainToString, isRequestMember, isSensitiveDatabaseCall, nodeSource, unwrapExpression } from "./ast-utils";

function makeNode(id: string, type: SecurityFlowNode["type"], label: string, file: string, line?: number, code?: string): SecurityFlowNode {
  return { id, type, label, file, line, code };
}

function makeEdge(id: string, from: string, to: string, label: string, finding: Finding, vulnerable = false): SecurityFlowEdge {
  return { id, from, to, label, vulnerable, findingId: finding.id, ruleId: finding.ruleId };
}

function graphFingerprint(nodes: SecurityFlowNode[], edges: SecurityFlowEdge[]): string {
  const normalized = {
    nodes: nodes.map(({ id, type, label, file, line, code }) => ({ id, type, label, file, line, code })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.map(({ id, from, to, label, vulnerable, ruleId }) => ({ id, from, to, label, vulnerable, ruleId })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function finish(
  finding: Finding,
  title: string,
  confidence: "full" | "partial",
  nodes: SecurityFlowNode[],
  edges: SecurityFlowEdge[],
  vulnerableEdgeId?: string,
): SecurityFlow {
  return {
    id: `flow-${finding.id}`,
    title,
    confidence,
    nodes,
    edges,
    vulnerableEdgeId,
    fingerprint: graphFingerprint(nodes, edges),
  };
}

function lineOf(node: t.Node): number {
  return node.loc?.start.line ?? 0;
}

function routeLabel(path: import("@babel/traverse").NodePath<t.CallExpression>): string {
  const callee = path.node.callee;
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return "Endpoint";
  const method = t.isIdentifier(callee.property) ? callee.property.name.toUpperCase() : "HTTP";
  const first = path.node.arguments[0];
  return t.isStringLiteral(first) ? `${method} ${first.value}` : `${method} endpoint`;
}

function buildR1(finding: Finding, file: ParsedFile): SecurityFlow {
  const nodes: SecurityFlowNode[] = [];
  const edges: SecurityFlowEdge[] = [];
  let routeFound = false;
  let operationFound = false;

  traverse(file.ast, {
    CallExpression(path) {
      if (routeFound) return;
      const callee = path.node.callee;
      if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return;
      if (!t.isIdentifier(callee.property) || !/^(get|post|put|patch|delete|head|options)$/i.test(callee.property.name)) return;
      if ((path.node.loc?.start.line ?? 0) !== finding.line) return;

      routeFound = true;
      nodes.push(makeNode("n0", "entry", routeLabel(path), file.path, lineOf(path.node), nodeSource(file.source, path.node)));

      const handler = path.node.arguments[path.node.arguments.length - 1];
      if (t.isFunction(handler)) {
        nodes.push(makeNode("n1", "transform", "Route handler", file.path, lineOf(handler), nodeSource(file.source, handler).split("\n")[0]));
        edges.push(makeEdge("e0", "n0", "n1", "dispatches", finding));

        traverse(handler.body, {
          CallExpression(inner) {
            if (operationFound || !isSensitiveDatabaseCall(inner.node)) return;
            operationFound = true;
            nodes.push(makeNode("n2", "resource", "Sensitive data operation", file.path, lineOf(inner.node)));
            edges.push(makeEdge("e1", "n1", "n2", "sensitive operation without proven authorization", finding, true));
          },
        });
      }
    },
  });

  if (!routeFound) {
    nodes.push(
      makeNode("n0", "entry", "Endpoint handler", file.path, finding.line, finding.snippet),
      makeNode("n1", "decision", "Authorization boundary not proven", file.path, finding.line),
      makeNode("n2", "resource", "Sensitive operation", file.path, finding.line),
    );
    edges.push(
      makeEdge("e0", "n0", "n1", "authorization not proven", finding, true),
      makeEdge("e1", "n1", "n2", "continues to sensitive operation", finding),
    );
    return finish(finding, "Authorization flow", "partial", nodes, edges, "e0");
  }

  if (!operationFound) {
    nodes.push(makeNode("n2", "resource", "Sensitive operation", file.path, finding.line, finding.snippet));
    edges.push(makeEdge("e1", "n1", "n2", "sensitive operation", finding, true));
  }

  return finish(finding, "Authorization flow", operationFound ? "full" : "partial", nodes, edges, "e1");
}

function buildR2(finding: Finding, file: ParsedFile): SecurityFlow {
  let literal: t.StringLiteral | null = null;
  traverse(file.ast, {
    StringLiteral(path) {
      if (literal || lineOf(path.node) !== finding.line) return;
      if (path.node.value.length > 0) literal = path.node;
    },
  });

  const code = literal ? nodeSource(file.source, literal) : undefined;
  let secretName = "hardcoded secret";
  if (literal) {
    // The graph deliberately exposes the identifier but never the credential value.
    // A full binding resolver is unnecessary for the evidence model here.
    const lineText = file.source.split("\n")[finding.line - 1] ?? "";
    const assignment = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(lineText);
    if (assignment?.[1]) secretName = `${assignment[1]}: redacted secret`;
  }
  const nodes = [
    makeNode("n0", "file", file.path, file.path, finding.line),
    makeNode("n1", "secret", secretName, file.path, finding.line, code ? "[REDACTED]" : undefined),
  ];
  const edges = [makeEdge("e0", "n0", "n1", "contains credential material", finding, true)];
  return finish(finding, "Hardcoded secret flow", "full", nodes, edges, "e0");
}

function buildR3(finding: Finding, file: ParsedFile): SecurityFlow {
  let decodeNode: t.CallExpression | null = null;
  let decodedVar = "";
  let authUse: t.Node | null = null;

  traverse(file.ast, {
    CallExpression(path) {
      if (decodeNode) return;
      const callee = path.node.callee;
      if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.property) || callee.property.name !== "decode") return;
      if (lineOf(path.node) !== finding.line) return;
      decodeNode = path.node;
      const parent = path.parent;
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) decodedVar = parent.id.name;
    },
    MemberExpression(path) {
      if (!decodedVar || authUse) return;
      if (!t.isIdentifier(path.node.object) || path.node.object.name !== decodedVar) return;
      if (!t.isIdentifier(path.node.property)) return;
      if (/(role|admin|permission|authoriz|scope|userId|id)/i.test(path.node.property.name)) authUse = path.node;
    },
  });

  const nodes = [
    makeNode("n0", "request", "JWT token", file.path, finding.line),
    makeNode("n1", "transform", "jwt.decode()", file.path, finding.line),
    makeNode("n2", "decision", authUse ? `Authorization uses ${nodeSource(file.source, authUse)}` : "Authorization decision", file.path, authUse ? lineOf(authUse) : finding.line, authUse ? nodeSource(file.source, authUse) : undefined),
    makeNode("n3", "unknown", "Signature verification not proven", file.path, finding.line),
  ];
  const edges = [
    makeEdge("e0", "n0", "n1", "token decoded", finding),
    makeEdge("e1", "n1", "n2", "unverified claim reaches authorization", finding, true),
    makeEdge("e2", "n1", "n3", "verification not proven", finding),
  ];
  return finish(finding, "JWT trust flow", decodeNode && authUse ? "full" : "partial", nodes, edges, "e1");
}

function buildR4(finding: Finding, file: ParsedFile): SecurityFlow {
  let requestNode: SecurityFlowNode | null = null;
  let lookupNode: SecurityFlowNode | null = null;
  let routeNode: SecurityFlowNode | null = null;

  traverse(file.ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!routeNode && (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && t.isIdentifier(callee.property) && /^(get|post|put|patch|delete|head|options)$/i.test(callee.property.name)) {
        if (lineOf(path.node) <= finding.line) {
          routeNode = makeNode("n0", "entry", routeLabel(path), file.path, lineOf(path.node), nodeSource(file.source, path.node));
        }
      }

      if (!lookupNode && isSensitiveDatabaseCall(path.node)) {
        const requestArg = path.node.arguments.find(arg => isRequestMember(arg as t.Node));
        if (requestArg) {
          requestNode = makeNode("n1", "request", memberChainToString(unwrapExpression(requestArg as t.Node)), file.path, lineOf(requestArg as t.Node), nodeSource(file.source, requestArg as t.Node));
          lookupNode = makeNode("n2", "resource", "Resource lookup", file.path, lineOf(path.node));
        }
      }
    },
  });

  const nodes = [
    routeNode ?? makeNode("n0", "entry", "Endpoint", file.path, finding.line),
    requestNode ?? makeNode("n1", "request", "request-controlled identifier", file.path, finding.line),
    lookupNode ?? makeNode("n2", "resource", "Resource lookup", file.path, finding.line, finding.snippet),
    makeNode("n3", "decision", "Ownership constraint not proven", file.path, lookupNode?.line ?? finding.line),
  ];

  const edges = [
    makeEdge("e0", "n0", "n1", "request identifier", finding),
    makeEdge("e1", "n1", "n2", "identifier reaches lookup", finding, true),
    makeEdge("e2", "n2", "n3", "ownership check", finding),
  ];

  return finish(finding, "Object access flow", requestNode && lookupNode ? "full" : "partial", nodes, edges, "e1");
}

function buildR5(finding: Finding, file: ParsedFile): SecurityFlow {
  let sourceNode: SecurityFlowNode | null = null;
  let sinkNode: SecurityFlowNode | null = null;

  traverse(file.ast, {
    MemberExpression(path) {
      if (!sourceNode && isRequestMember(path.node)) {
        sourceNode = makeNode("n0", "request", memberChainToString(path.node), file.path, lineOf(path.node), nodeSource(file.source, path.node));
      }
    },
    CallExpression(path) {
      if (sinkNode || lineOf(path.node) !== finding.line) return;
      const c = path.node.callee;
      const label = t.isIdentifier(c) ? c.name : (t.isMemberExpression(c) && t.isIdentifier(c.property) ? c.property.name : "");
      if (/^(eval|exec|execSync|spawn|spawnSync)$/i.test(label)) {
        sinkNode = makeNode("n2", "sink", `${label}()`, file.path, lineOf(path.node));
      }
    },
    NewExpression(path) {
      if (sinkNode || lineOf(path.node) !== finding.line) return;
      if (t.isIdentifier(path.node.callee) && path.node.callee.name === "Function") {
        sinkNode = makeNode("n2", "sink", "new Function()", file.path, lineOf(path.node));
      }
    },
  });

  const nodes = [
    sourceNode ?? makeNode("n0", "request", "request-controlled input", file.path, finding.line),
    makeNode("n1", "transform", "tainted value", file.path, finding.line),
    sinkNode ?? makeNode("n2", "sink", "dynamic execution sink", file.path, finding.line, finding.snippet),
  ];
  const edges = [
    makeEdge("e0", "n0", "n1", "value propagates", finding),
    makeEdge("e1", "n1", "n2", "untrusted input reaches execution sink", finding, true),
  ];
  return finish(finding, "Dynamic execution flow", sourceNode && sinkNode ? "full" : "partial", nodes, edges, "e1");
}

export function buildSecurityFlow(finding: Finding, file: ParsedFile): SecurityFlow {
  switch (finding.ruleId) {
    case "R1": return buildR1(finding, file);
    case "R2": return buildR2(finding, file);
    case "R3": return buildR3(finding, file);
    case "R4": return buildR4(finding, file);
    case "R5": return buildR5(finding, file);
  }
}
