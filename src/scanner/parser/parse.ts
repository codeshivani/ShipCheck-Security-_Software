import { parse } from "@babel/parser";
import type { File } from "@babel/types";

export interface ParsedFile {
  path: string;
  source: string;
  ast: File;
}

export class ParseError extends Error {
  constructor(public file: string, cause: unknown) {
    super(`Failed to parse ${file}: ${(cause as Error)?.message ?? cause}`);
  }
}

/**
 * Parses a JS/TS/JSX/TSX source file into a Babel AST.
 * Throws ParseError on failure — callers must catch this and record it as a
 * warning rather than crashing the whole scan (spec section 16).
 */
export function parseSource(filePath: string, source: string): ParsedFile {
  try {
    const isTs = /\.tsx?$/.test(filePath);
    const isJsx = /\.(jsx|tsx)$/.test(filePath);

    const ast = parse(source, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: [
        ...(isTs ? (["typescript"] as const) : []),
        ...(isJsx ? (["jsx"] as const) : []),
        "decorators-legacy",
      ],
    });

    if (ast.errors?.length) {
      throw new ParseError(filePath, ast.errors[0]);
    }
    return { path: filePath, source, ast };
  } catch (err) {
    throw new ParseError(filePath, err);
  }
}

export const SUPPORTED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

export function isSupportedFile(filePath: string): boolean {
  if (!SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return false;
  // Skip obvious noise
  if (/node_modules\//.test(filePath)) return false;
  if (/\.min\.(js|jsx|ts|tsx)$/.test(filePath)) return false;
  if (/\.d\.ts$/.test(filePath)) return false;
  if (/(^|\/)dist\//.test(filePath)) return false;
  if (/(^|\/)build\//.test(filePath)) return false;
  if (/(^|\/)\.next\//.test(filePath)) return false;
  return true;
}
