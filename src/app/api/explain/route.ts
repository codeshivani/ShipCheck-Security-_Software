import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { getSession } from "@/scanner/session";
import { explainFinding } from "@/ai/explain";
import { getOptionalUser, requireSameOrigin } from "@/lib/auth";

const BodySchema = z.object({ scanId: z.string().min(8).max(100), findingId: z.string().min(8).max(100) });

export async function POST(req: NextRequest) {
  const originError = requireSameOrigin(req); if (originError) return originError;
  const auth = await getOptionalUser(); if (auth.response) return auth.response;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const session = getSession(parsed.data.scanId);
  if (!session || session.userId !== (auth.user?.id ?? null)) return NextResponse.json({ error: "Scan not found for this account." }, { status: 404 });
  const finding = session.report.findings.find(f => f.id === parsed.data.findingId);
  if (!finding) return NextResponse.json({ error: "Finding not found in this scan." }, { status: 404 });
  try {
    const rootDir = await fs.realpath(session.repoDir).catch(() => null);
    if (!rootDir || path.isAbsolute(finding.file) || finding.file.includes("\0")) return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    const absPath = path.resolve(rootDir, finding.file);
    if (!absPath.startsWith(rootDir + path.sep)) return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    const stat = await fs.lstat(absPath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink()) return NextResponse.json({ error: "Invalid file reference." }, { status: 400 });
    const source = await fs.readFile(absPath, "utf-8");
    return NextResponse.json({ result: await explainFinding(finding, source) });
  } catch (err) {
    console.error("Explain error:", err); return NextResponse.json({ error: "Failed to generate explanation." }, { status: 500 });
  }
}
