import { Router } from "express";
import { User } from "../models/user";

export const userRouter = Router();

// VULNERABLE: no authorization guard at all — any caller can fetch any
// user's full profile record, including fields like email and phone.
userRouter.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
});

// VULNERABLE: no authorization guard — any caller can update any user's
// profile fields, including their role.
userRouter.put("/:id", async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(user);
});

// Safe comparison route: this one checks the caller's session before
// touching user data, so ShipCheck should NOT flag it.
userRouter.delete("/:id", async (req, res) => {
  if (!req.session?.user || req.session.user.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await User.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
