import { describe, it, expect } from "vitest";
import { r3JwtRule } from "@/scanner/rules/r3-jwt";
import { runRule } from "./helpers";

describe("R3 — Unsafe JWT Handling", () => {
  it("flags unverified decode() used for an authorization decision", () => {
    const src = `
      function handler(req, res) {
        const payload = jwt.decode(req.headers.authorization);
        if (payload.role === 'admin') {
          return res.json({ secret: true });
        }
      }
    `;
    const findings = runRule(r3JwtRule, "src/auth.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("match");
  });

  it("does not flag a safe verify() flow", () => {
    const src = `
      function handler(req, res) {
        const payload = jwt.verify(req.headers.authorization, SECRET);
        if (payload.role === 'admin') {
          return res.json({ secret: true });
        }
      }
    `;
    const findings = runRule(r3JwtRule, "src/auth.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("does not flag decode() used only for harmless display", () => {
    const src = `
      function handler(req, res) {
        const payload = jwt.decode(req.headers.authorization);
        console.log('token issued at', payload.iat);
      }
    `;
    const findings = runRule(r3JwtRule, "src/auth.ts", src);
    expect(findings).toHaveLength(0);
  });
});
