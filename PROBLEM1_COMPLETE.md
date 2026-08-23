# ShipCheck — Problem 1 Complete

## Goal

Problem 1 was to move ShipCheck from isolated, pattern-heavy JavaScript/TypeScript scanning toward repository-level, evidence-backed analysis.

## Completed architecture

```text
Source files
   ↓
Babel AST index
   ↓
Repository graph
   ├── files
   ├── imports / aliases / namespace imports
   ├── exports / re-exports
   └── function records
   ↓
Interprocedural flow
   ├── identity flow
   ├── resource flow
   └── request-taint flow
   ↓
Security rules
   ├── R1 Authorization
   ├── R4 IDOR
   └── R5 Dynamic Execution
```

## R1

- Resolves imported route handlers.
- Resolves named/default/aliased authorization middleware.
- Recognizes authorization by behavior, not only by function names.
- Follows controller → service calls across files.
- Treats explicit identity/resource authorization as positive evidence.
- Leaves unresolved authorization as unknown instead of assuming it is safe.

## R4

- Tracks request-controlled resource identifiers through aliases and function parameters.
- Tracks authenticated identity values separately.
- Follows controller/service/repository calls across files.
- Recognizes ownership constraints such as `userId`, `ownerId`, `tenantId`, and related fields when their value is proven to originate from the authenticated identity.
- Recognizes explicit identity/resource comparisons followed by access rejection.
- Avoids using an unrelated `userId` variable as ownership evidence.
- Produces review rather than high-confidence match when authentication itself cannot be proven.

## R5

- Preserves single-file taint detection.
- Tracks request taint through aliases, concatenation, templates, arrays, and objects.
- Follows tainted arguments into imported/local functions.
- Supports namespace imports for cross-file call resolution.
- Detects `eval`, `exec`, `execSync`, `spawn`, `spawnSync`, and `new Function` patterns.

## Safety boundaries

- Analysis depth is bounded.
- Cyclic call graphs are protected by a visited set.
- Unresolved imports/calls do not become proof of security.
- Findings remain evidence-backed rather than being generated from an LLM guess.

## Tests added

Regression tests cover:

- imported authorization middleware
- imported controller → service authorization
- cross-file IDOR with ownership constraint
- cross-file IDOR without ownership constraint
- cross-file request taint → dangerous execution sink

## Validation status

The project was packaged successfully. A full `npm ci` could not complete in the execution environment because dependency installation timed out. A direct TypeScript check was also attempted, but the environment lacks the project's installed type dependencies. Therefore this build is **not claimed as fully test-passed in this environment**.

Run locally from the project root:

```bash
npm install
npm test
npm run build
```
