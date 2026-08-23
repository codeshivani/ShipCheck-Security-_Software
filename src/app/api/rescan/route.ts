import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, updateSessionReport } from "@/scanner/session";
import { scanDirectoryWithTimeout, withScanSlot, RepoError } from "@/scanner/scanner";
import { compareScans } from "@/rescan/compare";

const BodySchema = z.object({
  scanId: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const session = getSession(parsed.data.scanId);
  if (!session) {
    return NextResponse.json({ error: "Scan session not found or expired. Please re-scan." }, { status: 404 });
  }

  try {
    const beforeReport = session.report;
    const afterReport = await withScanSlot(() => scanDirectoryWithTimeout(session.repoDir, session.report.repoUrl));

    // The rescan (deterministic scanner output) is the sole authority for
    // whether a finding is resolved — never the AI's own claim.
    updateSessionReport(session.scanId, afterReport);

    const comparison = compareScans(beforeReport, afterReport);
    return NextResponse.json({ comparison, report: afterReport });
  } catch (err) {
    console.error("Rescan error:", err);
    if (err instanceof RepoError) {
      const status = err.code === "SCAN_CAPACITY_REACHED" ? 429 : err.code === "SCAN_TIMEOUT" ? 504 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Rescan failed." }, { status: 500 });
  }
}
