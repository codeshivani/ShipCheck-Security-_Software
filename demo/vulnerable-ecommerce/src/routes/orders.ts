import { Router } from "express";
import { Order } from "../models/order";

export const orderRouter = Router();

// VULNERABLE: the order id comes straight from the request path and is used
// to look up the order with no check that it belongs to the requesting
// customer — any authenticated user can read any other customer's order by
// guessing/incrementing the id.
orderRouter.get("/:orderId", async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

// VULNERABLE: same pattern via an indirect local variable — the identifier
// is still request-controlled and unconstrained.
orderRouter.get("/:orderId/invoice", async (req, res) => {
  const id = req.params.orderId;
  const order = await Order.findOne({ _id: id });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json({ invoiceUrl: `/files/invoices/${order._id}.pdf` });
});

// Safe comparison route: the lookup is constrained to the authenticated
// customer's own orders, so ShipCheck should NOT flag this one.
orderRouter.get("/mine/:orderId", async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});
