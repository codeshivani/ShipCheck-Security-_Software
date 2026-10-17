import * as t from "@babel/types";
import traverse, { type NodePath } from "@babel/traverse";

/**
 * Babel 8 only permits a root traversal of a Program/File. Several analysis
 * helpers intentionally inspect a function body in isolation, so wrap that
 * node in a synthetic file before visiting it.
 */
export function traverseNode(node: t.Node, visitors: Parameters<typeof traverse>[1]): void {
  const statement = t.isStatement(node) ? node : t.expressionStatement(node as t.Expression);
  traverse(t.file(t.program([statement])), visitors);
}

export function unwrapExpression(node: t.Node): t.Node {
  let current = node;
  while (
    t.isTSAsExpression(current) ||
    t.isTSNonNullExpression(current) ||
    t.isTSSatisfiesExpression(current) ||
    t.isTypeCastExpression(current) ||
    t.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function memberChainToString(node: t.Node): string {
  const current = unwrapExpression(node);
  if (t.isIdentifier(current)) return current.name;
  if (!t.isMemberExpression(current) && !t.isOptionalMemberExpression(current)) return "";

  const object = memberChainToString(current.object);
  if (!object) return "";
  if (!current.computed && t.isIdentifier(current.property)) return `${object}.${current.property.name}`;
  if (t.isStringLiteral(current.property) || t.isNumericLiteral(current.property)) {
    return `${object}.${current.property.value}`;
  }
  return `${object}.?`;
}

export function nodeSource(source: string, node: t.Node): string {
  if (typeof node.start !== "number" || typeof node.end !== "number") return "";
  return source.slice(node.start, node.end);
}

export function isRequestMember(node: t.Node): boolean {
  const chain = memberChainToString(node).toLowerCase();
  return /^(req|request|ctx\.request|context\.request)\.(params|query|body|cookies|headers)(\.|$)/.test(chain);
}

export function isUserIdentityMember(node: t.Node): boolean {
  const chain = memberChainToString(node).toLowerCase();
  return /^(req|request|ctx\.state|context\.state)\.(user|auth|session)(\.|$)/.test(chain) ||
    /^(currentuser|current_user|user|authuser|authenticateduser)\.(id|_id|sub|userId|user_id)$/.test(chain);
}

export function isLikelyAuthCall(node: t.CallExpression): boolean {
  const callee = node.callee;
  const name = t.isIdentifier(callee)
    ? callee.name
    : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
      ? callee.property.name
      : "";
  return /^(authenticate|isAuthenticated|requireAuth|ensureAuth|checkAuth|verifyToken|verifyJwt|validateToken|authorize|authorizeRequest|checkPermission|hasPermission|assertAuthenticated|assertAuthorized|assertRole|requireRole|requirePermission|requireUser|requireMfa|guard|protect|withAuth|withAuthorization|currentUser|getCurrentUser|getServerSession)$/i.test(name);
}

export function isLikelyAuthIdentifier(name: string): boolean {
  // Used only as positive evidence for route middleware. Avoid treating generic
  // values such as "session", "user", or "auth" as authorization proof.
  return /^(requireAuth|requireRole|requirePermission|authMiddleware|authorizationMiddleware|authenticateMiddleware|authorizeMiddleware|permissionMiddleware|roleMiddleware|authGuard|authorizationGuard|permissionGuard|roleGuard|protectRoute|withAuth|withAuthorization)$/i.test(name) ||
    /^(auth|authorize|authorization|permission|guard|protect|role).*(middleware|guard|check|policy)$/i.test(name);
}

export function isSensitiveDatabaseCall(node: t.CallExpression): boolean {
  const callee = node.callee;
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return false;
  const property = !callee.computed && t.isIdentifier(callee.property)
    ? callee.property.name
    : t.isStringLiteral(callee.property)
      ? callee.property.value
      : "";
  if (property === "get" || property === "all") {
    return /(prisma|sequelize|mongoose|knex|typeorm|repository|repo|model|database|\bdb\b)/i.test(memberChainToString(callee.object));
  }
  return /^(find|findOne|findById|findByPk|findFirst|findUnique|findMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|findByIdAndDelete|findOneAndRemove|create|createMany|update|updateMany|upsert|delete|deleteMany|destroy|remove|save|insert|replace|query|aggregate|select)$/i.test(property);
}

export function functionBody(path: NodePath<t.Node>): t.Node | null {
  const fn = path.getFunctionParent();
  return fn ? fn.node.body : null;
}

export function hasAuthGuardSemantics(node: t.Node): boolean {
  let found = false;
  const visit = (n: t.Node) => {
    if (found) return;
    if (t.isCallExpression(n) && isLikelyAuthCall(n)) {
      found = true;
      return;
    }
    if (t.isIfStatement(n)) {
      const test = nodeSourceSafe(n.test);
      if (/(req|request|ctx|context|user|session|auth).*(not|undefined|null|false|unauth|unauthoriz|forbidden|permission|role)|!\s*(req|request|ctx|context|user|session|auth)/i.test(test)) {
        found = true;
        return;
      }
    }
    if (t.isCallExpression(n) && t.isMemberExpression(n.callee) && t.isIdentifier(n.callee.property)) {
      if (/^(status|sendStatus)$/.test(n.callee.property.name) && n.arguments.some((a) => t.isNumericLiteral(a) && (a.value === 401 || a.value === 403))) {
        found = true;
        return;
      }
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      const value = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item === "object" && "type" in item) visit(item as t.Node);
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value as t.Node);
      }
      if (found) return;
    }
  };
  visit(node);
  return found;
}

function nodeSourceSafe(node: t.Node): string {
  if (t.isIdentifier(node)) return node.name;
  if (t.isUnaryExpression(node) && node.operator === "!") return `!${nodeSourceSafe(node.argument)}`;
  if (t.isMemberExpression(node)) return memberChainToString(node);
  if (t.isBinaryExpression(node)) return `${nodeSourceSafe(node.left)} ${node.operator} ${nodeSourceSafe(node.right)}`;
  if (t.isNullLiteral(node)) return "null";
  if (t.isStringLiteral(node)) return node.value;
  return "";
}

export function getDecoratorNames(node: t.Node): string[] {
  if (!t.isClassMethod(node) && !t.isClassPrivateMethod(node) && !t.isClassProperty(node) && !t.isClassPrivateProperty(node)) return [];
  const decorators = node.decorators ?? [];
  return decorators.flatMap((decorator) => {
    const expression = unwrapExpression(decorator.expression);
    if (t.isIdentifier(expression)) return [expression.name];
    if (t.isCallExpression(expression)) {
      if (t.isIdentifier(expression.callee)) return [expression.callee.name];
      if (t.isMemberExpression(expression.callee) && t.isIdentifier(expression.callee.property)) return [expression.callee.property.name];
    }
    return [];
  });
}
