import traverse from "@babel/traverse";
import path from "node:path";
import * as t from "@babel/types";
import type { ParsedFile } from "../parser/parse";
import { hasAuthGuardSemantics } from "./ast-utils";

export interface ImportedBinding {
  localName: string;
  importedName: string;
  source: string;
  kind: "named" | "default" | "namespace";
}

export interface FunctionRecord {
  filePath: string;
  name: string;
  node: t.Function;
  exportedNames: Set<string>;
}

export interface RepositoryAnalysis {
  files: Map<string, ParsedFile>;
  imports: Map<string, Map<string, ImportedBinding>>;
  functions: Map<string, FunctionRecord>;
  exports: Map<string, Map<string, string>>;
  authFunctions: Set<string>;
  resolveImport(fromFile: string, source: string): string | null;
  isAuthFunction(filePath: string, name: string): boolean;
  resolveFunction(filePath: string, name: string): FunctionRecord | null;
  getFunction(filePath: string, name: string): FunctionRecord | null;
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function withoutExtension(value: string): string {
  for (const ext of EXTENSIONS) if (value.endsWith(ext)) return value.slice(0, -ext.length);
  return value;
}

function candidatePaths(base: string): string[] {
  const normalized = normalizePath(base);
  const bare = withoutExtension(normalized);
  return [...new Set([
    normalized,
    ...EXTENSIONS.map((ext) => `${bare}${ext}`),
    ...EXTENSIONS.map((ext) => `${normalized}/index${ext}`),
  ])];
}

function collectImportedBindings(file: ParsedFile): Map<string, ImportedBinding> {
  const bindings = new Map<string, ImportedBinding>();
  for (const statement of file.ast.program.body) {
    if (!t.isImportDeclaration(statement)) continue;
    for (const specifier of statement.specifiers) {
      if (t.isImportSpecifier(specifier)) {
        bindings.set(specifier.local.name, {
          localName: specifier.local.name,
          importedName: t.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value,
          source: statement.source.value,
          kind: "named",
        });
      } else if (t.isImportDefaultSpecifier(specifier)) {
        bindings.set(specifier.local.name, { localName: specifier.local.name, importedName: "default", source: statement.source.value, kind: "default" });
      } else if (t.isImportNamespaceSpecifier(specifier)) {
        bindings.set(specifier.local.name, { localName: specifier.local.name, importedName: "*", source: statement.source.value, kind: "namespace" });
      }
    }
  }
  return bindings;
}

function functionNameFromDeclaration(node: t.Node): string | null {
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;
  if (t.isVariableDeclaration(node)) {
    const declaration = node.declarations.find((d) => t.isIdentifier(d.id) && d.init && t.isFunction(d.init));
    if (declaration && t.isIdentifier(declaration.id)) return declaration.id.name;
  }
  return null;
}

function collectFunctions(file: ParsedFile): Map<string, FunctionRecord> {
  const result = new Map<string, FunctionRecord>();
  traverse(file.ast, {
    FunctionDeclaration(p) {
      if (p.node.id) result.set(p.node.id.name, { filePath: normalizePath(file.path), name: p.node.id.name, node: p.node, exportedNames: new Set() });
    },
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && p.node.init && t.isFunction(p.node.init)) {
        result.set(p.node.id.name, { filePath: normalizePath(file.path), name: p.node.id.name, node: p.node.init, exportedNames: new Set() });
      }
    },
    ObjectMethod(p) {
      if (t.isIdentifier(p.node.key)) result.set(p.node.key.name, { filePath: normalizePath(file.path), name: p.node.key.name, node: p.node, exportedNames: new Set() });
    },
    ClassMethod(p) {
      if (t.isIdentifier(p.node.key)) result.set(p.node.key.name, { filePath: normalizePath(file.path), name: p.node.key.name, node: p.node, exportedNames: new Set() });
    },
  });
  return result;
}

function collectExports(file: ParsedFile, functions: Map<string, FunctionRecord>): Map<string, string> {
  const exports = new Map<string, string>();
  for (const statement of file.ast.program.body) {
    if (t.isExportNamedDeclaration(statement)) {
      const localName = statement.declaration ? functionNameFromDeclaration(statement.declaration) : null;
      if (localName) exports.set(localName, localName);
      for (const specifier of statement.specifiers) {
        if (!t.isExportSpecifier(specifier)) continue;
        const local = specifier.local.name;
        const exported = t.isIdentifier(specifier.exported) ? specifier.exported.name : (specifier.exported as t.StringLiteral).value;
        exports.set(exported, local);
      }
    } else if (t.isExportDefaultDeclaration(statement)) {
      if (t.isFunctionDeclaration(statement.declaration)) {
        const name = statement.declaration.id?.name ?? "default";
        exports.set("default", name);
        if (!functions.has(name)) functions.set(name, { filePath: normalizePath(file.path), name, node: statement.declaration, exportedNames: new Set(["default"]) });
      } else if (t.isIdentifier(statement.declaration)) {
        exports.set("default", statement.declaration.name);
      }
    }
  }
  for (const [exported, local] of exports) functions.get(local)?.exportedNames.add(exported);
  return exports;
}

export function buildRepositoryAnalysis(parsedFiles: ParsedFile[]): RepositoryAnalysis {
  const files = new Map(parsedFiles.map((file) => [normalizePath(file.path), file]));
  const imports = new Map<string, Map<string, ImportedBinding>>();
  const functions = new Map<string, FunctionRecord>();
  const exports = new Map<string, Map<string, string>>();
  const authFunctions = new Set<string>();

  for (const file of parsedFiles) {
    const filePath = normalizePath(file.path);
    imports.set(filePath, collectImportedBindings(file));
    const localFunctions = collectFunctions(file);
    const localExports = collectExports(file, localFunctions);
    exports.set(filePath, localExports);
    for (const [name, record] of localFunctions) {
      functions.set(`${filePath}::${name}`, record);
      if (hasAuthGuardSemantics(record.node.body)) authFunctions.add(`${filePath}::${name}`);
    }
  }

  function resolveImport(fromFile: string, source: string): string | null {
    if (!source.startsWith(".")) return null;
    const from = normalizePath(fromFile);
    const directory = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
    const raw = directory ? `${directory}/${source}` : source;
    const normalized = normalizePath(path.posix.normalize(raw));
    return candidatePaths(normalized).find((candidate) => files.has(candidate)) ?? null;
  }

  function getFunction(filePath: string, name: string): FunctionRecord | null {
    return functions.get(`${normalizePath(filePath)}::${name}`) ?? null;
  }

  function resolveFunction(filePath: string, name: string): FunctionRecord | null {
    const normalizedFile = normalizePath(filePath);
    const local = getFunction(normalizedFile, name);
    if (local) return local;
    const binding = imports.get(normalizedFile)?.get(name);
    if (!binding) return null;
    const targetFile = resolveImport(normalizedFile, binding.source);
    if (!targetFile) return null;
    if (binding.kind === "namespace") return null;
    const localName = exports.get(targetFile)?.get(binding.importedName) ?? binding.importedName;
    return getFunction(targetFile, localName) ?? (binding.importedName === "default" ? getFunction(targetFile, "default") : null);
  }

  function isAuthFunction(filePath: string, name: string): boolean {
    const record = resolveFunction(filePath, name);
    return !!record && authFunctions.has(`${record.filePath}::${record.name}`);
  }

  return { files, imports, functions, exports, authFunctions, resolveImport, isAuthFunction, resolveFunction, getFunction };
}
