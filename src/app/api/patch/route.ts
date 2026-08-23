import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/scanner/session";
import { applyPatch, PatchError } from "@/ai/patch";

const BodySchema = z.object({
  scanId: z.string().min(8).max(100),
  findingId: z.string().min(8).max(100),
  diff: z.string().min(1, "diff is required").max(60_000, "diff is too large"),
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

  const finding = session.report.findings.find((item) => item.id === parsed.data.findingId);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found in this scan." }, { status: 404 });
  }

  try {
    const { filePath } = await applyPatch(session.repoDir, parsed.data.diff, finding.file);
    return NextResponse.json({ appliedTo: filePath });
  } catch (err) {
    if (err instanceof PatchError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("Patch error:", err);
    return NextResponse.json({ error: "Failed to apply patch." }, { status: 500 });
  }
}
