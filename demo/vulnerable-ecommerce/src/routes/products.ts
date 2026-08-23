import { Router } from "express";
import { Product } from "../models/product";

export const productRouter = Router();

productRouter.get("/", async (req, res) => {
  const products = await Product.find({ published: true });
  res.json(products);
});

productRouter.put("/:sku", requireStaff, async (req, res) => {
  const allowed = (({ name, price, inventory, published }: { name?: string; price?: number; inventory?: number; published?: boolean }) => ({ name, price, inventory, published }))(req.body ?? {});
  const product = await Product.findOneAndUpdate({ sku: req.params.sku }, allowed, { new: true });
  if (!product) return res.status(404).json({ error: "Not found" });
  res.json(product);
});

productRouter.delete("/:sku", requireStaff, async (req, res) => {
  await Product.findOneAndDelete({ sku: req.params.sku });
  res.status(204).end();
});

function requireStaff(req: any, res: any, next: any) {
  if (!req.user?.isStaff) return res.status(403).json({ error: "Staff only" });
  next();
}
