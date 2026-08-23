# vulnerable-exec (ShipCheck demo repo)

A small internal admin/dev-tools service used to demonstrate ShipCheck's R2
(hardcoded secret), R3 (unsafe JWT handling), and R5 (untrusted dynamic
execution) rules.

This code is intentionally vulnerable. Do not deploy it.

| File | Rule | Issue |
|---|---|---|
| `src/config.ts` | R2 | Hardcoded internal API key |
| `src/routes/reports.ts` | R3 | `jwt.decode()` result trusted for an authorization decision |
| `src/routes/tools.ts` | R5 | Request body/query flows into `child_process.exec()` and `eval()` |

`src/routes/tools.ts`'s `GET /tools/uptime` route and
`src/routes/reports.ts`'s `GET /reports/:reportId/public` route are
intentionally left safe, as negative controls.
