import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { applyPatch, PatchError } from "@/ai/patch";

describe("applyPatch", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-patch-test-"));
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "src", "a.ts"),
      ["line1", "line2", "line3", "line4", "line5"].join("\n") + "\n",
      "utf-8"
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("applies a simple single-hunk diff", async () => {
    const diff = [
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2",
      "+line2-fixed",
      " line3",
    ].join("\n");

    const result = await applyPatch(dir, diff);
    expect(result.filePath).toBe("src/a.ts");

    const content = await fs.readFile(path.join(dir, "src", "a.ts"), "utf-8");
    expect(content).toContain("line2-fixed");
    expect(content.split("\n")).not.toContain("line2");
  });

  it("rejects a diff targeting a path outside the repo", async () => {
    const diff = ["--- a/../../etc/passwd", "+++ b/../../etc/passwd", "@@ -1,1 +1,1 @@", "-root", "+hacked"].join(
      "\n"
    );
    await expect(applyPatch(dir, diff)).rejects.toBeInstanceOf(PatchError);
  });

  it("rejects a diff with no hunks", async () => {
    await expect(applyPatch(dir, "not a diff")).rejects.toBeInstanceOf(PatchError);
  });

  it("rejects a diff targeting a nonexistent file", async () => {
    const diff = ["--- a/src/missing.ts", "+++ b/src/missing.ts", "@@ -1,1 +1,1 @@", "-x", "+y"].join("\n");
    await expect(applyPatch(dir, diff)).rejects.toBeInstanceOf(PatchError);
  });

  it("rejects a patch whose removed content does not match the file", async () => {
    const diff = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,2 +1,2 @@", " line1", "-different", "+line2-fixed"].join(
      "\n"
    );
    await expect(applyPatch(dir, diff)).rejects.toMatchObject({ code: "CONTEXT_MISMATCH" });
  });

  it("rejects a patch that does not target the selected finding file", async () => {
    const diff = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,2 +1,2 @@", " line1", "-line2", "+line2-fixed"].join(
      "\n"
    );
    await expect(applyPatch(dir, diff, "src/other.ts")).rejects.toMatchObject({ code: "UNEXPECTED_TARGET" });
  });
});
