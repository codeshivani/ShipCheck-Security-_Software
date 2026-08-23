import { NextResponse } from "next/server";
import { listScans, databaseEnabled } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!databaseEnabled()) return NextResponse.json({ scans: [], database: "not-configured" });
  try {
    const rows = await listScans(100);
    return NextResponse.json({ scans: rows.map(row => row.report), database: "connected" });
  } catch (error) {
    console.error("History lookup failed:", error);
    return NextResponse.json({ error: "Unable to load scan history." }, { status: 503 });
  }
}
