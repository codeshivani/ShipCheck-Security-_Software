import { spawn, execFile } from "child_process";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { once } from "events";

export class RepoError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "RepoError";
  }
}

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?\/?$/;
export const CLONE_TIMEOUT_MS = 60_000;
export const MAX_REPO_SIZE_BYTES = 150 * 1024 * 1024;
const ARCHIVE_TIMEOUT_MS = 55_000;

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

async function runTarExtract(archive: string, dir: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    };
    const onAbort = async () => {
      if (settled) return;
      await killProcessTree(child);
      finish(new RepoError("Archive extraction cancelled.", "CLONE_CANCELLED"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4_000); });
    child.once("error", (error) => finish(new Error(error.message)));
    child.once("close", (code) => {
      if (settled) return;
      if (code === 0) finish();
      else finish(new Error(`tar extraction failed${stderr.trim() ? `: ${stderr.trim()}` : ` (exit ${code ?? "unknown"})`}`));
    });
  });
}

async function downloadGitHubArchive(owner: string, repo: string, dir: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARCHIVE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const archive = path.join(dir, "repo.tar.gz");
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/HEAD`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "ShipCheck/1.0" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 404) throw new RepoError("Public GitHub repository was not found.", "CLONE_FAILED");
    if (!response.ok || !response.body) throw new RepoError(`GitHub archive download failed (${response.status}).`, "CLONE_FAILED");

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REPO_SIZE_BYTES) throw new RepoError("Repository archive exceeds ShipCheck's 150 MB scan limit.", "REPO_TOO_LARGE");

    const writer = createWriteStream(archive);
    let bytes = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        throwIfAborted(signal);
        bytes += chunk.byteLength;
        if (bytes > MAX_REPO_SIZE_BYTES) {
          writer.destroy();
          throw new RepoError("Repository archive exceeds ShipCheck's 150 MB scan limit.", "REPO_TOO_LARGE");
        }
        if (!writer.write(Buffer.from(chunk))) await once(writer, "drain");
      }
      writer.end();
      await once(writer, "close");
    } catch (error) {
      writer.destroy();
      throw error;
    }

    await runTarExtract(archive, dir, signal);
    await fs.rm(archive, { force: true }).catch(() => {});
  } catch (error) {
    await fs.rm(archive, { force: true }).catch(() => {});
    if (error instanceof RepoError) throw error;
    if (controller.signal.aborted || signal?.aborted) throw new RepoError("Repository download timed out and was cancelled.", "CLONE_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function runGitClone(cleanUrl: string, dir: string, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["clone", "--depth", "1", "--single-branch", "--no-tags", "--filter=blob:none", "--", cleanUrl, dir], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    };
    const onAbort = async () => { if (!settled) { await killProcessTree(child); finish(new RepoError("Clone cancelled and the Git process was terminated.", "CLONE_CANCELLED")); } };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8_000); });
    child.once("error", (error) => finish(new RepoError((error as NodeJS.ErrnoException).code === "ENOENT" ? "Git is not installed or is not available on PATH." : `Failed to start Git: ${error.message}`, "CLONE_FAILED")));
    child.once("close", (code) => code === 0 ? finish() : finish(new RepoError(`Git clone failed${stderr.trim() ? `: ${stderr.trim().replace(/\s+/g, " ")}` : ` (exit ${code ?? "unknown"})`}`, "CLONE_FAILED")));
    timeout = setTimeout(async () => { if (!settled) { await killProcessTree(child); finish(new RepoError("Clone timed out and the Git process was terminated.", "CLONE_TIMEOUT")); } }, CLONE_TIMEOUT_MS);
  });
}

export async function cloneRepo(url: string, signal?: AbortSignal): Promise<ClonedRepo> {
  const { owner, repo } = validateGitHubUrl(url);
  const safeName = crypto.randomBytes(8).toString("hex");
  const dir = path.join(os.tmpdir(), `shipcheck-${safeName}`);
  await fs.mkdir(dir, { recursive: true });
  const cleanUrl = `https://github.com/${owner}/${repo}.git`;
  const cleanup = async () => { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); };

  try {
    // GitHub's tarball endpoint is normally much faster than a git clone for a
    // static analyzer because ShipCheck needs the current source tree, not history.
    try {
      await downloadGitHubArchive(owner, repo, dir, signal);
    } catch (archiveError) {
      if (archiveError instanceof RepoError && ["REPO_TOO_LARGE", "CLONE_CANCELLED", "CLONE_TIMEOUT"].includes(archiveError.code)) throw archiveError;
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(dir, { recursive: true });
      await runGitClone(cleanUrl, dir, signal);
      await fs.rm(path.join(dir, ".git"), { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    await cleanup();
    if (err instanceof RepoError) throw err;
    throw new RepoError(`Failed to obtain repository: ${(err as Error).message}`, "CLONE_FAILED");
  }

  return { dir, cleanup };
}
