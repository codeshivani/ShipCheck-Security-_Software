import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, updateSessionReport } from "@/scanner/session";
import { scanDirectoryWithTimeout, withScanSlot, RepoError } from "@/scanner/scanner";
import { compareScans } from "@/rescan/compare";
import { updateScan } from "@/lib/db";
import { getOptionalUser, requireSameOrigin } from "@/lib/auth";

const BodySchema = z.object({ scanId: z.string().min(8).max(100) });

export async function POST(req: NextRequest) {
  const originError = requireSameOrigin(req); if (originError) return originError;
  const auth = await getOptionalUser(); if (auth.response) return auth.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid scan id." }, { status: 400 });
  const session = getSession(parsed.data.scanId);
  if (!session || session.userId !== (auth.user?.id ?? null)) return NextResponse.json({ error: "Scan not found for this account." }, { status: 404 });
  try {
    const beforeReport = session.report;
    const afterReport = await withScanSlot(() => scanDirectoryWithTimeout(session.repoDir, session.report.repoUrl));
    updateSessionReport(session.scanId, afterReport);
    if (auth.user) {
      await updateScan(afterReport, auth.user.id).catch((error) => console.error("Rescan persistence failed:", error));
    }
    return NextResponse.json({ comparison: compareScans(beforeReport, afterReport), report: afterReport });
  } catch (err) {
    console.error("Rescan error:", err);
    if (err instanceof RepoError) {
      const status = err.code === "SCAN_CAPACITY_REACHED" ? 429 : err.code === "SCAN_TIMEOUT" ? 504 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Rescan failed." }, { status: 500 });
  }
}
