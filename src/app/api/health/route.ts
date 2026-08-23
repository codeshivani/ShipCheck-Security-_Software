import { NextResponse } from "next/server";
import { databaseEnabled, listScans } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "connected" | "not-configured" | "unavailable" = "not-configured";
  if (databaseEnabled()) {
    try { await listScans("00000000-0000-0000-0000-000000000000", 1); database = "connected"; }
    catch { database = "unavailable"; }
  }
  return NextResponse.json({
    ok: database !== "unavailable",
    service: "shipcheck",
    database,
    time: new Date().toISOString(),
  }, { status: database === "unavailable" ? 503 : 200 });
}
