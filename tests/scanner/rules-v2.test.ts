import { describe, expect, it } from "vitest";
import { parseSource } from "../../src/scanner/parser/parse";
import { r6SqlInjectionRule } from "../../src/scanner/rules/r6-sql-injection";
import { r7PathTraversalRule } from "../../src/scanner/rules/r7-path-traversal";
import { r8SsrfRule } from "../../src/scanner/rules/r8-ssrf";

describe("V2 security rules", () => {
  it("detects request data reaching raw SQL", () => {
    const source = `export async function GET(req) {
      const q = req.query.q;
      return db.query("SELECT * FROM users WHERE name = '" + q + "'");
    }`;
    const file = parseSource("src/routes/search.ts", source);
    const findings = r6SqlInjectionRule.analyze(file);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("R6");
  });

  it("detects request data reaching a filesystem sink", () => {
    const source = `export async function GET(req) {
      const file = path.join("/srv/uploads", req.query.file);
      return fs.readFile(file);
    }`;
    const parsed = parseSource("src/routes/files.ts", source);
    const findings = r7PathTraversalRule.analyze(parsed);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("R7");
  });

  it("detects request-controlled outbound URLs", () => {
    const source = `export async function POST(req) {
      const url = req.body.url;
      return fetch(url);
    }`;
    const parsed = parseSource("src/routes/proxy.ts", source);
    const findings = r8SsrfRule.analyze(parsed);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("R8");
  });
});
