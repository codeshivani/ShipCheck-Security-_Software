import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export const authRouter = Router();

function signingSecret() {
  if (!config.jwtSecret) throw new Error("JWT_SECRET is not configured");
  return config.jwtSecret;
}

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body;
  // Demo credential check omitted for brevity — assume it succeeds.
  if (!username || !password) return res.status(400).json({ error: "Credentials required" });
  const token = jwt.sign({ sub: username, role: "user" }, signingSecret(), { expiresIn: "1h" });
  res.json({ token });
});

authRouter.get("/admin-summary", (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const payload = jwt.verify(rawToken, signingSecret()) as { sub: string; role: string };
    if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    res.json({ totalUsers: 4213, totalRevenue: 918234.12 });
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
});
