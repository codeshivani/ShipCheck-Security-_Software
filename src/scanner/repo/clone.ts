import { spawn, execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";

export class RepoError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RepoError";
  }
}

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?\/?$/;
export const CLONE_TIMEOUT_MS = 60_000;
export const GITHUB_PREFLIGHT_TIMEOUT_MS = 5_000;
export const MAX_REPO_SIZE_BYTES = 150 * 1024 * 1024;

export function validateGitHubUrl(url: string): { owner: string; repo: string } {
  const trimmed = url.trim();
  const match = GITHUB_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RepoError(
      "Only public GitHub repository URLs of the form https://github.com/owner/repo are supported.",
      "INVALID_URL",
    );
  }
  return { owner: match[1], repo: match[2] };
}

export interface ClonedRepo {
  dir: string;
  cleanup: () => Promise<void>;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RepoError("Clone cancelled.", "CLONE_CANCELLED");
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.removeListener("close", onClose);
      resolve();
    }, timeoutMs);
    const onClose = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    child.once("close", onClose);
  });
}

async function killProcessTree(child: ReturnType<typeof spawn>): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
    await waitForExit(child, 2_000);
    return;
  }

  try { child.kill("SIGTERM"); } catch {}
  await waitForExit(child, 500);
  if (child.exitCode === null) {
    try { child.kill("SIGKILL"); } catch {}
    await waitForExit(child, 1_000);
  }
}

async function runGitClone(cleanUrl: string, dir: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      ["clone", "--depth", "1", "--single-branch", "--no-tags", "--", cleanUrl, dir],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    let settled = false;
    const timeout: NodeJS.Timeout = setTimeout(async () => {
      if (settled) return;
      await killProcessTree(child);
      finish(new RepoError("Clone timed out and the Git process was terminated.", "CLONE_TIMEOUT"));
    }, CLONE_TIMEOUT_MS);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };

    const onAbort = async () => {
      if (settled) return;
      await killProcessTree(child);
      finish(new RepoError("Clone cancelled and the Git process was terminated.", "CLONE_CANCELLED"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });

    child.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      finish(new RepoError(
        code === "ENOENT" ? "Git is not installed or is not available on PATH." : `Failed to start Git: ${error.message}`,
        code === "ENOENT" ? "GIT_NOT_FOUND" : "CLONE_FAILED",
      ));
    });

    child.once("close", (code) => {
      if (settled) return;
      if (code === 0) return finish();
      const detail = stderr.trim().replace(/\s+/g, " ");
      finish(new RepoError(`Git clone failed${detail ? `: ${detail}` : ` (exit ${code ?? "unknown"})`}`, "CLONE_FAILED"));
    });

  });
}

async function githubPreflight(owner: string, repo: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_PREFLIGHT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ShipCheck/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 404) {
      throw new RepoError("Public GitHub repository was not found.", "CLONE_FAILED");
    }

    if (!response.ok) {
      // Rate limits or transient GitHub failures should not make a valid public
      // repository unscannable. The authoritative post-clone size check remains.
      return;
    }

    const data = await response.json() as { size?: unknown; private?: unknown; archived?: unknown };
    if (data.private === true) {
      throw new RepoError("Private GitHub repositories are not supported.", "INVALID_URL");
    }

    if (typeof data.size === "number" && data.size * 1024 > MAX_REPO_SIZE_BYTES) {
      throw new RepoError("Repository exceeds ShipCheck's 150 MB scan limit.", "REPO_TOO_LARGE");
    }
  } catch (error) {
    if (error instanceof RepoError) throw error;
    if (controller.signal.aborted && signal?.aborted) throw new RepoError("Clone cancelled.", "CLONE_CANCELLED");
    // Preflight is an optimization, not the final guard.
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === ".git") continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) total += stat.size;
    }
    if (total > MAX_REPO_SIZE_BYTES) return total;
  }
  return total;
}

export async function cloneRepo(url: string, signal?: AbortSignal): Promise<ClonedRepo> {
  const { owner, repo } = validateGitHubUrl(url);
  await githubPreflight(owner, repo, signal);

  const safeName = crypto.randomBytes(8).toString("hex");
  const dir = path.join(os.tmpdir(), `shipcheck-${safeName}`);
  await fs.mkdir(dir, { recursive: true });

  const cleanUrl = `https://github.com/${owner}/${repo}.git`;
  const cleanup = async () => {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    await runGitClone(cleanUrl, dir, signal);

    // Git history is not needed for static analysis or patch/rescan. Removing
    // .git immediately reduces workspace size and avoids retaining metadata.
    await fs.rm(path.join(dir, ".git"), { recursive: true, force: true }).catch(() => {});

    const size = await dirSize(dir);
    if (size > MAX_REPO_SIZE_BYTES) {
      throw new RepoError("Repository exceeds the size limit supported by this scan.", "REPO_TOO_LARGE");
    }
  } catch (err) {
    await cleanup();
    if (err instanceof RepoError) throw err;
    throw new RepoError(`Failed to clone repository: ${(err as Error).message}`, "CLONE_FAILED");
  }

  return { dir, cleanup };
}
