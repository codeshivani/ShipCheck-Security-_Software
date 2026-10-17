import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body;
  // (demo) credential check omitted for brevity — assume it succeeds
  void password;
  const token = jwt.sign({ sub: username, role: "user" }, config.jwtSecret, { expiresIn: "1h" });
  res.json({ token });
});

// VULNERABLE: decodes the token without verifying its signature, then trusts
// the decoded "role" claim to make an authorization decision. Anyone can
// forge a token with role: "admin" and this endpoint will grant admin data.
authRouter.get("/admin-summary", (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const rawToken = authHeader.replace("Bearer ", "");

  const payload = jwt.decode(rawToken) as { sub: string; role: string } | null;

  if (!payload || payload.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ totalUsers: 4213, totalRevenue: 918234.12 });
});
