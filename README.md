# ShipCheck

**The security gate between AI-generated code and production.**

ShipCheck is a focused security-analysis tool for JavaScript/TypeScript web
applications. It runs eight deterministic static-analysis rules against a
public GitHub repository, produces evidence-backed findings and a transparent
risk score, then hands each finding to an AI layer for a plain-English
explanation and a proposed patch. A deterministic rescan — never the AI's own
say-so — is the sole authority on whether a fix actually worked.

```
GITHUB REPO → SECURE INGESTION → R1–R8 → EVIDENCE + RISK → PROJECT SECURITY FLOW → AI EXPLANATION → PATCH → DETERMINISTIC RESCAN
```

## Non-negotiable architecture

**The LLM does not detect vulnerabilities.** The deterministic scanner (AST-based,
`src/scanner/rules/`) is the sole detection authority. The AI layer
(`src/ai/`) only ever explains, estimates impact, and proposes a minimal patch for
a finding it's handed — it cannot invent findings, change severity, or override
scanner evidence. See `src/ai/prompts.ts` for the system prompt that enforces this.

After a patch is applied, the scanner runs again. **The rescan result — not the
AI's claim — determines whether a finding is resolved.** See
`src/rescan/compare.ts`.

## Quick start

```bash
npm install
npm run dev                  # http://localhost:3000
```

Create `.env.local` from `.env.example` and add your Supabase project URL and
publishable key before using authenticated app features. The scanner, risk
scoring, and rescan comparison do not require an AI key. Without one, ShipCheck
uses deterministic remediation guidance per finding type (see
`src/ai/validator.ts`).

Public GitHub repository scans are available without signing in. Sign in to
access your account dashboard, history, and persistent report sharing.

### Optional AI layer

Set one of these in `.env.local`:

```bash
AI_PROVIDER=anthropic        # or "openai"
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

AI responses are cached to disk (`.shipcheck-cache/`, keyed by
`SHA256(file content) + ruleId`) so repeated demo runs are fast, resilient to
rate limits, and mostly usable offline once warmed. See `src/ai/cache.ts`.

## Running the test suite

```bash
npm test          # vitest run
npm run test:watch
```

The suite covers each rule's true-positive/true-negative cases (`tests/scanner/`),
risk scoring (`tests/risk/`), AI response validation and fallback
(`tests/ai/`), patch application including path-traversal rejection
(`tests/ai/patch.test.ts`), rescan comparison (`tests/rescan/`), and the three
seeded demo repositories scanned end-to-end (`tests/scanner/demo-repos.test.ts`).

## The eight rules

| Rule | CWE | Severity | What it looks for |
|---|---|---|---|
| R1 | CWE-862 | Critical | Route handlers with a sensitive data operation and no recognizable authorization guard |
| R2 | CWE-798 | Critical | Hardcoded secrets — known key prefixes (high confidence) or high-entropy literals in secret-named variables (review) |
| R3 | CWE-347 | High | `jwt.decode()` results trusted for an authorization decision instead of `jwt.verify()` |
| R4 | CWE-639 | High | Request-controlled identifiers reaching a DB lookup with no ownership/tenant constraint |
| R5 | CWE-95 | Critical | Lightweight taint analysis: `req.body`/`query`/`params` flowing into `eval`, `new Function`, or `child_process.exec`-family sinks |
| R6 | CWE-89 | Critical | Request data reaching raw SQL/query sinks |
| R7 | CWE-22 | High | Request data reaching filesystem paths |
| R8 | CWE-918 | High | Request-controlled outbound URLs |

Each rule is deliberately conservative: where framework context is
ambiguous, findings are marked `status: "review"` instead of `"match"`, and
only `"match"` + `"high"` confidence findings affect the ShipCheck Risk Score
(see `src/risk/score.ts`).

All score-bearing findings require deterministic evidence. A clean result does
not prove complete security.

## Risk score

```
score = max(0, 100 - 22×Critical - 12×High - 5×Medium)
90+ A · 75+ B · 60+ C · 40+ D · <40 F
```

This is a transparent prototype metric, not CVSS and not a security
guarantee — see the disclaimer surfaced in the UI and in
`src/risk/score.ts`.

## Demo repositories

Three small, realistic, intentionally-vulnerable repos live in `demo/` for
scanning locally or seeding a live demo:

| Repo | Rules it trips |
|---|---|
| `demo/vulnerable-auth` | R1, R2, R3 |
| `demo/vulnerable-ecommerce` | R1, R4 |
| `demo/vulnerable-exec` | R2, R3, R5 |

Each also contains one or more intentionally-**safe** comparison routes (e.g.
an ownership-constrained query, an auth-guarded handler) as negative
controls, so the rules' precision is visible, not just their recall. See each
repo's `README.md` for a line-by-line breakdown.

To scan one directly without going through GitHub (useful for local
iteration):

```ts
import { scanDirectory } from "@/scanner/scanner";
const report = await scanDirectory("demo/vulnerable-auth", "demo://vulnerable-auth");
```

## Scanning workflow

### Scan by repository URL

The New Scan screen accepts a public GitHub repository URL directly:

`https://github.com/owner/repository`

The existing GitHub-profile batch scanner remains available as a second
workflow.

### Sharing reports

Authenticated users can create read-only report links when persistent
Supabase storage is configured. Share links expire after seven days.

### Analyzer exclusions

A `.shipcheckignore` file can exclude tool-generated or analyzer-only code from
application findings. ShipCheck excludes its own `src/scanner/rules/` and
`src/scanner/analysis/` directories so the scanner does not mistake its rule
definitions and analysis implementation for application vulnerabilities.

## Project-specific security flow

Every finding can carry an evidence-grounded 2D security flow. The graph is derived from the scanned repository rather than generated by the LLM. Vulnerability markers sit on the deterministic vulnerable edge, and each graph has a deterministic fingerprint. When the scanner cannot prove a complete path, it renders a partial flow instead of inventing architecture.

V1 repository ingestion accepts public GitHub repositories up to 150 MB. The scanner also applies a 64 MB aggregate source-code budget, an 800-file limit, and a 1.5 MB per-file limit to keep local scans bounded. Git metadata is removed after checkout because static analysis does not require history.

## Project structure

```
docs/             Deployment and operations documentation
src/
  ai/             AI explanation, validation, caching, and patching
  app/            Next.js pages, UI components, and API routes
  lib/            Authentication, persistence, and Supabase helpers
  rescan/         Deterministic before/after comparison
  risk/           Score and grade calculation
  scanner/        Repository ingestion, AST analysis, and R1–R8
  types/          Finding and report types
demo/             Intentionally vulnerable scanner test/demo repositories
migrations/       Supabase/PostgreSQL schema migrations
scripts/          Local project utilities
tests/            Vitest suites organized by feature area
```

ShipCheck focuses on JavaScript/TypeScript and public GitHub repositories. It
does not provide full OWASP coverage, dependency/SCA scanning, autonomous PRs,
production deployment of generated patches, or a general SAST replacement.

## Safety notes

- The scanner **never executes** cloned repository code — it only reads and
  parses source files (`src/scanner/repo/clone.ts`, `walk.ts`).
- Cloning uses a shallow, single-branch clone into an isolated temp dir with a
  timeout and a size ceiling; symlinks are never followed during the file walk.
- Patch application (`src/ai/patch.ts`) resolves and validates the target path
  stays within the cloned repo directory before writing, rejecting any
  AI-generated diff that tries to escape it.

## Production deployment

ShipCheck supports a persistent PostgreSQL-backed report store. See
[the deployment guide](docs/deployment.md) and `migrations/001_init.sql`.

Recommended topology:

- Railway persistent app service for Next.js + Git/static analysis.
- Supabase PostgreSQL for durable scan reports, batch reports, and share links.
- Ephemeral local workspace for active repository analysis only.

The database stores report metadata/results, not cloned repositories.
