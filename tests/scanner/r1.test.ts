import { describe, it, expect } from "vitest";
import { r1AuthorizationRule } from "@/scanner/rules/r1-authorization";
import { runRule, runRuleAcrossFiles } from "./helpers";

describe("R1 — Missing Endpoint Authorization", () => {
  it("flags a vulnerable route with a sensitive DB op and no guard", () => {
    const src = `
      app.get('/users/:id', function (req, res) {
        User.findById(req.params.id).then(u => res.json(u));
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("R1");
    expect(findings[0].status).toBe("match");
  });

  it("does not flag a route protected by auth middleware", () => {
    const src = `
      app.get('/users/:id', requireAuth, function (req, res) {
        User.findById(req.params.id).then(u => res.json(u));
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("does not flag a handler with an in-body auth check", () => {
    const src = `
      app.post('/users/:id', function (req, res) {
        if (!req.user) return res.status(401).end();
        User.update(req.params.id);
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("does not flag a route with no sensitive operation", () => {
    const src = `
      app.get('/health', function (req, res) {
        res.send('ok');
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/health.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("detects a route on Fastify-style server objects without relying on exact object name", () => {
    const src = `
      server.get('/accounts/:id', async (request, reply) => {
        const account = await Account.findOne({ id: request.params.id });
        return reply.send(account);
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/accounts.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("match");
    expect(findings[0].confidence).toBe("high");
  });

  it("recognizes authorization by semantics even when the middleware name is custom", () => {
    const src = `
      function enforceAccountPolicy(req, res, next) {
        if (!req.user) return res.status(401).end();
        next();
      }

      api.get('/accounts/:id', enforceAccountPolicy, (req, res) => {
        Account.findById(req.params.id).then(a => res.json(a));
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/accounts.ts", src);
    expect(findings).toHaveLength(0);
  });

  it("supports Nest-style route decorators and produces a review finding", () => {
    const src = `
      class AccountController {
        @Get(':id')
        async getAccount(id: string) {
          return this.accountRepository.findOne({ where: { id } });
        }
      }
    `;
    const findings = runRule(r1AuthorizationRule, "src/controllers/account.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("review");
  });

  it("does not treat a harmless API call as a sensitive data operation", () => {
    const src = `
      api.get('/health', async (req, res) => {
        await metrics.get();
        res.json({ ok: true });
      });
    `;
    const findings = runRule(r1AuthorizationRule, "src/routes/health.ts", src);
    expect(findings).toHaveLength(0);
  });
});


it("recognizes a custom authorization middleware imported from another file", () => {
  const findings = runRuleAcrossFiles(r1AuthorizationRule, {
    "src/middleware/account-policy.ts": `
      export function enforceAccountPolicy(req, res, next) {
        if (!req.user) return res.status(401).end();
        if (req.user.role !== 'admin') return res.status(403).end();
        next();
      }
    `,
    "src/routes/accounts.ts": `
      import { enforceAccountPolicy } from '../middleware/account-policy';
      api.get('/accounts/:id', enforceAccountPolicy, (req, res) => {
        Account.findById(req.params.id).then(a => res.json(a));
      });
    `,
  });
  expect(findings).toHaveLength(0);
});

it("recognizes a default-exported authorization middleware imported with an alias", () => {
  const findings = runRuleAcrossFiles(r1AuthorizationRule, {
    "src/middleware/auth.ts": `
      export default function enforcePolicy(req, res, next) {
        if (!req.user) return res.status(401).end();
        next();
      }
    `,
    "src/routes/accounts.ts": `
      import policy from '../middleware/auth';
      router.get('/accounts/:id', policy, (req, res) => {
        Account.findById(req.params.id).then(a => res.json(a));
      });
    `,
  });
  expect(findings).toHaveLength(0);
});

it("does not trust an unresolved cross-file middleware", () => {
  const findings = runRuleAcrossFiles(r1AuthorizationRule, {
    "src/routes/accounts.ts": `
      import policy from '../middleware/missing';
      router.get('/accounts/:id', policy, (req, res) => {
        Account.findById(req.params.id).then(a => res.json(a));
      });
    `,
  });
  expect(findings).toHaveLength(1);
  expect(findings[0].status).toBe('match');
  expect(findings[0].confidence).toBe('high');
});

it("recognizes resource ownership checks through request-id to authenticated-user flow", () => {
  const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", `
    app.get('/users/:id', (req, res) => {
      if (req.user.id !== req.params.id) return res.status(403).end();
      User.findById(req.params.id).then(u => res.json(u));
    });
  `);
  expect(findings).toHaveLength(0);
});

it("recognizes aliased identity/resource ownership checks", () => {
  const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", `
    app.get('/users/:id', (req, res) => {
      const userId = req.user.id;
      const requestedId = req.params.id;
      if (userId !== requestedId) return res.status(403).end();
      User.findById(requestedId).then(u => res.json(u));
    });
  `);
  expect(findings).toHaveLength(0);
});

it("recognizes ownership enforced in a database query", () => {
  const findings = runRule(r1AuthorizationRule, "src/routes/orders.ts", `
    app.get('/orders/:id', (req, res) => {
      return Order.findOne({ id: req.params.id, userId: req.user.id })
        .then(order => res.json(order));
    });
  `);
  expect(findings).toHaveLength(0);
});

it("does not treat an identity comparison without access rejection as authorization", () => {
  const findings = runRule(r1AuthorizationRule, "src/routes/users.ts", `
    app.get('/users/:id', (req, res) => {
      const sameUser = req.user.id === req.params.id;
      console.log(sameUser);
      User.findById(req.params.id).then(u => res.json(u));
    });
  `);
  expect(findings).toHaveLength(1);
});

it("recognizes imported authorization middleware by behavior rather than its name", () => {
  const findings = runRuleAcrossFiles(r1AuthorizationRule, {
    "routes/orders.ts": `
      import { enforceAccountPolicy } from '../security/policy';
      router.get('/orders/:id', enforceAccountPolicy, (req, res) => {
        return Order.findById(req.params.id).then(o => res.json(o));
      });
    `,
    "security/policy.ts": `
      export function enforceAccountPolicy(req, res, next) {
        if (!req.user) return res.status(401).end();
        next();
      }
    `,
  });
  expect(findings).toHaveLength(0);
});

it("recognizes an imported controller whose downstream service performs ownership authorization", () => {
  const findings = runRuleAcrossFiles(r1AuthorizationRule, {
    "routes/users.ts": `
      import { getUser } from '../controllers/users';
      router.get('/users/:id', getUser);
    `,
    "controllers/users.ts": `
      import { loadUser } from '../services/users';
      export function getUser(req, res) {
        return loadUser(req, res);
      }
    `,
    "services/users.ts": `
      export function loadUser(req, res) {
        if (req.user.id !== req.params.id) return res.status(403).end();
        return User.findById(req.params.id).then(u => res.json(u));
      }
    `,
  });
  expect(findings).toHaveLength(0);
});
