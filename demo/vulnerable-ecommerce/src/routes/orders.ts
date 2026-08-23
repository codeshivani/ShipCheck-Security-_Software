import { Router } from "express";
import { Order } from "../models/order";

export const orderRouter = Router();

function requireUser(req: any, res: any, next: any) {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  next();
}

orderRouter.get("/:orderId", requireUser, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

orderRouter.get("/:orderId/invoice", requireUser, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json({ invoiceUrl: `/files/invoices/${order._id}.pdf` });
});

orderRouter.get("/mine/:orderId", requireUser, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});
