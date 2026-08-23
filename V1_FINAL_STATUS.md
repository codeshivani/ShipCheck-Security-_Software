# ShipCheck V1 — Final Engineering Status

## Frozen scope

ShipCheck V1 contains exactly five deterministic rules:

- R1 — Missing Endpoint Authorization — CWE-862 — Critical
- R2 — Hardcoded Secret — CWE-798 — Critical
- R3 — Unsafe JWT Handling — CWE-347 — High
- R4 — Potential IDOR — CWE-639 — High
- R5 — Untrusted Dynamic Execution — CWE-95 — Critical

The scanner is the authority. AI only explains and proposes remediation. A deterministic rescan verifies a fix.

## Reliability hardening

- Public GitHub HTTPS URL validation
- GitHub metadata preflight when available
- 150 MB repository ceiling
- 64 MB aggregate source-code scan budget
- 800-file limit
- 1.5 MB per-file limit
- shallow, single-branch clone
- Git metadata removed after checkout
- real Git child-process termination on timeout
- scan cancellation propagation
- bounded rescan timeout
- maximum two concurrent scans
- stale ShipCheck workspace cleanup
- ten-minute session TTL
- symlink-safe source walking
- bounded patch path resolution
- API input size validation

## Detection hardening

- R1 no longer treats generic values such as `session` or `user` as proof of authorization.
- R2 does not blanket-exclude test/fixture files and redacts secret material from evidence.
- R3 no longer treats an unrelated `jwt.verify()` in the same function as proof that a decoded value is verified.
- R4 continues to require evidence of request-controlled identifiers reaching resource lookups and looks for ownership/tenant constraints.
- R5 tracks request-derived aliases into dynamic execution sinks and covers `eval`, `Function`, `new Function`, and child-process execution APIs.

## Evidence and verification

Finding identity includes deterministic evidence anchors and exact duplicates are removed.

Every finding may carry a deterministic, evidence-grounded security flow:

`request → transformation → decision/resource/sink`

A vulnerable edge is explicitly marked. Secrets are redacted. The flow receives a deterministic fingerprint.

If the scanner cannot prove the complete flow, it emits a partial flow rather than inventing architecture.

## Validation status

Source-level TypeScript/TSX syntax validation: **PASS**.

A full dependency installation/build could not be completed in the working environment because `npm ci` timed out before dependencies were fully installed. Therefore a full `npm test` / `npm run build` PASS must be confirmed on the hackathon machine after `npm.cmd install`.

Do not present the dependency-dependent build as passed until it is actually run.

## Remaining V1 limitations

- JavaScript/TypeScript only
- public GitHub repositories only
- no full OWASP coverage
- no dependency/SCA scanning
- no CodeQL/Semgrep integration
- 64 MB aggregate source scan budget
- local in-memory scan sessions
- local demo profile/auth is not production identity management
- project flow is security-relevant evidence, not a complete application architecture map
- cooperative scan cancellation cannot preempt a single synchronous CPU-bound AST operation

These are intentional V1 boundaries, not hidden claims of complete application security.


## V2 hardening in this package

This package adds R6 SQL injection, R7 path traversal, R8 SSRF, direct repository-URL scanning, and `.shipcheckignore` support. ShipCheck's own analyzer implementation is excluded from its self-scan to prevent rule-code false positives.
