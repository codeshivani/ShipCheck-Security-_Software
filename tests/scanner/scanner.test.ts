import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { scanDirectory } from "@/scanner/scanner";

describe("scanDirectory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-scan-test-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns a clean report (score 100) for a repo with no matches", async () => {
    await fs.writeFile(path.join(dir, "index.ts"), "export const add = (a: number, b: number) => a + b;\n");
    const report = await scanDirectory(dir, "https://github.com/x/clean");
    expect(report.findings.filter((f) => f.status === "match")).toHaveLength(0);
    expect(report.risk.score).toBe(100);
    expect(report.filesScanned).toBe(1);
  });

  it("records a warning and continues on a malformed file instead of crashing", async () => {
    await fs.writeFile(path.join(dir, "broken.ts"), "function ( { [[[ this is not valid js at all }}}");
    await fs.writeFile(path.join(dir, "ok.ts"), "export const x = 1;\n");
    const report = await scanDirectory(dir, "https://github.com/x/broken");
    expect(report.filesScanned).toBeGreaterThanOrEqual(1);
    expect(report.warnings.some((w) => w.includes("broken.ts"))).toBe(true);
  });

  it("detects a real finding end-to-end (R2 hardcoded secret)", async () => {
    await fs.writeFile(
      path.join(dir, "config.ts"),
      `export const stripeKey = "sk-abcdefghij1234567890XY";\n`
    );
    const report = await scanDirectory(dir, "https://github.com/x/secret");
    const r2 = report.findings.filter((f) => f.ruleId === "R2" && f.status === "match");
    expect(r2.length).toBeGreaterThanOrEqual(1);
    expect(report.risk.score).toBeLessThan(100);
  });
});
