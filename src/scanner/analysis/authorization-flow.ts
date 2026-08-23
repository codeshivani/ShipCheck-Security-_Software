import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { memberChainToString, traverseNode, unwrapExpression } from "./ast-utils";

export interface AuthorizationFlowSummary {
  authenticated: boolean;
  resourceAuthorized: boolean;
  requestResourceValues: string[];
  identityValues: string[];
  ownershipEvidence: string[];
}

function chain(node: t.Node): string {
  return memberChainToString(unwrapExpression(node));
}

function isRequestResource(node: t.Node): boolean {
  const value = chain(node).toLowerCase();
  return /^(req|request|ctx\.request|context\.request)\.(params|query|body)(\.|$)/.test(value);
}

function isIdentity(node: t.Node): boolean {
  const value = chain(node).toLowerCase();
  return /^(req|request|ctx\.state|context\.state)\.(user|auth|session)\.(id|_id|sub|userid|user_id)$/.test(value) ||
    /^(currentuser|current_user|user|authuser|authenticateduser)\.(id|_id|sub|userid|user_id)$/.test(value);
}

function isOwnershipField(name: string): boolean {
  return /^(user_?id|owner_?id|tenant_?id|account_?id|created_?by|createdby)$/i.test(name);
}

function isDatabaseLookup(node: t.CallExpression): boolean {
  const callee = node.callee;
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return false;
  const name = t.isIdentifier(callee.property) ? callee.property.name : t.isStringLiteral(callee.property) ? callee.property.value : "";
  return /^(find|findOne|findById|findByPk|findFirst|findUnique|get|query|select)$/i.test(name);
}

function isIdentityLikeExpression(node: t.Node, identities: Set<string>): boolean {
  const normalized = chain(node).toLowerCase();
  // A bare name such as `userId` is not enough evidence by itself: it may be
  // an unrelated value. It becomes identity evidence only after we trace it
  // back to a recognized authenticated identity expression.
  return isIdentity(node) || identities.has(normalized);
}

function isRequestLikeExpression(node: t.Node, resources: Set<string>): boolean {
  const normalized = chain(node).toLowerCase();
  return isRequestResource(node) || resources.has(normalized);
}

function expressionContainsIdentity(node: t.Node, identities: Set<string>): boolean {
  if (isIdentityLikeExpression(node, identities)) return true;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === "object" && "type" in item && expressionContainsIdentity(item as t.Node, identities))) return true;
    } else if (value && typeof value === "object" && "type" in value) {
      if (expressionContainsIdentity(value as t.Node, identities)) return true;
    }
  }
  return false;
}

function expressionContainsResource(node: t.Node, resources: Set<string>): boolean {
  if (isRequestLikeExpression(node, resources)) return true;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === "object" && "type" in item && expressionContainsResource(item as t.Node, resources))) return true;
    } else if (value && typeof value === "object" && "type" in value) {
      if (expressionContainsResource(value as t.Node, resources)) return true;
    }
  }
  return false;
}

function comparisonConnectsIdentityAndResource(node: t.Node, identities: Set<string>, resources: Set<string>): boolean {
  if (t.isBinaryExpression(node) && ["===", "==", "!==", "!="].includes(node.operator)) {
    return (
      (expressionContainsIdentity(node.left, identities) && expressionContainsResource(node.right, resources)) ||
      (expressionContainsIdentity(node.right, identities) && expressionContainsResource(node.left, resources))
    );
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === "object" && "type" in item && comparisonConnectsIdentityAndResource(item as t.Node, identities, resources))) return true;
    } else if (value && typeof value === "object" && "type" in value) {
      if (comparisonConnectsIdentityAndResource(value as t.Node, identities, resources)) return true;
    }
  }
  return false;
}

function statementRejectsAccess(node: t.Node): boolean {
  let rejected = false;
  const visit = (current: t.Node) => {
    if (rejected) return;
    if (t.isCallExpression(current) && t.isMemberExpression(current.callee) && t.isIdentifier(current.callee.property) && /^(status|sendStatus)$/.test(current.callee.property.name)) {
      if (current.arguments.some((arg) => t.isNumericLiteral(arg) && (arg.value === 401 || arg.value === 403))) {
        rejected = true;
        return;
      }
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      const value = (current as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item === "object" && "type" in item) visit(item as t.Node);
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value as t.Node);
      }
      if (rejected) return;
    }
  };
  visit(node);
  return rejected;
}

/**
 * Lightweight intra-function authorization data-flow analysis.
 * It proves only common, evidence-backed patterns; unknown control flow stays
 * unknown instead of being treated as secure.
 */
export function analyzeAuthorizationFlow(node: t.Node): AuthorizationFlowSummary {
  const requestResources = new Set<string>();
  const identities = new Set<string>();
  const ownershipEvidence: string[] = [];
  let authenticated = false;
  let resourceAuthorized = false;
  let resourceLookup = false;

  traverseNode(node, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || !path.node.init) return;
      const name = path.node.id.name.toLowerCase();
      const init = path.node.init;
      const normalized = chain(init).toLowerCase();
      if (isRequestResource(init) || requestResources.has(normalized)) requestResources.add(name);
      if (isIdentity(init) || identities.has(normalized)) identities.add(name);
    },

    AssignmentExpression(path) {
      if (!t.isIdentifier(path.node.left) || !path.node.right) return;
      const name = path.node.left.name.toLowerCase();
      const right = path.node.right;
      const normalized = chain(right).toLowerCase();
      if (isRequestResource(right) || requestResources.has(normalized)) requestResources.add(name);
      if (isIdentity(right) || identities.has(normalized)) identities.add(name);
    },

    CallExpression(path) {
      const callee = path.node.callee;
      const calleeName = t.isIdentifier(callee)
        ? callee.name
        : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
          ? callee.property.name
          : "";

      if (/^(authenticate|isAuthenticated|requireAuth|ensureAuth|checkAuth|verifyToken|verifyJwt|validateToken|assertAuthenticated|getServerSession|requireUser|requireMfa)$/i.test(calleeName)) {
        authenticated = true;
      }

      if (/^(authorize|authorizeRequest|authorizeResource|checkPermission|hasPermission|assertAuthorized|assertPermission|can|canAccess|isAllowed|enforceAccess|checkAccess)$/i.test(calleeName)) {
        const hasIdentity = path.node.arguments.some((arg) => expressionContainsIdentity(arg as t.Node, identities));
        const hasResource = path.node.arguments.some((arg) => expressionContainsResource(arg as t.Node, requestResources));
        if (hasIdentity && hasResource) {
          resourceAuthorized = true;
          ownershipEvidence.push(`authorization call ${calleeName} receives identity and request resource data`);
        }
      }

      if (isDatabaseLookup(path.node)) {
        const requestArgs = path.node.arguments.filter((arg) => isRequestLikeExpression(arg as t.Node, requestResources));
        if (requestArgs.length > 0) {
          resourceLookup = true;
          for (const arg of requestArgs) requestResources.add(chain(arg as t.Node).toLowerCase());
        }
      }
    },

    IfStatement(path) {
      const connects = comparisonConnectsIdentityAndResource(path.node.test, identities, requestResources);
      const rejects = statementRejectsAccess(path.node.consequent) || (path.node.alternate ? statementRejectsAccess(path.node.alternate) : false);
      if (connects && rejects) {
        authenticated = true;
        resourceAuthorized = true;
        ownershipEvidence.push("identity is compared with request-controlled resource data and access is rejected on mismatch");
      }
    },

    ObjectProperty(path) {
      const key = t.isIdentifier(path.node.key) ? path.node.key.name : t.isStringLiteral(path.node.key) ? path.node.key.value : "";
      if (!isOwnershipField(key)) return;
      if (isIdentityLikeExpression(path.node.value, identities) || isIdentity(path.node.value)) {
        resourceAuthorized = true;
        ownershipEvidence.push(`query constrains ${key} to the authenticated identity`);
      }
    },
  });

  return {
    authenticated,
    resourceAuthorized,
    requestResourceValues: resourceLookup ? [...requestResources] : [],
    identityValues: [...identities],
    ownershipEvidence: [...new Set(ownershipEvidence)],
  };
}
