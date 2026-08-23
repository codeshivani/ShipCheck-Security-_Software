import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cloneAndScan } from "@/scanner/scanner";
import { RepoError } from "@/scanner/repo/clone";
import { saveSession } from "@/scanner/session";

const BodySchema = z.object({
  repoUrl: z.string().trim().min(1, "repoUrl is required").max(500, "repoUrl is too long"),
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

  try {
    const { report, dir, cleanup } = await cloneAndScan(parsed.data.repoUrl);

    saveSession({
      scanId: report.scanId,
      repoDir: dir,
      cleanup,
      report,
      createdAt: Date.now(),
    });

    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof RepoError) {
      const statusByCode: Record<string, number> = {
        INVALID_URL: 400,
        REPO_TOO_LARGE: 413,
        CLONE_TIMEOUT: 504,
        SCAN_TIMEOUT: 504,
        CLONE_FAILED: 502,
        CLONE_CANCELLED: 499,
        SCAN_CANCELLED: 499,
        SCAN_CAPACITY_REACHED: 429,
      };
      return NextResponse.json({ error: err.message, code: err.code }, { status: statusByCode[err.code] ?? 500 });
    }
    console.error("Unexpected scan error:", err);
    return NextResponse.json({ error: "An unexpected error occurred while scanning." }, { status: 500 });
  }
}
