import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { walkRepo, MAX_FILE_SIZE_BYTES } from "@/scanner/repo/walk";
import { validateGitHubUrl } from "@/scanner/repo/clone";
import { scanDirectory } from "@/scanner/scanner";

describe("ShipCheck hardening", () => {
  it("rejects non-GitHub and unsafe repository URLs", () => {
    expect(() => validateGitHubUrl("file:///etc/passwd")).toThrow();
    expect(() => validateGitHubUrl("http://127.0.0.1/repo")).toThrow();
    expect(() => validateGitHubUrl("https://github.com.evil.test/a/b")).toThrow();
    expect(() => validateGitHubUrl("https://github.com/a/b")).not.toThrow();
  });

  it("does not follow symlinks while walking", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-test-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-outside-"));
    try {
      await fs.writeFile(path.join(outside, "secret.js"), "const secret = 'outside';");
      await fs.symlink(outside, path.join(root, "linked"), "junction");
      const result = await walkRepo(root);
      expect(result.files.some((f) => f.relPath.includes("linked"))).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("skips files over the per-file limit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-test-"));
    try {
      const buf = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 65);
      await fs.writeFile(path.join(root, "large.js"), buf);
      const result = await walkRepo(root);
      expect(result.files).toHaveLength(0);
      expect(result.skippedTooLarge).toContain("large.js");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("honors scan cancellation before doing work", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-test-"));
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(scanDirectory(root, "demo://cancel", { signal: controller.signal })).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
