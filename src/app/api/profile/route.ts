import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSameOrigin, requireUser } from "@/lib/auth";

const Schema = z.object({ username: z.string().trim().regex(/^[A-Za-z0-9_-]{2,39}$/), email: z.string().email(), github: z.string().url().max(300).optional().or(z.literal("")) });

export async function PATCH(req: NextRequest) {
  const originError = requireSameOrigin(req); if (originError) return originError;
  const auth = await requireUser(); if (auth.response) return auth.response;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile data." }, { status: 400 });
  const { username, github } = parsed.data;
  const { data, error } = await auth.supabase.auth.updateUser({ data: { username, github: github || "" } });
  if (error || !data.user) return NextResponse.json({ error: "Unable to update profile." }, { status: 400 });
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email, username: data.user.user_metadata?.username ?? "", github: data.user.user_metadata?.github ?? "" } });
}
