import { Router } from "express";
import { Product } from "../models/product";

export const productRouter = Router();

// Public catalog browsing — intentionally unauthenticated, this is fine and
// should NOT be flagged (no sensitive data operation, just a public read).
productRouter.get("/", async (req, res) => {
  const products = await Product.find({ published: true });
  res.json(products);
});

// VULNERABLE: no authorization guard — any caller can change a product's
// price or inventory count, not just staff.
productRouter.put("/:sku", async (req, res) => {
  const product = await Product.findOneAndUpdate({ sku: req.params.sku }, req.body, { new: true });
  res.json(product);
});

// Safe comparison route: staff-only middleware protects this write.
productRouter.delete("/:sku", requireStaff, async (req, res) => {
  await Product.findOneAndDelete({ sku: req.params.sku });
  res.status(204).end();
});

function requireStaff(req: any, res: any, next: any) {
  if (!req.user?.isStaff) return res.status(403).json({ error: "Staff only" });
  next();
}
