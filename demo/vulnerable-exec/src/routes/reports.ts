import { Router } from "express";
import jwt from "jsonwebtoken";
import { internalConfig } from "../config";

export const reportsRouter = Router();

reportsRouter.get("/:reportId", (req, res) => {
  const rawToken = (req.headers["x-report-token"] as string) ?? "";
  if (!internalConfig.reportSigningSecret) return res.status(503).json({ error: "Signing secret not configured" });
  try {
    const claims = jwt.verify(rawToken, internalConfig.reportSigningSecret) as { permission?: string };
    if (claims.permission !== "restricted") return res.status(403).json({ error: "Insufficient clearance" });
    res.json({ reportId: req.params.reportId, summary: "quarterly financial summary" });
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
});

reportsRouter.get("/:reportId/public", (req, res) => {
  res.json({ reportId: req.params.reportId, summary: "public summary" });
});
