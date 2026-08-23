import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { scanDirectory } from "@/scanner/scanner";

async function writeFixture(root: string, files: Record<string, string>) {
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, source, "utf8");
  }
}

function ruleIds(findings: { ruleId: string; status: string }[]) {
  return new Set(findings.filter((f) => f.status === "match").map((f) => f.ruleId));
}

describe("security demo fixtures", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "shipcheck-demo-fixtures-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("covers R1, R2, and R3 with an isolated auth fixture", async () => {
    await writeFixture(root, {
      "src/routes/auth.ts": `import jwt from "jsonwebtoken";
export function admin(req: any, res: any) {
  const payload = jwt.decode(req.headers.authorization);
  if (payload?.role === "admin") res.json({ ok: true });
}
`,
      "src/routes/users.ts": `export async function getUser(req: any, res: any) {
  const user = await User.findById(req.params.id);
  res.json(user);
}
`,
      "src/config.ts": `export const config = { jwtSecret: "${["sk-", "abcdefghij1234567890XY"].join("")}" };\n`,
    });
    const report = await scanDirectory(root, "demo://vulnerable-auth");
    const ids = ruleIds(report.findings);
    expect(ids.has("R1")).toBe(true);
    expect(ids.has("R2")).toBe(true);
    expect(ids.has("R3")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });

  it("covers R1 and R4 with an isolated ecommerce fixture", async () => {
    await writeFixture(root, {
      "src/routes/orders.ts": `export async function getOrder(req: any, res: any) {
  const order = await Order.findById(req.params.orderId);
  res.json(order);
}
`,
      "src/routes/products.ts": `export async function update(req: any, res: any) {
  const product = await Product.findOneAndUpdate({ sku: req.params.sku }, req.body, { new: true });
  res.json(product);
}
`,
    });
    const report = await scanDirectory(root, "demo://vulnerable-ecommerce");
    const ids = ruleIds(report.findings);
    expect(ids.has("R1")).toBe(true);
    expect(ids.has("R4")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });

  it("covers R2, R3, and R5 with an isolated execution fixture", async () => {
    await writeFixture(root, {
      "src/config.ts": `export const internalApiKey = "${["ghp_", "9fA2bK7mQeR4tYvXcZ1nL8sD3wJpH6gU0iOe"].join("")}";\n`,
      "src/routes/reports.ts": `export function report(req: any, res: any) {
  const claims = jwt.decode(req.headers.authorization);
  if (claims?.permission === "restricted") res.json({ ok: true });
}
`,
      "src/routes/tools.ts": `export function run(req: any, res: any) {
  const command = req.body.command;
  child_process.exec(command, () => res.json({ ok: true }));
}
`,
    });
    const report = await scanDirectory(root, "demo://vulnerable-exec");
    const ids = ruleIds(report.findings);
    expect(ids.has("R2")).toBe(true);
    expect(ids.has("R3")).toBe(true);
    expect(ids.has("R5")).toBe(true);
    expect(report.risk.score).toBeLessThan(100);
  });
});
