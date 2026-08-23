# Self-scan hardening

ShipCheck previously committed intentionally vulnerable demo applications and
literal secret-like values inside scanner tests. Those files were useful for
rule validation, but they also meant scanning the ShipCheck GitHub repository
reported findings from the test/demo material.

## What changed

- Hardened the three committed demo applications:
  - authorization checks and ownership constraints for user/order access
  - verified JWT handling with environment-provided secrets
  - allowlisted diagnostics using `execFile` without a shell
  - safe numeric arithmetic instead of `eval`
  - environment-only API/signing secrets
- Moved vulnerable demo inputs into temporary test fixtures generated at test
  time. The scanner still gets real R1-R5 true-positive coverage without those
  vulnerable patterns being committed to the product repository.
- Reworked scanner-test secret literals so they are assembled at runtime rather
  than stored as recognizable secret prefixes in the test source.
- Kept the existing context-aware finding model. Findings in real test/example
  repositories can still be surfaced as review-only; this change simply avoids
  shipping intentional vulnerabilities in ShipCheck itself.

## Expected self-scan result

A fresh scan of the ShipCheck repository should no longer report the previous
intentional demo/test findings. If a future finding appears in `src/` or another
production path, it should be treated as a real issue and fixed rather than
hidden by the context classifier.
