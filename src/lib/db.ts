import type { ScanReport } from "@/types/reports";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function databaseEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!databaseEnabled()) throw new Error("Database is not configured.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Database request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function persistScan(report: ScanReport, userId?: string | null) {
  if (!databaseEnabled()) return;
  await request("scans", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      scan_id: report.scanId,
      user_id: userId ?? null,
      repo_url: report.repoUrl,
      status: "complete",
      report,
      created_at: report.createdAt,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function updateScan(report: ScanReport) {
  if (!databaseEnabled()) return;
  await request(`scans?scan_id=eq.${encodeURIComponent(report.scanId)}`, {
    method: "PATCH",
    body: JSON.stringify({ report, status: "complete", updated_at: new Date().toISOString() }),
  });
}

export async function listScans(limit = 50) {
  if (!databaseEnabled()) return [];
  return request<Array<{ scan_id: string; repo_url: string; report: ScanReport; created_at: string }>>(
    `scans?select=scan_id,repo_url,report,created_at&order=created_at.desc&limit=${Math.min(Math.max(limit, 1), 200)}`,
  );
}

export async function persistBatch(batchId: string, username: string, items: unknown[]) {
  if (!databaseEnabled()) return;
  await request("batches", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ batch_id: batchId, username, items, created_at: new Date().toISOString() }),
  });
}

export async function getBatch(batchId: string) {
  if (!databaseEnabled()) return null;
  const rows = await request<Array<{ batch_id: string; username: string; items: unknown[]; created_at: string }>>(
    `batches?select=batch_id,username,items,created_at&batch_id=eq.${encodeURIComponent(batchId)}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function createShare(token: string, scanId: string, report: ScanReport, expiresAt: string) {
  if (!databaseEnabled()) throw new Error("Database is not configured.");
  await request("shared_reports", {
    method: "POST",
    body: JSON.stringify({ token, scan_id: scanId, report, expires_at: expiresAt, created_at: new Date().toISOString() }),
  });
}

export async function getShare(token: string) {
  if (!databaseEnabled()) return null;
  const rows = await request<Array<{ token: string; scan_id: string; report: ScanReport; expires_at: string }>>(
    `shared_reports?select=token,scan_id,report,expires_at&token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  return row;
}
