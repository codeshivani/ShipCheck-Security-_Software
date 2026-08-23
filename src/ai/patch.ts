import fs from "fs/promises";
import path from "path";

export class PatchError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

interface DiffHunk {
  filePath: string;
  oldStart: number;
  lines: { type: "context" | "add" | "remove"; text: string }[];
}

/**
 * Parses a minimal unified diff (single-file, single or multi-hunk).
 * This is intentionally not a full patch/diff implementation — it supports
 * the shape of diffs the AI layer is instructed to produce (small, targeted,
 * single-file). Anything it can't confidently parse is rejected rather than
 * guessed at.
 */
function parseUnifiedDiff(diff: string): DiffHunk[] {
  const lines = diff.split("\n");
  const hunks: DiffHunk[] = [];
  let currentFile: string | null = null;
  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      const raw = line.slice(4).trim();
      currentFile = raw.replace(/^b\//, "").replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("--- ")) continue;

    const hunkHeaderMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkHeaderMatch) {
      if (!currentFile) throw new PatchError("Diff hunk found before a file header.", "MALFORMED_DIFF");
      currentHunk = { filePath: currentFile, oldStart: parseInt(hunkHeaderMatch[1], 10), lines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({ type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({ type: "remove", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", text: line.slice(1) });
    }
    // Lines like "\ No newline at end of file" or blank trailing lines are ignored.
  }

  if (hunks.length === 0) {
    throw new PatchError("No valid diff hunks found.", "MALFORMED_DIFF");
  }

  return hunks;
}

function applyHunkToLines(fileLines: string[], hunk: DiffHunk): string[] {
  const result = [...fileLines];
  let cursor = hunk.oldStart - 1; // 0-indexed position tracking through the original file
  const output: string[] = result.slice(0, cursor);

  for (const line of hunk.lines) {
    if (line.type === "context") {
      if (result[cursor] !== line.text) {
        throw new PatchError("Patch context does not match the target file.", "CONTEXT_MISMATCH");
      }
      output.push(result[cursor]);
      cursor++;
    } else if (line.type === "remove") {
      if (result[cursor] !== line.text) {
        throw new PatchError("Patch removal does not match the target file.", "CONTEXT_MISMATCH");
      }
      cursor++; // skip this original line — it's being removed
    } else if (line.type === "add") {
      output.push(line.text);
    }
  }

  output.push(...result.slice(cursor));
  return output;
}

/**
 * Applies a unified diff to a file inside `repoDir`. The resolved target path
 * is verified to remain within repoDir to prevent path traversal via a
 * malicious/malformed AI-generated diff (spec section 15).
 */
export async function applyPatch(
  repoDir: string,
  diff: string,
  expectedFilePath?: string
): Promise<{ filePath: string }> {
  const hunks = parseUnifiedDiff(diff);
  const filePath = hunks[0].filePath;

  if (hunks.some((hunk) => hunk.filePath !== filePath)) {
    throw new PatchError("Only single-file patches are supported.", "MULTI_FILE_PATCH");
  }
  if (expectedFilePath && filePath !== expectedFilePath) {
    throw new PatchError("Patch target does not match the selected finding.", "UNEXPECTED_TARGET");
  }

  if (path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new PatchError("Patch target must be a relative repository path.", "PATH_TRAVERSAL");
  }

  const normalizedRoot = await fs.realpath(repoDir).catch(() => null);
  if (!normalizedRoot) {
    throw new PatchError("Repository workspace no longer exists.", "WORKSPACE_NOT_FOUND");
  }

  const absTarget = path.resolve(normalizedRoot, filePath);
  if (!absTarget.startsWith(normalizedRoot + path.sep)) {
    throw new PatchError("Patch target escapes the repository directory.", "PATH_TRAVERSAL");
  }

  // Reject symlinked parent components and the target itself. This prevents an
  // AI-generated path from resolving outside the workspace after validation.
  const relative = path.relative(normalizedRoot, absTarget);
  const parts = relative.split(path.sep).filter(Boolean);
  let current = normalizedRoot;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(() => null);
    if (stat?.isSymbolicLink()) {
      throw new PatchError("Patch target traverses a symbolic link.", "SYMLINK_ESCAPE");
    }
  }

  let original: string;
  try {
    const targetStat = await fs.lstat(absTarget);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new PatchError("Patch target is not a regular file.", "INVALID_TARGET");
    }
    original = await fs.readFile(absTarget, "utf-8");
  } catch (err) {
    if (err instanceof PatchError) throw err;
    throw new PatchError(`Patch target file not found: ${filePath}`, "TARGET_NOT_FOUND");
  }

  let lines = original.split("\n");
  for (const hunk of hunks.filter((h) => h.filePath === filePath)) {
    lines = applyHunkToLines(lines, hunk);
  }

  await fs.writeFile(absTarget, lines.join("\n"), "utf-8");
  return { filePath };
}
