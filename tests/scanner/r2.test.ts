import { describe, it, expect } from "vitest";
import { r2SecretsRule } from "@/scanner/rules/r2-secrets";
import { runRule } from "./helpers";

describe("R2 — Hardcoded Secret", () => {
  it("flags a real-looking secret with a known prefix", () => {
    const knownSecret = ["sk-", "abcdefghij1234567890XY"].join("");
    const src = `const stripeKey = "${knownSecret}";`;
    const findings = runRule(r2SecretsRule, "src/config.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("match");
    expect(findings[0].confidence).toBe("high");
  });

  it("does not flag an obvious placeholder", () => {
    const src = `const apiKey = "your-api-key-here-placeholder";`;
    const findings = runRule(r2SecretsRule, "src/config.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("skips .env.example files entirely", () => {
    const knownSecret = ["sk-", "abcdefghij1234567890XY"].join("");
    const src = `const apiKey = "${knownSecret}";`;
    const findings = runRule(r2SecretsRule, ".env.example", src);
    expect(findings).toHaveLength(0);
  });

  it("skips test fixtures", () => {
    const knownSecret = ["sk-", "abcdefghij1234567890XY"].join("");
    const src = `const apiKey = "${knownSecret}";`;
    const findings = runRule(r2SecretsRule, "src/__fixtures__/config.ts", src);
    expect(findings).toHaveLength(0);
  });
});
