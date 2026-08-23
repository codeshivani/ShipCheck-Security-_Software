# hardened-ecommerce (ShipCheck security demo)

This repository is a hardened comparison application. Resource lookups are
constrained to the authenticated user's identity and product writes require
staff authorization.

The vulnerable examples used by ShipCheck's rule tests are generated in
`tests/scanner/demo-repos.test.ts` at runtime.
