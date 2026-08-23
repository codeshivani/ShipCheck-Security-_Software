import { Router } from "express";
import jwt from "jsonwebtoken";

export const reportsRouter = Router();

// VULNERABLE: report access is gated on a decoded-but-unverified token claim.
// An attacker who can craft any JWT-shaped string (no valid signature
// required) can set clearanceLevel and read restricted reports.
reportsRouter.get("/:reportId", (req, res) => {
  const rawToken = (req.headers["x-report-token"] as string) ?? "";
  const claims = jwt.decode(rawToken) as { permission?: string } | null;

  if (!claims || claims.permission !== "restricted") {
    return res.status(403).json({ error: "Insufficient clearance" });
  }

  res.json({ reportId: req.params.reportId, summary: "quarterly financial summary" });
});

// Safe comparison route: this one actually verifies the token's signature
// before trusting its claims, so ShipCheck should NOT flag it.
reportsRouter.get("/:reportId/public", (req, res) => {
  const rawToken = (req.headers["x-report-token"] as string) ?? "";
  try {
    jwt.verify(rawToken, process.env.REPORT_SIGNING_SECRET ?? "");
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
  res.json({ reportId: req.params.reportId, summary: "public summary" });
});
