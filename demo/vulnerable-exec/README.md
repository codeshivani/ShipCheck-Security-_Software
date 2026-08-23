# hardened-exec (ShipCheck security demo)

This repository is a hardened comparison application. Diagnostic commands use
an allowlist and `execFile` without a shell, formulas use a small numeric
allowlist, and JWT claims are verified before authorization decisions.

The vulnerable examples used by ShipCheck's rule tests are generated in
`tests/scanner/demo-repos.test.ts` at runtime.
