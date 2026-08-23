import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { getSession } from "@/scanner/session";
import { explainFinding } from "@/ai/explain";

const BodySchema = z.object({
  scanId: z.string().min(8).max(100),
  findingId: z.string().min(8).max(100),
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

  const finding = session.report.findings.find((f) => f.id === parsed.data.findingId);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found in this scan." }, { status: 404 });
  }

  try {
    const rootDir = await fs.realpath(session.repoDir).catch(() => null);
    if (!rootDir || path.isAbsolute(finding.file) || finding.file.includes("\0")) {
      return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    }
    const absPath = path.resolve(rootDir, finding.file);
    if (!absPath.startsWith(rootDir + path.sep)) {
      return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    }
    const stat = await fs.lstat(absPath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink()) {
      return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    }
    const source = await fs.readFile(absPath, "utf-8");

    const result = await explainFinding(finding, source);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Explain error:", err);
    return NextResponse.json({ error: "Failed to generate explanation." }, { status: 500 });
  }
}
