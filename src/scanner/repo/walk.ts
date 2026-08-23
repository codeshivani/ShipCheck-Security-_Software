import fs from "fs/promises";
import path from "path";
import { isSupportedFile } from "../parser/parse";
import { RepoError } from "./clone";

export interface WalkResult {
  files: { relPath: string; absPath: string; size: number }[];
  skippedTooLarge: string[];
  skippedByTotalBytes: string[];
  skippedTooMany: boolean;
  totalCandidateBytes: number;
}

export const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;
export const MAX_FILES = 800;
export const MAX_TOTAL_SCANNED_BYTES = 64 * 1024 * 1024;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo", "vendor"]);

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RepoError("Scan timed out and was cancelled.", "SCAN_TIMEOUT");
  }
}

export async function walkRepo(rootDir: string, signal?: AbortSignal): Promise<WalkResult> {
  const files: { relPath: string; absPath: string; size: number }[] = [];
  const skippedTooLarge: string[] = [];
  const skippedByTotalBytes: string[] = [];
  let skippedTooMany = false;
  let totalCandidateBytes = 0;
  const rootResolved = path.resolve(rootDir);

  async function walk(dir: string) {
    throwIfAborted(signal);
    if (files.length >= MAX_FILES || totalCandidateBytes >= MAX_TOTAL_SCANNED_BYTES) {
      skippedTooMany = files.length >= MAX_FILES;
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      throwIfAborted(signal);
      if (files.length >= MAX_FILES) {
        skippedTooMany = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;

      const abs = path.resolve(dir, entry.name);
      const rel = path.relative(rootResolved, abs);
      if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || !isSupportedFile(rel)) continue;

      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) continue;
      if (stat.size > MAX_FILE_SIZE_BYTES) {
        skippedTooLarge.push(rel);
        continue;
      }
      if (totalCandidateBytes + stat.size > MAX_TOTAL_SCANNED_BYTES) {
        skippedByTotalBytes.push(rel);
        continue;
      }

      files.push({ relPath: rel, absPath: abs, size: stat.size });
      totalCandidateBytes += stat.size;
    }
  }

  await walk(rootResolved);
  return { files, skippedTooLarge, skippedByTotalBytes, skippedTooMany, totalCandidateBytes };
}
