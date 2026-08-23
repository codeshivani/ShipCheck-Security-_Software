import { NextRequest, NextResponse } from "next/server";
import { getBatch, persistBatch, databaseEnabled } from "@/lib/db";
import { requireSameOrigin, requireUser } from "@/lib/auth";
import { z } from "zod";

const Schema = z.object({ batchId: z.string().min(8).max(100), username: z.string().min(1).max(39), items: z.array(z.unknown()).max(300) });

export async function POST(req: NextRequest) {
  const originError = requireSameOrigin(req); if (originError) return originError;
  const auth = await requireUser(); if (auth.response) return auth.response;
  if (!databaseEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid batch payload." }, { status: 400 });
  try { await persistBatch(parsed.data.batchId, auth.user!.id, parsed.data.username, parsed.data.items); return NextResponse.json({ ok: true }); }
  catch (error) { console.error("Batch persistence failed:", error); return NextResponse.json({ error: "Unable to persist batch report." }, { status: 503 }); }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(); if (auth.response) return auth.response;
  if (!databaseEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const id = req.nextUrl.searchParams.get("batch"); if (!id) return NextResponse.json({ error: "batch is required." }, { status: 400 });
  try { const batch = await getBatch(id, auth.user!.id); if (!batch) return NextResponse.json({ error: "Batch report not found." }, { status: 404 }); return NextResponse.json({ batch }); }
  catch (error) { console.error("Batch lookup failed:", error); return NextResponse.json({ error: "Unable to load batch report." }, { status: 503 }); }
}
