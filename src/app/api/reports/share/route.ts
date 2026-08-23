import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/scanner/session";
import { createShare, databaseEnabled } from "@/lib/db";

const Schema = z.object({ scanId: z.string().min(8).max(100) });

export async function POST(req: NextRequest) {
  if (!databaseEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid scan id." }, { status: 400 });
  const session = getSession(parsed.data.scanId);
  if (!session) return NextResponse.json({ error: "Scan session not found or expired." }, { status: 404 });

  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await createShare(token, session.scanId, session.report, expiresAt);
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    console.error("Share creation failed:", error);
    return NextResponse.json({ error: "Unable to create share report." }, { status: 503 });
  }
}
