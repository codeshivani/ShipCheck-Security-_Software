# hardened-auth (ShipCheck security demo)

This repository is a hardened comparison application. It intentionally uses
secure authorization checks, environment-provided secrets, and `jwt.verify()`.

The vulnerable examples used by ShipCheck's rule tests are generated in
`tests/scanner/demo-repos.test.ts` at runtime, so the main ShipCheck repository
can be scanned without committing real-looking vulnerable code.
