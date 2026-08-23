# vulnerable-auth (ShipCheck demo repo)

A small user-account service used to demonstrate ShipCheck's R1 (missing
authorization), R2 (hardcoded secret), and R3 (unsafe JWT handling) rules.

This code is intentionally vulnerable. Do not deploy it.

| File | Rule | Issue |
|---|---|---|
| `src/config.ts` | R2 | Hardcoded JWT signing secret |
| `src/routes/auth.ts` | R3 | `jwt.decode()` result trusted for an authorization decision |
| `src/routes/users.ts` | R1 | `GET /users/:id` and `PUT /users/:id` have no authorization guard |

`src/routes/users.ts`'s `DELETE /users/:id` route is intentionally left
authorized, as a negative control.
