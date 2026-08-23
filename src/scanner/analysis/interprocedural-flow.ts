import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { RepositoryAnalysis, FunctionRecord } from "./repository";
import { isRequestMember, memberChainToString, traverseNode, unwrapExpression } from "./ast-utils";

export type FlowRole = "resource" | "identity" | "tainted";

export interface FlowLookup {
  filePath: string;
  line: number;
  method: string;
  usesResource: boolean;
  constrainedToIdentity: boolean;
}

export interface FlowSink {
  filePath: string;
  line: number;
  label: string;
}

export interface InterproceduralFlowResult {
  authenticated: boolean;
  resourceAuthorized: boolean;
  lookups: FlowLookup[];
  sinks: FlowSink[];
  visitedFunctions: string[];
}

interface State {
  roles: Map<string, Set<FlowRole>>;
  authenticated: boolean;
  resourceAuthorized: boolean;
}

const DB_METHODS = new Set(["findById", "findByPk", "findOne", "findFirst", "findUnique", "find", "get"]);
const AUTH_NAMES = /^(authenticate|isAuthenticated|requireAuth|ensureAuth|checkAuth|verifyToken|verifyJwt|validateToken|assertAuthenticated|getServerSession|requireUser|requireMfa)$/i;
const AUTHZ_NAMES = /^(authorize|authorizeRequest|authorizeResource|checkPermission|hasPermission|assertAuthorized|assertPermission|can|canAccess|isAllowed|enforceAccess|checkAccess)$/i;
const OWNERSHIP_FIELDS = /^(user_?id|owner_?id|tenant_?id|account_?id|created_?by|createdby)$/i;
const EXEC_NAMES = new Set(["exec", "execSync", "spawn", "spawnSync"]);

function chain(node: t.Node): string { return memberChainToString(unwrapExpression(node)); }

function roleOf(node: t.Node, state: State): Set<FlowRole> {
  const current = unwrapExpression(node);
  const roles = new Set<FlowRole>();
  if (isRequestMember(current)) roles.add("resource");
  if (t.isIdentifier(current)) for (const role of state.roles.get(current.name) ?? []) roles.add(role);
  if (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
    const text = chain(current).toLowerCase();
    if (/^(req|request|ctx\.request|context\.request)\.(params|query|body)(\.|$)/.test(text)) roles.add("resource");
    if (/^(req|request|ctx\.state|context\.state)\.(user|auth|session)\.(id|_id|sub|userid|user_id)$/.test(text)) roles.add("identity");
  }
  if (t.isBinaryExpression(current) && current.operator === "+") {
    for (const role of roleOf(current.left, state)) roles.add(role);
    for (const role of roleOf(current.right, state)) roles.add(role);
  }
  if (t.isTemplateLiteral(current)) for (const e of current.expressions) for (const role of roleOf(e, state)) roles.add(role);
  if (t.isObjectExpression(current)) for (const p of current.properties) if (t.isObjectProperty(p)) for (const role of roleOf(p.value, state)) roles.add(role);
  if (t.isArrayExpression(current)) for (const e of current.elements) if (e) for (const role of roleOf(e, state)) roles.add(role);
  return roles;
}

function isRejected(node: t.Node): boolean {
  let result = false;
  traverseNode(node, {
    CallExpression(p) {
      if (result) return;
      const c = p.node.callee;
      if (t.isMemberExpression(c) && t.isIdentifier(c.property) && /^(status|sendStatus)$/.test(c.property.name)) {
        if (p.node.arguments.some((a) => t.isNumericLiteral(a) && (a.value === 401 || a.value === 403))) result = true;
      }
    },
  });
  return result;
}

function comparisonHasRoles(node: t.Node, state: State): boolean {
  if (!t.isBinaryExpression(node) || !["===", "==", "!==", "!="].includes(node.operator)) return false;
  const left = roleOf(node.left, state);
  const right = roleOf(node.right, state);
  return (left.has("identity") && right.has("resource")) || (left.has("resource") && right.has("identity"));
}

function calleeName(callee: t.Node): string {
  if (t.isIdentifier(callee)) return callee.name;
  if (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) {
    if (t.isIdentifier(callee.property)) return callee.property.name;
    if (t.isStringLiteral(callee.property)) return callee.property.value;
  }
  return "";
}

function resolveCall(repository: RepositoryAnalysis, filePath: string, callee: t.Node): FunctionRecord | null {
  if (t.isIdentifier(callee)) return repository.resolveFunction(filePath, callee.name);
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return null;
  if (!t.isIdentifier(callee.object) || !t.isIdentifier(callee.property)) return null;
  const binding = repository.imports.get(filePath)?.get(callee.object.name);
  if (!binding || binding.kind !== "namespace") return null;
  const target = repository.resolveImport(filePath, binding.source);
  if (!target) return null;
  const localName = repository.exports.get(target)?.get(callee.property.name) ?? callee.property.name;
  return repository.getFunction(target, localName);
}

function cloneState(state: State): State {
  return { authenticated: state.authenticated, resourceAuthorized: state.resourceAuthorized, roles: new Map([...state.roles].map(([k, v]) => [k, new Set(v)])) };
}

function mergeRoleInto(state: State, name: string, roles: Set<FlowRole>): void {
  if (!roles.size) return;
  const existing = state.roles.get(name) ?? new Set<FlowRole>();
  for (const role of roles) existing.add(role);
  state.roles.set(name, existing);
}

function analyzeFunction(
  record: FunctionRecord,
  repository: RepositoryAnalysis,
  initialRoles: Map<string, Set<FlowRole>>,
  visited: Set<string>,
  result: InterproceduralFlowResult,
): void {
  const key = `${record.filePath}::${record.name}`;
  if (visited.has(key) || visited.size >= 40) return;
  visited.add(key);
  result.visitedFunctions.push(key);

  const state: State = { roles: new Map([...initialRoles].map(([k, v]) => [k, new Set(v)])), authenticated: false, resourceAuthorized: false };

  for (const [name, roles] of state.roles) {
    if (roles.has("identity")) state.authenticated = true;
    if (roles.has("identity") && roles.has("resource")) state.resourceAuthorized = true;
    void name;
  }

  traverseNode(record.node.body, {
    VariableDeclarator(p) {
      if (!t.isIdentifier(p.node.id) || !p.node.init) return;
      mergeRoleInto(state, p.node.id.name, roleOf(p.node.init, state));
    },
    AssignmentExpression(p) {
      if (!t.isIdentifier(p.node.left)) return;
      mergeRoleInto(state, p.node.left.name, roleOf(p.node.right, state));
    },
    CallExpression(p) {
      const call = p.node;
      const name = calleeName(call.callee);
      if (AUTH_NAMES.test(name)) state.authenticated = true;

      if (AUTHZ_NAMES.test(name)) {
        const roles = call.arguments.map((a) => roleOf(a as t.Node, state));
        if (roles.some((r) => r.has("identity")) && roles.some((r) => r.has("resource"))) {
          state.resourceAuthorized = true;
        }
      }

      if (DB_METHODS.has(name)) {
        const argsRoles = call.arguments.map((a) => roleOf(a as t.Node, state));
        const usesResource = argsRoles.some((r) => r.has("resource"));
        let constrained = false;
        for (const arg of call.arguments) {
          if (!t.isObjectExpression(arg)) continue;
          for (const prop of arg.properties) {
            if (!t.isObjectProperty(prop)) continue;
            const field = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : "";
            const roles = roleOf(prop.value, state);
            if (OWNERSHIP_FIELDS.test(field) && roles.has("identity")) constrained = true;
          }
        }
        if (usesResource) {
          result.lookups.push({ filePath: record.filePath, line: call.loc?.start.line ?? 0, method: name, usesResource, constrainedToIdentity: constrained || state.resourceAuthorized });
          if (constrained || state.resourceAuthorized) state.resourceAuthorized = true;
        }
      }

      const target = resolveCall(repository, record.filePath, call.callee);
      if (target && target !== record) {
        const childRoles = new Map<string, Set<FlowRole>>();
        target.node.params.forEach((param, index) => {
          if (!t.isIdentifier(param)) return;
          const arg = call.arguments[index];
          if (!arg || t.isSpreadElement(arg)) return;
          const roles = roleOf(arg as t.Node, state);
          if (roles.size) childRoles.set(param.name, roles);
        });
        const child = cloneState(state);
        analyzeFunction(target, repository, childRoles, visited, result);
        // Child findings are evidence for the caller. We deliberately do not
        // assume an arbitrary callee is secure; only positive evidence flows back.
        if (result.lookups.some((l) => l.filePath === target.filePath && l.constrainedToIdentity)) state.resourceAuthorized = true;
        if (repository.isAuthFunction(target.filePath, target.name)) state.authenticated = true;
      }
    },
    IfStatement(p) {
      if (comparisonHasRoles(p.node.test, state) && (isRejected(p.node.consequent) || (p.node.alternate && isRejected(p.node.alternate)))) {
        state.authenticated = true;
        state.resourceAuthorized = true;
      }
    },
  });

  result.authenticated ||= state.authenticated;
  result.resourceAuthorized ||= state.resourceAuthorized;
}

export function analyzeFunctionNode(
  repository: RepositoryAnalysis,
  filePath: string,
  node: t.Function,
  initialRoles: Map<string, Set<FlowRole>> = new Map(),
): InterproceduralFlowResult {
  const result: InterproceduralFlowResult = { authenticated: false, resourceAuthorized: false, lookups: [], sinks: [], visitedFunctions: [] };
  const record: FunctionRecord = { filePath, name: "__inline", node, exportedNames: new Set() };
  analyzeFunction(record, repository, initialRoles, new Set(), result);
  return result;
}

export function analyzeInterproceduralFunction(
  repository: RepositoryAnalysis,
  filePath: string,
  functionName: string,
  initialRoles: Map<string, Set<FlowRole>> = new Map(),
): InterproceduralFlowResult {
  const result: InterproceduralFlowResult = { authenticated: false, resourceAuthorized: false, lookups: [], sinks: [], visitedFunctions: [] };
  const record = repository.getFunction(filePath, functionName) ?? repository.resolveFunction(filePath, functionName);
  if (!record) return result;
  analyzeFunction(record, repository, initialRoles, new Set(), result);
  return result;
}

export function findFunctionContainingRoute(repository: RepositoryAnalysis, filePath: string, node: t.Function): FunctionRecord | null {
  for (const record of repository.functions.values()) if (record.filePath === filePath && record.node === node) return record;
  return null;
}
