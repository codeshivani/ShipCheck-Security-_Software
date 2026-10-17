import { describe, it, expect } from "vitest";
import { r4IdorRule } from "@/scanner/rules/r4-idor";
import { runRule, runRuleAcrossFiles } from "./helpers";

describe("R4 — Potential IDOR", () => {
  it("flags a raw request id used in a lookup with no ownership constraint", () => {
    const src = `
      function handler(req, res) {
        const doc = Document.findById(req.params.id);
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("review");
  });

  it("raises high-confidence match when authentication exists but resource ownership is missing", () => {
    const src = `
      function handler(req, res) {
        requireAuth(req);
        const doc = Document.findById(req.params.id);
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("match");
    expect(findings[0].confidence).toBe("high");
  });

  it("does not flag a query constrained by ownership", () => {
    const src = `
      function handler(req, res) {
        const doc = Document.findOne({ id: req.params.id, userId: req.user.id });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("tracks aliases for request ids and authenticated identity", () => {
    const src = `
      function handler(req, res) {
        const requestedId = req.params.id;
        const identityId = req.user.id;
        const doc = Document.findOne({ id: requestedId, ownerId: identityId });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("tracks a second alias hop", () => {
    const src = `
      function handler(req, res) {
        const requestedId = req.params.id;
        const id = requestedId;
        const identityId = req.user.id;
        const owner = identityId;
        const doc = Document.findOne({ id, userId: owner });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("recognizes an explicit identity/resource comparison with rejection", () => {
    const src = `
      function handler(req, res) {
        const requestedId = req.params.id;
        const identityId = req.user.id;
        if (identityId !== requestedId) return res.status(403).end();
        const doc = Document.findById(requestedId);
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("does not treat an unrelated userId variable as ownership evidence", () => {
    const src = `
      function handler(req, res) {
        const userId = req.body.unrelatedValue;
        const doc = Document.findOne({ id: req.params.id, userId });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(1);
  });

  it("detects request identifiers nested in lookup objects", () => {
    const src = `
      function handler(req, res) {
        const doc = Document.findOne({ id: req.params.id });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(1);
  });

  it("does not flag a query constrained by tenant", () => {
    const src = `
      function handler(req, res) {
        const tenantId = req.user.id;
        const doc = Document.findById(req.params.id, { tenantId });
        res.json(doc);
      }
    `;
    const findings = runRule(r4IdorRule, "src/routes/docs.ts", src);
    expect(findings).toHaveLength(0);
  });
});

it("follows a request id and authenticated identity across controller/service modules", () => {
  const findings = runRuleAcrossFiles(r4IdorRule, {
    "routes/users.ts": `
      import { getUser } from '../services/users';
      router.get('/users/:id', getUser);
    `,
    "services/users.ts": `
      import { findUser } from '../repositories/users';
      export function getUser(req, res) {
        return findUser(req.params.id, req.user.id).then(u => res.json(u));
      }
    `,
    "repositories/users.ts": `
      export function findUser(id, userId) {
        return User.findOne({ id, ownerId: userId });
      }
    `,
  });
  expect(findings).toHaveLength(0);
});

it("flags a cross-file IDOR when the service drops the identity constraint", () => {
  const findings = runRuleAcrossFiles(r4IdorRule, {
    "routes/users.ts": `
      import { getUser } from '../services/users';
      router.get('/users/:id', getUser);
    `,
    "services/users.ts": `
      import { findUser } from '../repositories/users';
      export function getUser(req, res) {
        return findUser(req.params.id, req.user.id).then(u => res.json(u));
      }
    `,
    "repositories/users.ts": `
      export function findUser(id, userId) {
        return User.findById(id);
      }
    `,
  });
  expect(findings.length).toBeGreaterThanOrEqual(1);
  expect(findings.some(f => f.status === 'match')).toBe(true);
});
