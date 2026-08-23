import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { Finding, RuleDefinition } from "@/types/findings";
import { ParsedFile } from "../parser/parse";
import { makeFinding } from "../findings/factory";
import { Rule } from "./types";
import { traverseNode } from "../analysis/ast-utils";

export const R3_DEFINITION: RuleDefinition = {
  id: "R3",
  name: "Unsafe JWT Handling",
  cwe: "CWE-347",
  severity: "High",
  description: "Unverified JWT data is used in an authentication or authorization decision instead of verified data.",
};

const AUTHZ_PROPERTY_PATTERN = /^(role|roles|isAdmin|admin|permission|permissions|authorization|scope|userId|user_id|id|sub)$/i;

function isJwtDecode(path: import("@babel/traverse").NodePath<t.CallExpression>): boolean {
  const callee = path.node.callee;
  return t.isMemberExpression(callee)
    && t.isIdentifier(callee.property)
    && callee.property.name === "decode"
    && t.isIdentifier(callee.object)
    && /jwt|token/i.test(callee.object.name);
}

function isJwtVerify(path: import("@babel/traverse").NodePath<t.CallExpression>): boolean {
  const callee = path.node.callee;
  return t.isMemberExpression(callee)
    && t.isIdentifier(callee.property)
    && callee.property.name === "verify"
    && t.isIdentifier(callee.object)
    && /jwt|token/i.test(callee.object.name);
}

function source(file: ParsedFile, node: t.Node): string {
  if (typeof node.start !== "number" || typeof node.end !== "number") return "";
  return file.source.slice(node.start, node.end);
}

function addFinding(file: ParsedFile, line: number, status: "match" | "review", confidence: "high" | "medium", evidence: string[], issue: string): Finding {
  return makeFinding({
    file: file.path,
    line,
    ruleId: "R3",
    ruleName: R3_DEFINITION.name,
    severity: R3_DEFINITION.severity,
    cwe: R3_DEFINITION.cwe,
    status,
    confidence,
    evidence,
    issue,
    source: file.source,
  });
}

export const r3JwtRule: Rule = {
  definition: R3_DEFINITION,

  analyze(file: ParsedFile): Finding[] {
    const findings: Finding[] = [];
    const seen = new Set<string>();

    traverse(file.ast, {
      CallExpression(path) {
        if (!isJwtDecode(path)) return;

        const line = path.node.loc?.start.line ?? 0;
        let decodedVar: string | null = null;
        let decodedExpression: t.Node = path.node;

        // Unwrap TS assertions/parentheses.
        let current: import("@babel/traverse").NodePath = path;
        while (current.parentPath && (
          t.isTSAsExpression(current.parent) ||
          t.isTSNonNullExpression(current.parent) ||
          t.isTSSatisfiesExpression(current.parent) ||
          t.isParenthesizedExpression(current.parent)
        )) {
          current = current.parentPath;
        }

        const parent = current.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          decodedVar = parent.id.name;
        } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
          decodedVar = parent.left.name;
        } else {
          decodedExpression = current.node;
        }

        const fnParent = path.getFunctionParent();
        const scopeNode = fnParent?.node ?? file.ast.program;
        let usedForAuthz = false;
        let verifyUsesSameToken = false;
        let verifyUsesDecodedValue = false;

        // Track whether this decoded variable is used in an auth-sensitive property,
        // comparison, assignment to req.user, or a common authorization call.
        traverseNode(scopeNode as t.Node, {
          MemberExpression(inner) {
            if (!decodedVar || !t.isIdentifier(inner.node.object) || inner.node.object.name !== decodedVar) return;
            if (!t.isIdentifier(inner.node.property)) return;
            if (AUTHZ_PROPERTY_PATTERN.test(inner.node.property.name)) {
              usedForAuthz = true;
            }
          },
          CallExpression(inner) {
            const callee = inner.node.callee;
            const name = t.isIdentifier(callee)
              ? callee.name
              : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
                ? callee.property.name
                : "";

            if (isJwtVerify(inner)) {
              const decodeArg = path.node.arguments[0];
              const verifyArg = inner.node.arguments[0];
              if (decodeArg && verifyArg && source(file, decodeArg as t.Node) === source(file, verifyArg as t.Node)) {
                verifyUsesSameToken = true;
              }
              if (decodedVar && inner.node.arguments.some(a => t.isIdentifier(a) && a.name === decodedVar)) {
                verifyUsesDecodedValue = true;
              }
            }

            if (decodedVar && /^(authorize|authorizeRequest|checkPermission|hasPermission|assertAuthorized|requireRole|requirePermission|can|canAccess|isAllowed)$/i.test(name)) {
              if (inner.node.arguments.some(a => t.isIdentifier(a) && a.name === decodedVar)) {
                usedForAuthz = true;
                }
            }
          },
          AssignmentExpression(inner) {
            if (!decodedVar || !t.isIdentifier(inner.node.left) || inner.node.left.name !== decodedVar) return;
            // If the same variable is later replaced by jwt.verify(), that is
            // positive evidence for verification.
            if (isJwtVerifyPath(inner.right)) verifyUsesDecodedValue = true;
          },
        });

        if (!usedForAuthz) return;

        // A decode() result is safe only when the actual value consumed by the
        // authorization decision is proven to originate from verify(). A verify()
        // somewhere else in the function is not enough.
        const provenVerified = verifyUsesSameToken && verifyUsesDecodedValue;
        const key = `${file.path}:${line}:${decodedVar ?? source(file, decodedExpression)}`;
        if (seen.has(key)) return;
        seen.add(key);

        if (provenVerified) return;

        const status = verifyUsesSameToken ? "review" : "match";
        const confidence = verifyUsesSameToken ? "medium" : "high";

        findings.push(addFinding(
          file,
          line,
          status,
          confidence,
          [
            "jwt.decode() produces token claims without signature verification",
            decodedVar ? `decoded value '${decodedVar}' participates in an authorization-sensitive use` : "decoded value participates in an authorization-sensitive use",
            verifyUsesSameToken
              ? "jwt.verify() exists for the same token, but this decoded value is not proven to be the verified value"
              : "no proof that the value used for authorization was produced by jwt.verify()",
          ],
          "Unverified JWT data used for authorization",
        ));
      },
    });

    return findings;
  },
};

function isJwtVerifyPath(node: t.Node): boolean {
  const current = node;
  return t.isCallExpression(current) && isJwtVerifyLike(current.callee);
}

function isJwtVerifyLike(callee: t.Node): boolean {
  return t.isMemberExpression(callee)
    && t.isIdentifier(callee.property)
    && callee.property.name === "verify"
    && t.isIdentifier(callee.object)
    && /jwt|token/i.test(callee.object.name);
}
