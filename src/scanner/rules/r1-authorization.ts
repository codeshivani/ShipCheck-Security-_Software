import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import type { RepositoryAnalysis } from "../analysis/repository";
import {
  getDecoratorNames,
  hasAuthGuardSemantics,
  isLikelyAuthIdentifier,
  isRequestMember,
  isSensitiveDatabaseCall,
  nodeSource,
  traverseNode,
} from "../analysis/ast-utils";
import { analyzeAuthorizationFlow } from "../analysis/authorization-flow";
import { analyzeFunctionNode } from "../analysis/interprocedural-flow";

export const R1_DEFINITION: RuleDefinition = {
  id: "R1",
  name: "Missing Endpoint Authorization",
  cwe: "CWE-862",
  severity: "Critical",
  description:
    "Route/handler code performs sensitive reads/writes without a recognizable authorization or ownership guard.",
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);
const ROUTER_OBJECT_PATTERN = /^(app|router|fastify|server|api|route|routes|\w*(router|server|app|api))$/i;
const ROUTE_DECORATORS = new Set(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head"]);
const AUTH_DECORATORS = new Set(["UseGuards", "Auth", "Authenticated", "Authorize", "Roles", "Permissions", "RequireAuth", "RequireRole", "AllowAuthenticated"]);

function isRouteRegistration(path: import("@babel/traverse").NodePath<t.CallExpression>): boolean {
  const callee = path.node.callee;
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return false;
  if (!t.isIdentifier(callee.property) || !HTTP_METHODS.has(callee.property.name.toLowerCase())) return false;
  if (!t.isIdentifier(callee.object)) return false;
  return ROUTER_OBJECT_PATTERN.test(callee.object.name);
}

function localFunctionNamesWithAuth(file: ParsedFile): Set<string> {
  const names = new Set<string>();
  traverse(file.ast, {
    FunctionDeclaration(path) {
      if (path.node.id && hasAuthGuardSemantics(path.node.body)) names.add(path.node.id.name);
    },
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || !path.node.init || !t.isFunction(path.node.init)) return;
      if (hasAuthGuardSemantics(path.node.init.body)) names.add(path.node.id.name);
    },
  });
  return names;
}

function hasRecognizedRouteGuard(
  file: ParsedFile,
  args: readonly t.Node[],
  handler: t.Function,
  handlerFilePath: string,
  localAuthNames: Set<string>,
  repository?: RepositoryAnalysis,
): boolean {
  if (args.some((arg) => {
    if (!t.isIdentifier(arg)) return false;
    if (isLikelyAuthIdentifier(arg.name) || localAuthNames.has(arg.name)) return true;

    return repository?.isAuthFunction(file.path, arg.name) ?? false;
  })) return true;
  if (args.some((arg) => hasAuthGuardSemantics(arg))) return true;
  if (hasAuthGuardSemantics(handler.body)) return true;

  // Resource-level authorization can be proven across local/imported calls.
  // This is deliberately positive-evidence-only: an unresolved call never
  // becomes proof of authorization.
  const flow = repository
    ? analyzeFunctionNode(repository, handlerFilePath, handler)
    : analyzeAuthorizationFlow(handler.body);
  return flow.authenticated || flow.resourceAuthorized;
}

function hasSensitiveOperation(file: ParsedFile, node: t.Node): boolean {
  let found = false;
  traverseNode(node, {
    CallExpression(path) {
      if (isSensitiveDatabaseCall(path.node)) found = true;
    },
  });
  return found || /(prisma|sequelize|mongoose|knex|typeorm|repository|model)\./i.test(nodeSource(file.source, node));
}

function hasRequestControlledData(node: t.Node): boolean {
  let found = false;
  traverseNode(node, {
    MemberExpression(path) {
      if (isRequestMember(path.node)) found = true;
    },
    OptionalMemberExpression(path) {
      if (isRequestMember(path.node)) found = true;
    },
  });
  return found;
}

function finding(file: ParsedFile, line: number, evidence: string[], issue: string, confidence: "high" | "medium" = "medium", status: "match" | "review" = "review"): Finding {
  return makeFinding({
    file: file.path,
    line,
    ruleId: "R1",
    ruleName: R1_DEFINITION.name,
    severity: R1_DEFINITION.severity,
    cwe: R1_DEFINITION.cwe,
    status,
    confidence,
    evidence,
    issue,
    source: file.source,
  });
}

export const r1AuthorizationRule: Rule = {
  definition: R1_DEFINITION,

  analyze(file: ParsedFile, repository?: RepositoryAnalysis): Finding[] {
    const findings: Finding[] = [];
    const localAuthNames = localFunctionNamesWithAuth(file);

    traverse(file.ast, {
      CallExpression(path) {
        if (!isRouteRegistration(path)) return;
        const args = path.node.arguments;
        if (args.length < 2) return;
        const handlerArg = args[args.length - 1];
        let handler: t.Function | null = t.isFunction(handlerArg) ? handlerArg : null;
        let handlerFilePath = file.path;
        if (!handler && repository && t.isIdentifier(handlerArg)) {
          const record = repository.resolveFunction(file.path, handlerArg.name);
          handler = record?.node ?? null;
          handlerFilePath = record?.filePath ?? file.path;
        }
        if (!handler) return;
        const interprocedural = repository ? analyzeFunctionNode(repository, handlerFilePath, handler) : null;
        const sensitive = hasSensitiveOperation(file, handler.body) || !!interprocedural?.lookups.length;
        if (!sensitive) return;
        if (hasRecognizedRouteGuard(file, args.slice(1, -1), handler, handlerFilePath, localAuthNames, repository)) return;

        const directRequestAccess = hasRequestControlledData(handler.body);
        findings.push(
          finding(
            file,
            path.node.loc?.start.line ?? 0,
            [
              "route handler performs a sensitive data operation",
              "no authorization guard with recognizable semantics found in middleware chain or handler",
              directRequestAccess
                ? "request-controlled data is used directly by the handler"
                : "authorization may be implemented in another module",
            ],
            "Potential missing authorization on route handler",
            directRequestAccess ? "high" : "medium",
            directRequestAccess ? "match" : "review",
          )
        );
      },

      ClassMethod(path) {
        const decorators = getDecoratorNames(path.node);
        const isRoute = decorators.some((name) => ROUTE_DECORATORS.has(name));
        if (!isRoute || !hasSensitiveOperation(file, path.node.body)) return;
        if (decorators.some((name) => AUTH_DECORATORS.has(name)) || hasAuthGuardSemantics(path.node.body)) return;

        findings.push(
          finding(
            file,
            path.node.loc?.start.line ?? 0,
            [
              `route decorator found: @${decorators.find((name) => ROUTE_DECORATORS.has(name))}`,
              "method performs a sensitive data operation",
              "no authorization decorator or in-method authorization guard detected",
            ],
            "Potential missing authorization on controller method",
          )
        );
      },

      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!t.isFunctionDeclaration(decl)) return;
        const name = decl.id?.name ?? "";
        if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(name)) return;
        if (!hasSensitiveOperation(file, decl.body)) return;
        if (hasAuthGuardSemantics(decl.body)) return;

        findings.push(
          finding(
            file,
            decl.loc?.start.line ?? 0,
            [
              `exported ${name} handler performs a sensitive data operation`,
              "no in-handler authorization guard detected",
              "this is a review candidate because middleware or wrapper authorization may live outside the handler",
            ],
            `Potential missing authorization on ${name} route handler`,
          )
        );
      },
    });

    return findings;
  },
};
