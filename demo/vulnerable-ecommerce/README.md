# vulnerable-ecommerce (ShipCheck demo repo)

A small orders/products service used to demonstrate ShipCheck's R1 (missing
authorization) and R4 (potential IDOR) rules.

This code is intentionally vulnerable. Do not deploy it.

| File | Rule | Issue |
|---|---|---|
| `src/routes/products.ts` | R1 | `PUT /products/:sku` has no authorization guard |
| `src/routes/orders.ts` | R4 | `GET /orders/:orderId` and `GET /orders/:orderId/invoice` look up orders by a raw request-controlled id with no ownership constraint |

`src/routes/orders.ts`'s `GET /orders/mine/:orderId` route and
`src/routes/products.ts`'s `DELETE /products/:sku` route are intentionally
left safe, as negative controls.
