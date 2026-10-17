import * as t from "@babel/types";
import type { RepositoryAnalysis, FunctionRecord } from "./repository";
import { isRequestMember, traverseNode, unwrapExpression } from "./ast-utils";

export interface TaintSink { filePath: string; line: number; label: string; }

const EXEC_NAMES = new Set(["exec", "execSync", "spawn", "spawnSync"]);

function roles(node: t.Node, tainted: Set<string>): boolean {
  const n = unwrapExpression(node);
  if (isRequestMember(n)) return true;
  if (t.isIdentifier(n)) return tainted.has(n.name);
  if (t.isBinaryExpression(n) && n.operator === "+") return roles(n.left, tainted) || roles(n.right, tainted);
  if (t.isTemplateLiteral(n)) return n.expressions.some(e => roles(e, tainted));
  if (t.isCallExpression(n)) return n.arguments.some(a => !t.isSpreadElement(a) && roles(a, tainted));
  if (t.isNewExpression(n)) return n.arguments.some(a => !t.isSpreadElement(a) && roles(a as t.Node, tainted));
  if (t.isObjectExpression(n)) return n.properties.some(p => t.isObjectProperty(p) && roles(p.value, tainted));
  if (t.isArrayExpression(n)) return n.elements.some(e => !!e && roles(e, tainted));
  return false;
}

function sink(callee: t.Node): string | null {
  if (t.isIdentifier(callee) && callee.name === "eval") return "eval()";
  if (t.isIdentifier(callee) && callee.name === "Function") return "Function()";
  if (t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) {
    const prop = t.isIdentifier(callee.property) ? callee.property.name : t.isStringLiteral(callee.property) ? callee.property.value : "";
    if (EXEC_NAMES.has(prop)) return `child_process-style ${prop}()`;
  }
  if (t.isIdentifier(callee) && EXEC_NAMES.has(callee.name)) return `child_process-style ${callee.name}()`;
  return null;
}

function resolveCall(repository: RepositoryAnalysis, filePath: string, callee: t.Node): FunctionRecord | null {
  if (t.isIdentifier(callee)) return repository.resolveFunction(filePath, callee.name);
  if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return null;
  if (!t.isIdentifier(callee.object) || !t.isIdentifier(callee.property)) return null;
  const binding = repository.imports.get(filePath)?.get(callee.object.name);
  if (!binding || binding.kind !== "namespace") return null;
  const target = repository.resolveImport(filePath, binding.source);
  if (!target) return null;
  const local = repository.exports.get(target)?.get(callee.property.name) ?? callee.property.name;
  return repository.getFunction(target, local);
}

function scanFunction(record: FunctionRecord, repository: RepositoryAnalysis, seed: Set<string>, visited: Set<string>, sinks: TaintSink[]): void {
  const key = `${record.filePath}::${record.name}`;
  if (visited.has(key) || visited.size >= 40) return;
  visited.add(key);
  const tainted = new Set(seed);

  traverseNode(record.node.body, {
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && p.node.init && roles(p.node.init, tainted)) {
        tainted.add(p.node.id.name);
      }
    },
    AssignmentExpression(p) {
      if (t.isIdentifier(p.node.left) && roles(p.node.right, tainted)) {
        tainted.add(p.node.left.name);
      }
    },
    CallExpression(p) {
      const label = sink(p.node.callee);
      if (label && p.node.arguments.some(a => !t.isSpreadElement(a) && roles(a, tainted))) {
        sinks.push({ filePath: record.filePath, line: p.node.loc?.start.line ?? 0, label });
      }

      const target = resolveCall(repository, record.filePath, p.node.callee);
      if (!target) return;

      const childSeed = new Set<string>();
      target.node.params.forEach((param, index) => {
        if (!t.isIdentifier(param)) return;
        const arg = p.node.arguments[index];
        if (arg && !t.isSpreadElement(arg) && roles(arg, tainted)) childSeed.add(param.name);
      });
      if (childSeed.size) {
        scanFunction(target, repository, childSeed, visited, sinks);
      }
    },
    NewExpression(p) {
      if (!t.isIdentifier(p.node.callee) || p.node.callee.name !== "Function") return;
      if (p.node.arguments.some(a => !t.isSpreadElement(a) && roles(a as t.Node, tainted))) {
        sinks.push({ filePath: record.filePath, line: p.node.loc?.start.line ?? 0, label: "new Function()" });
      }
    },
  });
}

export function analyzeTaintNode(repository: RepositoryAnalysis, filePath: string, node: t.Function): TaintSink[] {
  const sinks: TaintSink[] = [];
  scanFunction({ filePath, name: "__inline", node, exportedNames: new Set() }, repository, new Set(), new Set(), sinks);
  return sinks;
}

export function analyzeTaintFunction(repository: RepositoryAnalysis, filePath: string, functionName: string): TaintSink[] {
  const record = repository.getFunction(filePath, functionName) ?? repository.resolveFunction(filePath, functionName);
  if (!record) return [];
  const sinks: TaintSink[] = [];
  scanFunction(record, repository, new Set(), new Set(), sinks);
  return sinks;
}
