import { describe, it, expect } from "vitest";
import { r5DynamicExecRule } from "@/scanner/rules/r5-dynamic-exec";
import { runRule, runRuleAcrossFiles } from "./helpers";

describe("R5 — Untrusted Dynamic Execution", () => {
  it("flags request input flowing into eval", () => {
    const src = `
      function handler(req, res) {
        const result = eval(req.body.expression);
        res.json({ result });
      }
    `;
    const findings = runRule(r5DynamicExecRule, "src/routes/calc.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("match");
  });

  it("flags request input flowing into child_process.exec", () => {
    const src = `
      function handler(req, res) {
        child_process.exec(req.query.cmd, (err, stdout) => res.send(stdout));
      }
    `;
    const findings = runRule(r5DynamicExecRule, "src/routes/run.ts", src);
    expect(findings).toHaveLength(1);
  });

  it("does not flag constant eval usage", () => {
    const src = `
      function handler() {
        const result = eval("1 + 1");
        return result;
      }
    `;
    const findings = runRule(r5DynamicExecRule, "src/util.ts", src);
    expect(findings).toHaveLength(0);
  });
});

it("follows request taint across controller and service modules", () => {
  const findings = runRuleAcrossFiles(r5DynamicExecRule, {
    "routes/run.ts": `
      import { runCommand } from '../services/run';
      router.post('/run', runCommand);
    `,
    "services/run.ts": `
      import { execute } from '../lib/execute';
      export function runCommand(req, res) {
        return execute(req.body.command).then(out => res.send(out));
      }
    `,
    "lib/execute.ts": `
      export function execute(command) {
        return child_process.exec(command);
      }
    `,
  });
  expect(findings.some(f => f.ruleId === 'R5')).toBe(true);
});
