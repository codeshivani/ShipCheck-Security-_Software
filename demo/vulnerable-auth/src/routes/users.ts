import { Router } from "express";
import { User } from "../models/user";

export const userRouter = Router();

function requireSessionUser(req: any, res: any, next: any) {
  if (!req.session?.user?.id) return res.status(401).json({ error: "Unauthorized" });
  next();
}

userRouter.get("/:id", requireSessionUser, async (req, res) => {
  if (req.session.user.id !== req.params.id && req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const user = await User.findById(req.params.id).select("email phone role");
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
});

userRouter.put("/:id", requireSessionUser, async (req, res) => {
  if (req.session.user.id !== req.params.id && req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const allowed = (({ email, phone }: { email?: string; phone?: string }) => ({ email, phone }))(req.body ?? {});
  const user = await User.findByIdAndUpdate(req.params.id, allowed, { new: true }).select("email phone role");
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
});

userRouter.delete("/:id", requireSessionUser, async (req, res) => {
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
