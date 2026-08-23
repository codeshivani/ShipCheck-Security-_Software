import { NextResponse } from "next/server";
import { listScans, databaseEnabled } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser(); if (auth.response) return auth.response;
  if (!databaseEnabled()) return NextResponse.json({ scans: [], database: "not-configured" });
  try {
    const rows = await listScans(auth.user!.id, 100);
    return NextResponse.json({ scans: rows.map(row => row.report), database: "connected" });
  } catch (error) { console.error("History lookup failed:", error); return NextResponse.json({ error: "Unable to load scan history." }, { status: 503 }); }
}
